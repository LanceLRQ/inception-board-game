// 短链 API
//
// POST /shortlinks   - 创建短链（鉴权）
// GET  /r/:code      - 短链跳转（公开）
//
// 已过期的短链访问时返回 410；记录本身由进程入口每小时清理一次。

import Router from '@koa/router';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { AppError } from '../infra/errors.js';
import { prismaShortLinkStore } from '../services/PrismaShortLinkStore.js';
import { ShortLinkService, type ShortLinkTargetType } from '../services/ShortLinkService.js';

const router = new Router();

const shortLinkService = new ShortLinkService(prismaShortLinkStore);

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

/** 清掉已过期的短链；由进程入口定期调用 */
export function purgeExpiredShortLinks(): Promise<number> {
  return shortLinkService.purgeExpired();
}

export { router as shortLinkRouter };
