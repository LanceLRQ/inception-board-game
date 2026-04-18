import Router from '@koa/router';
import { AppError } from '../infra/errors.js';

const router = new Router();

// GET /replays/:id - 回放元信息（Phase 4 完整实装）
router.get('/replays/:id', async () => {
  throw new AppError('NOT_FOUND', 'Replay not found (Phase 4)');
});

// GET /replays/:id/events - 全量事件
router.get('/replays/:id/events', async () => {
  throw new AppError('NOT_FOUND', 'Replay events not available (Phase 4)');
});

// GET /replays/:id/download - 回放导出
router.get('/replays/:id/download', async () => {
  throw new AppError('NOT_FOUND', 'Replay download not available (Phase 4)');
});

export { router as replaysRouter };
