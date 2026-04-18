import Router from '@koa/router';
import { prisma } from '../infra/postgres.js';

const router = new Router();

router.get('/health', async (ctx) => {
  ctx.body = { status: 'ok', timestamp: Date.now() };
});

router.get('/ready', async (ctx) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    ctx.body = { status: 'ready', db: 'ok' };
  } catch {
    ctx.status = 503;
    ctx.body = { status: 'degraded', db: 'error' };
  }
});

export { router as healthRouter };
