import Router from '@koa/router';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma as defaultPrisma } from '../infra/postgres.js';
import { signToken } from '../infra/jwt.js';
import { generateRecoveryCode } from '../infra/recoveryCode.js';
import { AppError } from '../infra/errors.js';
import { authMiddleware } from '../middleware/auth.js';

/** 身份接口读写的玩家行 */
export interface IdentityPlayerRow {
  id: string;
  nickname: string;
  avatarSeed: string;
  locale: string;
  createdAt: Date;
  isBanned: boolean;
}

/** 身份路由实际用到的数据库操作；真实实现是 Prisma 客户端，测试与内存服务用内存表 */
export interface IdentityPrisma {
  player: {
    create(args: {
      data: { id: string; nickname: string; avatarSeed: string; locale: string };
    }): Promise<IdentityPlayerRow>;
    findUnique(args: { where: { id: string } }): Promise<IdentityPlayerRow | null>;
    update(args: {
      where: { id: string };
      data: { nickname?: string; avatarSeed?: string; locale?: string; lastSeenAt: Date };
    }): Promise<IdentityPlayerRow>;
  };
  recoveryCode: {
    create(args: { data: { codeHash: string; playerId: string } }): Promise<unknown>;
    findUnique(args: { where: { codeHash: string }; include: { player: true } }): Promise<{
      playerId: string;
      revokedAt: Date | null;
      player: IdentityPlayerRow;
    } | null>;
    update(args: {
      where: { codeHash: string };
      data: { lastUsedAt: Date; useCount: { increment: number } };
    }): Promise<unknown>;
    updateMany(args: {
      where: { playerId: string; revokedAt: null };
      data: { revokedAt: Date };
    }): Promise<unknown>;
    findMany(args: {
      where: { playerId: string; revokedAt: null };
      orderBy: { createdAt: 'desc' };
      take: number;
    }): Promise<Array<{ codeHash: string; createdAt: Date }>>;
  };
}

/** 身份路由；数据库访问由调用方注入，缺省用全局客户端 */
export function createIdentityRouter(deps: { prisma?: IdentityPrisma } = {}): Router {
  const prisma = deps.prisma ?? (defaultPrisma as unknown as IdentityPrisma);
  const router = new Router();

  // POST /identity/init - 首次访问建档
  const initSchema = z.object({
    nickname: z.string().min(1).max(30).default('旅行者'),
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
    const codeHash = crypto.createHash('sha256').update(recoveryCode).digest('hex');

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
    const { code } = recoverSchema.parse(ctx.request.body);
    const normalizedCode = code.toUpperCase();
    const codeHash = crypto.createHash('sha256').update(normalizedCode).digest('hex');

    const record = await prisma.recoveryCode.findUnique({
      where: { codeHash },
      include: { player: true },
    });

    if (!record || record.revokedAt || record.player.isBanned) {
      throw new AppError('INVALID_RECOVERY_CODE', '恢复码无效或已失效');
    }

    await prisma.recoveryCode.update({
      where: { codeHash },
      data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
    });

    await prisma.player.update({
      where: { id: record.playerId },
      data: { lastSeenAt: new Date() },
    });

    const token = signToken({ playerId: record.playerId, nickname: record.player.nickname });

    ctx.body = {
      playerId: record.playerId,
      nickname: record.player.nickname,
      token,
      expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
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
    nickname: z.string().min(1).max(30).optional(),
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

    // 作废旧码
    await prisma.recoveryCode.updateMany({
      where: { playerId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const newCode = generateRecoveryCode();
    const codeHash = crypto.createHash('sha256').update(newCode).digest('hex');
    await prisma.recoveryCode.create({ data: { codeHash, playerId } });

    ctx.body = { code: newCode, oldRevoked: true };
  });

  // GET /identity/recovery-code - 查看当前恢复码
  // 注：恢复码存储为 hash，无法逆推，此处仅返回元信息
  router.get('/identity/recovery-code', authMiddleware, async (ctx) => {
    const { playerId } = ctx.state.player;
    const codes = await prisma.recoveryCode.findMany({
      where: { playerId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    if (codes.length === 0 || !codes[0]) {
      ctx.body = { code: null, warning: '无有效恢复码，请先生成' };
      return;
    }

    ctx.body = {
      codeHash: codes[0].codeHash,
      createdAt: codes[0].createdAt,
      warning: '恢复码仅在建档时明文展示一次，如忘记请轮换生成新码',
    };
  });

  return router;
}
