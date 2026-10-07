// 回放 API
//
// 端点：
//   GET  /replays/:id            - 元信息（需登录；对局信息 + 事件条数，未结束时不含阵营与胜负）
//   GET  /replays/:id/events     - 全部步骤（游标分页，按观察者座位裁剪）
//   GET  /replays/:id/range      - 步进切片（版本号闭区间，按观察者座位裁剪）
//   GET  /replays/:id/frames     - 帧总览（起止版本号与总步数，播放器进度条用）
//   GET  /replays/:id/download   - 导出（JSON，全部步骤，按观察者座位裁剪）
//   POST /replays/:id/share      - 创建分享短链（base58 + 有效期；复用 ShortLinkService）
//
// 事件来源与裁剪：
//   - 步骤读自对局归档（MatchArchive），归档里的事件含只给点名座位的私密内容，
//     输出前必须按观察者座位过 eventsFor；每步的请求（含私密的 move 参数）不返回
//   - 对局不存在 -> 404；对局未结束 -> 409，不返回任何事件
//   - 观察者：请求带了有效令牌且该账号在这局有真人座位 -> 用该座位；
//     其他情况（没带令牌、令牌无效、不是这局的成员）一律按旁观者，不报 401
//   - 序号一律指版本号（stateID）

import Router from '@koa/router';
import { z } from 'zod';
import { prisma } from '../infra/postgres.js';
import { AppError } from '../infra/errors.js';
import { isUuid } from '../infra/uuid.js';
import { paginationSchema, encodeCursor, decodeCursor } from '../infra/pagination.js';
import { authMiddleware } from '../middleware/auth.js';
import type { MatchArchive, StepRow } from '../match/MatchArchive.js';
import { prismaShortLinkStore } from '../services/PrismaShortLinkStore.js';
import { ShortLinkService } from '../services/ShortLinkService.js';
import { loadFinishedMatch, optionalAccountId, toStepView } from './archiveEvents.js';
import { toMatchOutcome, toMatchPlayerViews, type MatchMetaRow } from './matchMeta.js';

/** 导出文件里的对局信息 */
export interface ReplayDownloadMeta {
  ruleVariant: string | null;
  playerCount: number | null;
  startedAt: Date;
  endedAt: Date | null;
  winner: string | null;
  winReason: string | null;
  players: Array<{ seat: number; nickname: string; role: string; isBot: boolean }>;
}

export interface ReplaysRouterDeps {
  archive: MatchArchive;
  /** 导出时的对局信息；不给时读数据库 */
  loadDownloadMeta?: (matchID: string) => Promise<ReplayDownloadMeta | null>;
  /** 读对局元信息（含玩家）；不给时读数据库 */
  loadMatch?: (matchID: string) => Promise<MatchMetaRow | null>;
  /** 统计对局事件条数；不给时读数据库 */
  countEvents?: (matchID: string) => Promise<number>;
}

async function loadDownloadMetaFromDb(matchID: string): Promise<ReplayDownloadMeta | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchID },
    include: { matchPlayers: true },
  });
  if (!match) return null;
  return {
    ruleVariant: match.ruleVariant,
    playerCount: match.playerCount,
    startedAt: match.startedAt,
    endedAt: match.endedAt,
    winner: match.winner,
    winReason: match.winReason,
    players: match.matchPlayers.map((mp) => ({
      seat: mp.seat,
      nickname: mp.nickname,
      role: mp.role,
      isBot: mp.isBot,
    })),
  };
}

/** 纯函数：取版本号落在闭区间 [from, to] 内的步骤；任一端缺省表示不限 */
export function sliceByStateID(steps: readonly StepRow[], from?: number, to?: number): StepRow[] {
  return steps.filter(
    (s) => (from === undefined || s.stateID >= from) && (to === undefined || s.stateID <= to),
  );
}

function parseOptionalInt(raw: unknown, name: string): number | undefined {
  if (typeof raw !== 'string') return undefined;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) throw new AppError('VALIDATION_ERROR', `${name} must be int`);
  return n;
}

// === 短链分享：复用 ShortLinkService（targetType='replay'）===
//
// 设计：
//   - 与 api/shortLink.ts 共用同一个数据库适配器（services/PrismaShortLinkStore.ts）
//   - TTL 默认走 ShortLinkService 的 7 天默认；调用方可显式覆盖
//   - 创建前先验证 match 存在（防止生成指向不存在 replay 的死链）

const replayShortLinkService = new ShortLinkService(prismaShortLinkStore);

/**
 * 纯函数：拼接完整分享 URL。
 * - baseUrl 末尾是否带 / 都兼容
 * - 始终走 /r/<code> 短链路由（与 api/shortLink.ts 保持一致）
 */
export function buildShareUrl(baseUrl: string, code: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return `${trimmed}/r/${code}`;
}

/**
 * 业务函数：创建一条 replay 类型短链。
 * - 先校验 match 存在（防死链）
 * - 复用注入的 ShortLinkService（便于单测用 InMemoryStore）
 * - 返回完整 URL + 元信息
 */
export async function createReplayShareLink(
  matchId: string,
  matchExists: (id: string) => Promise<boolean>,
  service: ShortLinkService,
  baseUrl: string,
  createdByPlayerId: string | null,
  expiresInMs?: number,
): Promise<{ code: string; url: string; expiresAt: Date | null; createdAt: Date }> {
  if (!(await matchExists(matchId))) {
    throw new AppError('NOT_FOUND', 'Replay not found');
  }
  const record = await service.create({
    targetType: 'replay',
    targetId: matchId,
    createdByPlayerId,
    ...(expiresInMs !== undefined ? { expiresInMs } : {}),
  });
  return {
    code: record.code,
    url: buildShareUrl(baseUrl, record.code),
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
  };
}

const shareSchema = z.object({
  expiresInMs: z.number().int().nonnegative().optional(),
});

export function createReplaysRouter(deps: ReplaysRouterDeps): Router {
  const router = new Router();
  const { archive } = deps;
  const loadDownloadMeta = deps.loadDownloadMeta ?? loadDownloadMetaFromDb;
  const loadMatch =
    deps.loadMatch ??
    ((matchID: string) =>
      prisma.match.findUnique({ where: { id: matchID }, include: { matchPlayers: true } }));
  const countEvents =
    deps.countEvents ??
    ((matchID: string) =>
      // 只数步骤行：同一张表里还有缺口记录，不能算进步数
      prisma.matchEvent.count({ where: { matchId: matchID, eventKind: 'step' } }));

  // GET /replays/:id - 回放元信息（需登录；未结束时不含阵营与胜负）
  router.get('/replays/:id', authMiddleware, async (ctx) => {
    const { id } = ctx.params;
    const match = isUuid(id!) ? await loadMatch(id!) : null;
    if (!match) throw new AppError('NOT_FOUND', 'Replay not found');

    ctx.body = {
      id: match.id,
      roomId: match.roomId,
      ruleVariant: match.ruleVariant,
      playerCount: match.playerCount,
      startedAt: match.startedAt,
      endedAt: match.endedAt,
      ...toMatchOutcome(match),
      eventCount: await countEvents(id!),
      players: toMatchPlayerViews(match),
    };
  });

  // GET /replays/:id/events - 全部步骤（游标分页）
  //   query: cursor / limit；游标里的序号是版本号。旧的 viewerID 参数已忽略，观察者只取自令牌
  router.get('/replays/:id/events', async (ctx) => {
    const { id } = ctx.params;
    const { cursor, limit } = paginationSchema.parse(ctx.query);
    const after = cursor ? Number(decodeCursor(cursor).stateID) : undefined;
    if (after !== undefined && !Number.isFinite(after)) {
      throw new AppError('VALIDATION_ERROR', 'invalid cursor');
    }

    const { viewer, steps, complete, gaps } = await loadFinishedMatch(
      archive,
      id!,
      await optionalAccountId(ctx.headers.authorization, ctx.state.banChecker),
    );
    const rest = after === undefined ? steps : steps.filter((s) => s.stateID > after);
    const page = rest.slice(0, limit);
    const hasMore = rest.length > limit;
    const last = page[page.length - 1];

    ctx.body = {
      data: page.map((s) => toStepView(s, viewer)),
      nextCursor: hasMore && last ? encodeCursor({ stateID: last.stateID }) : null,
      hasMore,
      viewerID: viewer,
      complete,
      gaps,
    };
  });

  // GET /replays/:id/range - 步进切片
  //   query: from / to：版本号闭区间，任一可省略表示不限边界
  //   返回：data[] + hasPrev / hasNext
  router.get('/replays/:id/range', async (ctx) => {
    const { id } = ctx.params;
    const from = parseOptionalInt(ctx.query.from, 'from');
    const to = parseOptionalInt(ctx.query.to, 'to');
    if (from !== undefined && to !== undefined && from > to)
      throw new AppError('VALIDATION_ERROR', 'from must be <= to');

    const { viewer, steps, complete, gaps } = await loadFinishedMatch(
      archive,
      id!,
      await optionalAccountId(ctx.headers.authorization, ctx.state.banChecker),
    );
    const picked = sliceByStateID(steps, from, to);
    const first = picked[0]?.stateID;
    const last = picked[picked.length - 1]?.stateID;
    const minID = steps[0]?.stateID;
    const maxID = steps[steps.length - 1]?.stateID;

    ctx.body = {
      data: picked.map((s) => toStepView(s, viewer)),
      from: from ?? null,
      to: to ?? null,
      hasPrev: minID !== undefined && first !== undefined && first > minID,
      hasNext: maxID !== undefined && last !== undefined && last < maxID,
      viewerID: viewer,
      complete,
      gaps,
    };
  });

  // GET /replays/:id/frames - 帧总览（播放器进度条初始化用）
  //   返回：{ minMoveCounter, maxMoveCounter, totalFrames }，前两项是起止版本号；不含事件
  router.get('/replays/:id/frames', async (ctx) => {
    const { id } = ctx.params;
    const { steps, complete, gaps } = await loadFinishedMatch(
      archive,
      id!,
      await optionalAccountId(ctx.headers.authorization, ctx.state.banChecker),
    );
    ctx.body = {
      minMoveCounter: steps[0]?.stateID ?? null,
      maxMoveCounter: steps[steps.length - 1]?.stateID ?? null,
      totalFrames: steps.length,
      complete,
      gaps,
    };
  });

  // GET /replays/:id/download - 全量导出（JSON）
  //   全部步骤，按观察者座位裁剪，与 /events 同一规则
  router.get('/replays/:id/download', async (ctx) => {
    const { id } = ctx.params;
    const { viewer, steps, complete, gaps } = await loadFinishedMatch(
      archive,
      id!,
      await optionalAccountId(ctx.headers.authorization, ctx.state.banChecker),
    );
    const meta = await loadDownloadMeta(id!);
    if (!meta) throw new AppError('NOT_FOUND', 'Replay not found');

    ctx.set('Content-Disposition', `attachment; filename="replay-${id}.json"`);
    ctx.body = {
      matchID: id,
      ...meta,
      viewerID: viewer,
      steps: steps.map((s) => toStepView(s, viewer)),
      complete,
      gaps,
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
    };
  });

  // POST /replays/:id/share - 创建分享短链
  //   body: { expiresInMs?: number }
  //   返回：{ code, url, expiresAt, createdAt }
  router.post('/replays/:id/share', authMiddleware, async (ctx) => {
    const { id } = ctx.params;
    const body = shareSchema.parse(ctx.request.body ?? {});
    const { playerId } = ctx.state.player;

    const baseUrl = process.env.PUBLIC_BASE_URL ?? `${ctx.protocol}://${ctx.host}`;
    const result = await createReplayShareLink(
      id!,
      async (mid) => (await prisma.match.count({ where: { id: mid } })) > 0,
      replayShortLinkService,
      baseUrl,
      playerId,
      body.expiresInMs,
    );

    ctx.status = 201;
    ctx.body = result;
  });

  return router;
}
