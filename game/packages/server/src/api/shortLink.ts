// 短链 API
// 对照：plans/design/07-backend-network.md §7.11 / ADR-033
//
// POST /shortlinks   - 创建短链（鉴权）
// GET  /r/:code      - 短链跳转（公开）

import Router from '@koa/router';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../infra/postgres.js';
import { AppError } from '../infra/errors.js';
import {
  ShortLinkService,
  type ShortLinkRecord,
  type ShortLinkStore,
  type ShortLinkTargetType,
} from '../services/ShortLinkService.js';

const router = new Router();

// === Prisma 适配器 ===

const prismaStore: ShortLinkStore = {
  async findByCode(code: string): Promise<ShortLinkRecord | null> {
    const row = await prisma.shortLink.findUnique({ where: { code } });
    if (!row) return null;
    return {
      code: row.code,
      targetType: row.targetType as ShortLinkTargetType,
      targetId: row.targetId,
      createdByPlayerId: row.createdByPlayerId,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      hitCount: row.hitCount,
      lastHitAt: row.lastHitAt,
    };
  },
  async save(input) {
    const row = await prisma.shortLink.create({
      data: {
        code: input.code,
        targetType: input.targetType,
        targetId: input.targetId,
        createdByPlayerId: input.createdByPlayerId,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
      },
    });
    return {
      code: row.code,
      targetType: row.targetType as ShortLinkTargetType,
      targetId: row.targetId,
      createdByPlayerId: row.createdByPlayerId,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      hitCount: row.hitCount,
      lastHitAt: row.lastHitAt,
    };
  },
  async recordHit(code) {
    await prisma.shortLink
      .update({
        where: { code },
        data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
      })
      .catch(() => {
        /* 统计失败不阻塞 */
      });
  },
  async exists(code) {
    const n = await prisma.shortLink.count({ where: { code } });
    return n > 0;
  },
};

const shortLinkService = new ShortLinkService(prismaStore);

// === POST /shortlinks ===

const createSchema = z.object({
  targetType: z.enum(['room', 'match', 'replay']),
  targetId: z.string().min(1).max(64),
  expiresInMs: z.number().int().nonnegative().optional(),
});

router.post('/shortlinks', authMiddleware, async (ctx) => {
  const { playerId } = ctx.state.player;
  const body = createSchema.parse(ctx.request.body);

  const record = await shortLinkService.create({
    targetType: body.targetType,
    targetId: body.targetId,
    createdByPlayerId: playerId,
    ...(body.expiresInMs !== undefined ? { expiresInMs: body.expiresInMs } : {}),
  });

  ctx.status = 201;
  ctx.body = {
    code: record.code,
    targetType: record.targetType,
    targetId: record.targetId,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
  };
});

// === GET /r/:code → 跳转 ===

router.get('/r/:code', async (ctx) => {
  const code = ctx.params.code ?? '';
  const result = await shortLinkService.resolve(code);
  if (!result.ok) {
    ctx.status = result.reason === 'EXPIRED' ? 410 : 404;
    ctx.body = {
      error: {
        code: result.reason,
        message:
          result.reason === 'EXPIRED'
            ? '链接已过期'
            : result.reason === 'INVALID_CODE'
              ? '链接格式不合法'
              : '链接不存在',
      },
    };
    return;
  }

  const redirectMap: Record<ShortLinkTargetType, string> = {
    room: `/room/${result.record.targetId}`,
    match: `/game/${result.record.targetId}`,
    replay: `/replay/${result.record.targetId}`,
  };

  const target = redirectMap[result.record.targetType];
  if (!target) {
    throw new AppError('VALIDATION_ERROR', 'Unknown link type');
  }
  ctx.redirect(target);
});

export { router as shortLinkRouter };
