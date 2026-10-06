import Router from '@koa/router';
import { z } from 'zod';
import crypto from 'crypto';
import { logger } from '../infra/logger.js';
import { prisma as defaultPrisma } from '../infra/postgres.js';
import { signToken } from '../infra/jwt.js';
import { nicknameSchema } from '../infra/nicknameSchema.js';
import {
  generateRecoveryCode,
  hashRecoveryCode,
  legacyHashRecoveryCode,
} from '../infra/recoveryCode.js';
import { AppError } from '../infra/errors.js';
import { authMiddleware } from '../middleware/auth.js';
import { isBanActive } from '../services/BanChecker.js';
import {
  InMemoryRecoverAttemptLimiter,
  recoverLimitKey,
  type RecoverAttemptLimiter,
} from '../services/RecoverAttemptLimiter.js';

/** 身份接口读写的玩家行 */
export interface IdentityPlayerRow {
  id: string;
  nickname: string;
  avatarSeed: string;
  locale: string;
  createdAt: Date;
  isBanned: boolean;
  banUntil: Date | null;
  banReason: string | null;
}

/** 身份路由实际用到的数据库操作；真实实现是 Prisma 客户端，测试与内存服务用内存表 */
export interface IdentityPrisma extends IdentityTables {
  /** 交互式事务：回调抛错则全部回滚 */
  $transaction<T>(fn: (tx: IdentityTables) => Promise<T>): Promise<T>;
}

/** 事务内外都可用的表操作 */
export interface IdentityTables {
  player: {
    create(args: {
      data: { id: string; nickname: string; avatarSeed: string; locale: string };
    }): Promise<IdentityPlayerRow>;
    findUnique(args: { where: { id: string } }): Promise<IdentityPlayerRow | null>;
    update(args: {
      where: { id: string };
      data: {
        nickname?: string;
        avatarSeed?: string;
        locale?: string;
        lastSeenAt?: Date;
        isBanned?: boolean;
        banUntil?: Date | null;
        banReason?: string | null;
      };
    }): Promise<IdentityPlayerRow>;
  };
  recoveryCode: {
    create(args: { data: { codeHash: string; playerId: string } }): Promise<unknown>;
    findUnique(args: { where: { codeHash: string }; include: { player: true } }): Promise<{
      playerId: string;
      revokedAt: Date | null;
      player: IdentityPlayerRow;
    } | null>;
    /** 条件更新：用于一次性作废（只有仍有效的码才会命中）与旧哈希升级 */
    updateMany(args: {
      where: { playerId?: string; codeHash?: string; revokedAt: null };
      data: {
        revokedAt: Date;
        codeHash?: string;
        lastUsedAt?: Date;
        useCount?: { increment: number };
      };
    }): Promise<{ count: number }>;
    findMany(args: {
      where: { playerId: string; revokedAt: null };
      orderBy: { createdAt: 'desc' };
      take: number;
    }): Promise<Array<{ createdAt: Date }>>;
  };
}

/** 身份路由；数据库访问由调用方注入，缺省用全局客户端 */
export function createIdentityRouter(
  deps: { prisma?: IdentityPrisma; recoverLimiter?: RecoverAttemptLimiter } = {},
): Router {
  const prisma = deps.prisma ?? (defaultPrisma as unknown as IdentityPrisma);
  const recoverLimiter = deps.recoverLimiter ?? new InMemoryRecoverAttemptLimiter();
  const router = new Router();

  // POST /identity/init - 首次访问建档
  const initSchema = z.object({
    nickname: nicknameSchema.default('旅行者'),
    locale: z.string().default('zh-CN'),
    fingerprint: z.string().optional(),
  });

  router.post('/identity/init', async (ctx) => {
    const body = initSchema.parse(ctx.request.body);

    const avatarSeed = crypto.randomInt(1, 100000).toString();
    const playerId = crypto.randomUUID();

    const player = await prisma.player.create({
      data: {
        id: playerId,
        nickname: body.nickname,
        avatarSeed,
        locale: body.locale,
      },
    });

    // 生成恢复码
    const recoveryCode = generateRecoveryCode();
    const codeHash = hashRecoveryCode(recoveryCode);

    await prisma.recoveryCode.create({
      data: { codeHash, playerId: player.id },
    });

    const token = signToken({ playerId: player.id, nickname: player.nickname });

    ctx.status = 201;
    ctx.body = {
      playerId: player.id,
      nickname: player.nickname,
      token,
      expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
      recoveryCode,
      recoveryCodeWarning: '此码只显示一次，请妥善保存，可用于换设备时恢复账号',
    };
  });

  // POST /identity/recover - 凭恢复码恢复身份
  const recoverSchema = z.object({
    code: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/i),
    fingerprint: z.string().optional(),
  });

  router.post('/identity/recover', async (ctx) => {
    const ip = recoverLimitKey(ctx.ip);
    // 限速组件出故障时放行：不能因为 Redis 不可用把正常用户挡在门外
    try {
      if (await recoverLimiter.isBlocked(ip)) {
        throw new AppError('RATE_LIMITED', '恢复尝试过于频繁，请稍后再试');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.warn({ err }, 'recover limiter check failed, allowing request');
    }

    const { code } = recoverSchema.parse(ctx.request.body);

    const fail = async (): Promise<never> => {
      try {
        await recoverLimiter.recordFailure(ip);
      } catch (err) {
        logger.warn({ err }, 'recover limiter record failed');
      }
      throw new AppError('INVALID_RECOVERY_CODE', '恢复码无效或已失效');
    };

    // 先按现行哈希查；查不到再按旧的无盐哈希查，命中的旧记录在下面改写为现行哈希
    let storedHash = hashRecoveryCode(code);
    let record = await prisma.recoveryCode.findUnique({
      where: { codeHash: storedHash },
      include: { player: true },
    });
    let legacy = false;
    if (!record) {
      const legacyHash = legacyHashRecoveryCode(code);
      record = await prisma.recoveryCode.findUnique({
        where: { codeHash: legacyHash },
        include: { player: true },
      });
      if (record) {
        legacy = true;
        storedHash = legacyHash;
      }
    }

    if (!record || record.revokedAt || isBanActive(record.player)) return fail();

    // 一次性：条件更新只会让仍有效的码命中，并发提交同一个码只有一个成功
    // 作废旧码与签发新码放进同一个事务：中途失败时旧码仍然有效，账号不会落到没有任何可用恢复码
    const playerId = record.playerId;
    const newCode = generateRecoveryCode();
    const claimed = await prisma.$transaction(async (tx) => {
      const used = await tx.recoveryCode.updateMany({
        where: { codeHash: storedHash, revokedAt: null },
        data: {
          revokedAt: new Date(),
          lastUsedAt: new Date(),
          useCount: { increment: 1 },
          ...(legacy ? { codeHash: hashRecoveryCode(code) } : {}),
        },
      });
      if (used.count === 0) return false;
      await tx.recoveryCode.create({
        data: { codeHash: hashRecoveryCode(newCode), playerId },
      });
      await tx.player.update({
        where: { id: playerId },
        data: { lastSeenAt: new Date() },
      });
      return true;
    });
    if (!claimed) return fail();

    const token = signToken({ playerId: record.playerId, nickname: record.player.nickname });

    ctx.body = {
      playerId: record.playerId,
      nickname: record.player.nickname,
      token,
      expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
      recoveryCode: newCode,
      recoveryCodeWarning: '此码只显示一次，请妥善保存；刚用过的恢复码已失效',
    };
  });

  // GET /identity/me - 当前玩家信息
  router.get('/identity/me', authMiddleware, async (ctx) => {
    const { playerId } = ctx.state.player;
    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new AppError('NOT_FOUND', 'Player not found');

    ctx.body = {
      playerId: player.id,
      nickname: player.nickname,
      avatarSeed: player.avatarSeed,
      locale: player.locale,
      createdAt: player.createdAt,
    };
  });

  // PATCH /identity/me - 修改昵称/头像
  const updateMeSchema = z.object({
    nickname: nicknameSchema.optional(),
    avatarSeed: z.string().optional(),
    locale: z.string().optional(),
  });

  router.patch('/identity/me', authMiddleware, async (ctx) => {
    const { playerId } = ctx.state.player;
    const data = updateMeSchema.parse(ctx.request.body);

    const player = await prisma.player.update({
      where: { id: playerId },
      data: {
        ...data,
        lastSeenAt: new Date(),
      },
    });

    // 昵称变了需要重新签 token
    let token: string | undefined;
    if (data.nickname) {
      token = signToken({ playerId: player.id, nickname: player.nickname });
    }

    ctx.body = {
      playerId: player.id,
      nickname: player.nickname,
      avatarSeed: player.avatarSeed,
      locale: player.locale,
      ...(token && { token }),
    };
  });

  // POST /identity/rotate-recovery-code - 轮换恢复码
  router.post('/identity/rotate-recovery-code', authMiddleware, async (ctx) => {
    const { playerId } = ctx.state.player;

    // 作废旧码与建新码在同一事务内，建新码失败时旧码不会丢
    const newCode = generateRecoveryCode();
    const codeHash = hashRecoveryCode(newCode);
    await prisma.$transaction(async (tx) => {
      await tx.recoveryCode.updateMany({
        where: { playerId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.recoveryCode.create({ data: { codeHash, playerId } });
    });

    ctx.body = { code: newCode, oldRevoked: true };
  });

  // GET /identity/recovery-code - 查看当前是否有有效恢复码
  // 恢复码只在签发时明文展示一次；哈希不对外返回，避免被拿去离线穷举
  router.get('/identity/recovery-code', authMiddleware, async (ctx) => {
    const { playerId } = ctx.state.player;
    const codes = await prisma.recoveryCode.findMany({
      where: { playerId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    const latest = codes[0];
    ctx.body = { hasCode: !!latest, createdAt: latest?.createdAt ?? null };
  });

  return router;
}
