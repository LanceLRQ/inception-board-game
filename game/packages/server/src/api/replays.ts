// 回放 API
// 对照：plans/design/07-backend-network.md §7.10 回放
// 对照：plans/tasks.md W21 回放系统 启动 batch
//
// 端点：
//   GET /replays/:id            - 元信息（match info + event count）
//   GET /replays/:id/events     - 全量事件（cursor 分页 + viewer 视角过滤）
//   GET /replays/:id/download   - 导出（JSON 全量）
//
// 视角过滤策略：
//   - viewerID 通过 query param 显式传入（暂不强制 auth；对局结束后回放视为公开）
//   - viewerID === undefined → 观战者视角（仅 public visibility 事件）
//   - viewerID 在玩家列表中 → 该玩家视角过滤（master/self/actor+target）
//   - viewerID 不在玩家列表 → 视为观战者
//
// 复用：filterEventLog（@icgame/game-engine）

import Router from '@koa/router';
import { filterEventLog, type EventLogEntry } from '@icgame/game-engine';
import { prisma } from '../infra/postgres.js';
import { AppError } from '../infra/errors.js';
import { paginationSchema, encodeCursor, decodeCursor } from '../infra/pagination.js';

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

export { router as replaysRouter };
