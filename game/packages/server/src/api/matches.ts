// 对局 API
//
// 端点：
//   GET  /matches/:id          - 对局元信息（需登录；未结束时不含阵营与胜负）
//   GET  /matches/:id/history  - 本局成员可读的整局公开历史（进行中也可读）
//   GET  /matches/:id/events   - 对局步骤（需登录；游标分页，按观察者座位裁剪）
//   POST /matches/local-upload - 人机对局上传（骨架）
//
// events 端点读自对局归档，裁剪规则与回放接口一致：对局未结束返回 409，
// 请求者是这局的真人座位成员就按他的座位裁剪，否则按旁观者；每步的请求不返回。

import Router from '@koa/router';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../infra/postgres.js';
import { AppError } from '../infra/errors.js';
import { isUuid } from '../infra/uuid.js';
import { paginationSchema, decodeCursor } from '../infra/pagination.js';
import type { MatchArchive } from '../match/MatchArchive.js';
import { isComplete, readReplayPage, toStepView } from './archiveEvents.js';
import { toMatchOutcome, toMatchPlayerViews, type MatchMetaRow } from './matchMeta.js';

export interface MatchesRouterDeps {
  archive: MatchArchive;
  /** 读对局元信息（含玩家）；不给时读数据库 */
  loadMatch?: (matchID: string) => Promise<MatchMetaRow | null>;
}

async function loadMatchFromDb(matchID: string): Promise<MatchMetaRow | null> {
  return prisma.match.findUnique({ where: { id: matchID }, include: { matchPlayers: true } });
}

export function createMatchesRouter(deps: MatchesRouterDeps): Router {
  const router = new Router();
  const { archive } = deps;
  const loadMatch = deps.loadMatch ?? loadMatchFromDb;

  // 当局历史只向本局成员提供，始终按旁观者裁剪，连本人的秘密也不带。
  router.get('/matches/:id/history', authMiddleware, async (ctx) => {
    const id = ctx.params.id!;
    const info = isUuid(id) ? await archive.matchInfo(id) : null;
    if (!info) throw new AppError('NOT_FOUND', 'Match not found');
    if (!info.seats.some((seat) => seat.playerId === ctx.state.player.playerId)) {
      throw new AppError('FORBIDDEN', 'Not a match participant');
    }
    const [steps, gaps] = await Promise.all([archive.listSteps(id), archive.listGaps(id)]);
    ctx.body = {
      batches: steps.map((step) => toStepView(step, null)),
      complete: steps.length === 0 ? gaps.length === 0 : isComplete(steps, gaps),
    };
  });

  // GET /matches/:id - 对局元信息（需登录；未结束时不含阵营与胜负）
  router.get('/matches/:id', authMiddleware, async (ctx) => {
    const matchID = ctx.params.id!;
    const match = isUuid(matchID) ? await loadMatch(matchID) : null;
    if (!match) throw new AppError('NOT_FOUND', 'Match not found');

    ctx.body = {
      id: match.id,
      roomId: match.roomId,
      ruleVariant: match.ruleVariant,
      exEnabled: match.exEnabled,
      expansionEnabled: match.expansionEnabled,
      playerCount: match.playerCount,
      startedAt: match.startedAt,
      endedAt: match.endedAt,
      ...toMatchOutcome(match),
      players: toMatchPlayerViews(match),
    };
  });

  // GET /matches/:id/events - 对局步骤（分页）；游标里的序号是版本号
  router.get('/matches/:id/events', authMiddleware, async (ctx) => {
    const { id } = ctx.params;
    const { cursor, limit } = paginationSchema.parse(ctx.query);
    const after = cursor ? Number(decodeCursor(cursor).stateID) : undefined;
    if (after !== undefined && !Number.isFinite(after)) {
      throw new AppError('VALIDATION_ERROR', 'invalid cursor');
    }

    const { data, nextCursor, hasMore, complete, gaps } = await readReplayPage(
      archive,
      id!,
      ctx.state.player.playerId,
      after,
      limit,
    );
    ctx.body = { data, nextCursor, hasMore, complete, gaps };
  });

  // POST /matches/local-upload - 人机对局上传（骨架）
  router.post('/matches/local-upload', authMiddleware, async (ctx) => {
    // 完整实现需要反作弊校验与事件回放验证
    ctx.status = 201;
    ctx.body = { matchID: null, saved: false, message: 'Local match upload (not implemented yet)' };
  });

  return router;
}
