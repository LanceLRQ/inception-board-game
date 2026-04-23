// 回放 API
// 对照：plans/design/07-backend-network.md §7.10 回放
// 对照：plans/tasks.md W21 回放系统 启动 batch
//
// 端点：
//   GET  /replays/:id            - 元信息（match info + event count）
//   GET  /replays/:id/events     - 全量事件（cursor 分页 + viewer 视角过滤）
//   GET  /replays/:id/range      - 步进切片（[from,to] 闭区间 + viewer 视角过滤）
//   GET  /replays/:id/frames     - 帧总览（minMC/maxMC/totalFrames，播放器进度条用）
//   GET  /replays/:id/download   - 导出（JSON 全量）
//   POST /replays/:id/share      - 创建分享短链（base58 + TTL；复用 ShortLinkService）
//
// 视角过滤策略：
//   - viewerID 通过 query param 显式传入（暂不强制 auth；对局结束后回放视为公开）
//   - viewerID === undefined → 观战者视角（仅 public visibility 事件）
//   - viewerID 在玩家列表中 → 该玩家视角过滤（master/self/actor+target）
//   - viewerID 不在玩家列表 → 视为观战者
//
// 复用：filterEventLog（@icgame/game-engine）

import Router from '@koa/router';
import { z } from 'zod';
import { filterEventLog, type EventLogEntry } from '@icgame/game-engine';
import { prisma } from '../infra/postgres.js';
import { AppError } from '../infra/errors.js';
import { paginationSchema, encodeCursor, decodeCursor } from '../infra/pagination.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  ShortLinkService,
  type ShortLinkRecord,
  type ShortLinkStore,
  type ShortLinkTargetType,
} from '../services/ShortLinkService.js';

const router = new Router();

/**
 * 纯函数：把原始 DB 事件行（包含 moveCounter/createdAt）转为 EventLogEntry 数组。
 * payload 中读取 actor/targets/visibility（按 broadcaster 写入约定）。
 */
export function rowsToEventLogEntries(
  rows: ReadonlyArray<{
    moveCounter: number;
    eventKind: string;
    payload: unknown;
    createdAt: Date;
  }>,
): EventLogEntry[] {
  return rows.map((e) => {
    const payload = (e.payload as Record<string, unknown>) ?? {};
    return {
      eventKind: e.eventKind,
      actor: typeof payload.actor === 'string' ? payload.actor : undefined,
      targets: Array.isArray(payload.targets)
        ? (payload.targets as unknown[]).filter((t): t is string => typeof t === 'string')
        : undefined,
      visibility:
        typeof payload.visibility === 'string'
          ? (payload.visibility as 'public' | 'self' | 'master' | 'actor+target')
          : 'public',
      payload,
    };
  });
}

/**
 * 纯函数：filterEventLog 后把元字段（moveCounter/createdAt）拼回。
 * 通过 eventKind 顺序对齐（filterEventLog 保持原顺序）。
 */
export function alignFilteredWithMeta(
  rows: ReadonlyArray<{
    moveCounter: number;
    eventKind: string;
    payload: unknown;
    createdAt: Date;
  }>,
  filtered: ReadonlyArray<EventLogEntry>,
): Array<{ moveCounter: number; eventKind: string; payload: unknown; createdAt: Date }> {
  const out: Array<{
    moveCounter: number;
    eventKind: string;
    payload: unknown;
    createdAt: Date;
  }> = [];
  let filteredIdx = 0;
  for (let i = 0; i < rows.length && filteredIdx < filtered.length; i++) {
    const original = rows[i]!;
    const f = filtered[filteredIdx];
    if (f && f.eventKind === original.eventKind) {
      out.push({
        moveCounter: original.moveCounter,
        eventKind: original.eventKind,
        payload: original.payload,
        createdAt: original.createdAt,
      });
      filteredIdx++;
    }
  }
  return out;
}

/**
 * 纯函数：根据 from/to 构造 Prisma where 子句的 moveCounter 范围条件。
 * - from === undefined → 不限下界
 * - to === undefined → 不限上界
 * - 闭区间 [from, to]
 */
export function buildRangeWhere(
  matchId: string,
  from?: number,
  to?: number,
): { matchId: string; moveCounter?: { gte?: number; lte?: number } } {
  const where: { matchId: string; moveCounter?: { gte?: number; lte?: number } } = { matchId };
  if (from !== undefined || to !== undefined) {
    where.moveCounter = {};
    if (from !== undefined) where.moveCounter.gte = from;
    if (to !== undefined) where.moveCounter.lte = to;
  }
  return where;
}

// GET /replays/:id - 回放元信息
router.get('/replays/:id', async (ctx) => {
  const { id } = ctx.params;
  const match = await prisma.match.findUnique({
    where: { id },
    include: { matchPlayers: true },
  });
  if (!match) throw new AppError('NOT_FOUND', 'Replay not found');

  const eventCount = await prisma.matchEvent.count({ where: { matchId: id } });

  ctx.body = {
    id: match.id,
    roomId: match.roomId,
    ruleVariant: match.ruleVariant,
    playerCount: match.playerCount,
    startedAt: match.startedAt,
    endedAt: match.endedAt,
    winner: match.winner,
    winReason: match.winReason,
    eventCount,
    players: match.matchPlayers.map((mp) => ({
      seat: mp.seat,
      nickname: mp.nickname,
      isBot: mp.isBot,
      role: mp.role,
      finalFaction: mp.finalFaction,
      won: mp.won,
    })),
  };
});

// GET /replays/:id/events - 全量事件（cursor 分页 + viewer 视角过滤）
//   query: cursor / limit / viewerID
router.get('/replays/:id/events', async (ctx) => {
  const { id } = ctx.params;
  const { cursor, limit } = paginationSchema.parse(ctx.query);
  const viewerID = (ctx.query.viewerID as string | undefined) ?? null;

  const match = await prisma.match.findUnique({
    where: { id },
    include: { matchPlayers: true },
  });
  if (!match) throw new AppError('NOT_FOUND', 'Replay not found');

  // 解析梦主 seat → playerID（这里 seat 即 playerID 的字符串形式，按现有约定）
  // 假设 matchPlayers.role === 'master' 标记梦主
  const masterPlayer = match.matchPlayers.find((mp) => mp.role === 'master');
  const dreamMasterID = masterPlayer ? String(masterPlayer.seat) : '';

  const events = await prisma.matchEvent.findMany({
    where: {
      matchId: id,
      ...(cursor && { moveCounter: { gt: decodeCursor(cursor).moveCounter as number } }),
    },
    orderBy: { moveCounter: 'asc' },
    take: limit + 1,
  });

  const hasMore = events.length > limit;
  const data = events.slice(0, limit);
  const last = data[data.length - 1];

  // 转为 EventLogEntry 格式 + 视角过滤（纯函数 helper）
  const entries = rowsToEventLogEntries(data);
  const filtered = filterEventLog(entries, viewerID, dreamMasterID);
  const filteredWithMeta = alignFilteredWithMeta(data, filtered);

  ctx.body = {
    data: filteredWithMeta,
    nextCursor: hasMore && last ? encodeCursor({ moveCounter: last.moveCounter }) : null,
    hasMore,
    viewerID,
    totalBeforeFilter: data.length,
    totalAfterFilter: filteredWithMeta.length,
  };
});

// GET /replays/:id/range - 步进切片
//   query: from / to / viewerID
//     - from / to: moveCounter 闭区间。任一可省略表示不限边界。
//     - 用法：跳到第 N 帧 → from=N&to=N；前进 N 帧 → from=cur+1&to=cur+N
//   返回：data[] + hasPrev / hasNext + 视角过滤统计
router.get('/replays/:id/range', async (ctx) => {
  const { id } = ctx.params;
  const fromRaw = ctx.query.from;
  const toRaw = ctx.query.to;
  const from = typeof fromRaw === 'string' ? Number.parseInt(fromRaw, 10) : undefined;
  const to = typeof toRaw === 'string' ? Number.parseInt(toRaw, 10) : undefined;
  if (from !== undefined && Number.isNaN(from))
    throw new AppError('VALIDATION_ERROR', 'from must be int');
  if (to !== undefined && Number.isNaN(to))
    throw new AppError('VALIDATION_ERROR', 'to must be int');
  if (from !== undefined && to !== undefined && from > to)
    throw new AppError('VALIDATION_ERROR', 'from must be <= to');

  const viewerID = (ctx.query.viewerID as string | undefined) ?? null;

  const match = await prisma.match.findUnique({
    where: { id },
    include: { matchPlayers: true },
  });
  if (!match) throw new AppError('NOT_FOUND', 'Replay not found');

  const masterPlayer = match.matchPlayers.find((mp) => mp.role === 'master');
  const dreamMasterID = masterPlayer ? String(masterPlayer.seat) : '';

  const events = await prisma.matchEvent.findMany({
    where: buildRangeWhere(id!, from, to),
    orderBy: { moveCounter: 'asc' },
  });

  // 同时查总帧数边界，给前端 hasPrev/hasNext 信号
  const [minEvt, maxEvt] = await Promise.all([
    prisma.matchEvent.findFirst({ where: { matchId: id! }, orderBy: { moveCounter: 'asc' } }),
    prisma.matchEvent.findFirst({ where: { matchId: id! }, orderBy: { moveCounter: 'desc' } }),
  ]);

  const entries = rowsToEventLogEntries(events);
  const filtered = filterEventLog(entries, viewerID, dreamMasterID);
  const filteredWithMeta = alignFilteredWithMeta(events, filtered);

  const firstMC = events[0]?.moveCounter;
  const lastMC = events[events.length - 1]?.moveCounter;
  const hasPrev = minEvt !== null && firstMC !== undefined && firstMC > minEvt.moveCounter;
  const hasNext = maxEvt !== null && lastMC !== undefined && lastMC < maxEvt.moveCounter;

  ctx.body = {
    data: filteredWithMeta,
    from: from ?? null,
    to: to ?? null,
    hasPrev,
    hasNext,
    viewerID,
    totalBeforeFilter: events.length,
    totalAfterFilter: filteredWithMeta.length,
  };
});

// GET /replays/:id/frames - 帧总览（播放器进度条初始化用）
//   返回：{ minMoveCounter, maxMoveCounter, totalFrames }
//   不做视角过滤（统计原始事件总数；视角下事件子集需要拉 /events 后客户端计算）
router.get('/replays/:id/frames', async (ctx) => {
  const { id } = ctx.params;
  const match = await prisma.match.findUnique({ where: { id } });
  if (!match) throw new AppError('NOT_FOUND', 'Replay not found');

  const [minEvt, maxEvt, total] = await Promise.all([
    prisma.matchEvent.findFirst({ where: { matchId: id }, orderBy: { moveCounter: 'asc' } }),
    prisma.matchEvent.findFirst({ where: { matchId: id }, orderBy: { moveCounter: 'desc' } }),
    prisma.matchEvent.count({ where: { matchId: id } }),
  ]);

  ctx.body = {
    minMoveCounter: minEvt?.moveCounter ?? null,
    maxMoveCounter: maxEvt?.moveCounter ?? null,
    totalFrames: total,
  };
});

// GET /replays/:id/download - 全量导出（JSON）
//   不分页 / 不过滤（导出原始数据，留给客户端按需过滤）
//   仅梦主或对局参与者可下载（authMiddleware 后续接入；当前对局结束后视为公开）
router.get('/replays/:id/download', async (ctx) => {
  const { id } = ctx.params;
  const match = await prisma.match.findUnique({
    where: { id },
    include: { matchPlayers: true },
  });
  if (!match) throw new AppError('NOT_FOUND', 'Replay not found');

  const events = await prisma.matchEvent.findMany({
    where: { matchId: id },
    orderBy: { moveCounter: 'asc' },
  });

  ctx.set('Content-Disposition', `attachment; filename="replay-${id}.json"`);
  ctx.body = {
    matchID: match.id,
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
    events: events.map((e) => ({
      moveCounter: e.moveCounter,
      eventKind: e.eventKind,
      payload: e.payload,
      createdAt: e.createdAt,
    })),
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
  };
});

// === 短链分享：复用 ShortLinkService（targetType='replay'）===
//
// 设计：
//   - 此处建立模块内 ShortLinkStore（与 api/shortLink.ts 中的实现等价）
//     之所以不抽公共模块，是为了保持 ShortLinkService 单测可注入 InMemoryStore
//     的灵活性；后续若需统一可独立成 infra/shortLinkPrismaStore.ts
//   - TTL 默认走 ShortLinkService 的 7 天默认；调用方可显式覆盖
//   - 创建前先验证 match 存在（防止生成指向不存在 replay 的死链）

const replayShortLinkStore: ShortLinkStore = {
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
      .update({ where: { code }, data: { hitCount: { increment: 1 }, lastHitAt: new Date() } })
      .catch(() => {});
  },
  async exists(code) {
    return (await prisma.shortLink.count({ where: { code } })) > 0;
  },
};

const replayShortLinkService = new ShortLinkService(replayShortLinkStore);

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

// POST /replays/:id/share - 创建分享短链
//   body: { expiresInMs?: number }
//   返回：{ code, url, expiresAt, createdAt }
const shareSchema = z.object({
  expiresInMs: z.number().int().nonnegative().optional(),
});

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

export { router as replaysRouter };
