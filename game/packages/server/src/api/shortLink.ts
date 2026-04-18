import Router from '@koa/router';
import { prisma } from '../infra/postgres.js';

const router = new Router();

// GET /r/:code - 短链跳转
router.get('/r/:code', async (ctx) => {
  const { code } = ctx.params;
  const link = await prisma.shortLink.findUnique({ where: { code } });

  if (!link || (link.expiresAt && link.expiresAt < new Date())) {
    ctx.status = 404;
    ctx.body = { error: { code: 'NOT_FOUND', message: '链接已失效或不存在' } };
    return;
  }

  // 更新访问统计
  await prisma.shortLink
    .update({
      where: { code },
      data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
    })
    .catch(() => {});

  // 根据 targetType 跳转
  const redirectMap: Record<string, string> = {
    room: `/room/${link.targetId}`,
    match: `/game/${link.targetId}`,
    replay: `/replay/${link.targetId}`,
  };

  const target = redirectMap[link.targetType];
  if (target) {
    ctx.redirect(target);
  } else {
    ctx.status = 400;
    ctx.body = { error: { code: 'VALIDATION_ERROR', message: 'Unknown link type' } };
  }
});

export { router as shortLinkRouter };
