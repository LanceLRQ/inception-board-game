// PrismaMatchEventStore - Prisma 适配器
// 对照：plans/design/03-data-model.md §3.8 match_events
//
// 依赖 Prisma 生成的 matchEvent delegate；唯一约束 (matchId, moveCounter) 保证幂等。
// 落库时序：append → Prisma create → 若唯一冲突（P2002）转为 'DUPLICATE'。

import type { PrismaClient } from '../generated/prisma/client.js';
import type { MatchEventRecord, MatchEventStore } from './MatchEventService.js';

/** Prisma 原生错误代码：https://www.prisma.io/docs/orm/reference/error-reference */
const PRISMA_UNIQUE_VIOLATION = 'P2002';

export class PrismaMatchEventStore implements MatchEventStore {
  constructor(private readonly prisma: PrismaClient) {}

  async append(record: MatchEventRecord): Promise<'OK' | 'DUPLICATE'> {
    try {
      await this.prisma.matchEvent.create({
        data: {
          matchId: record.matchID,
          moveCounter: record.moveCounter,
          eventKind: record.eventKind,
          payload: record.payload as object,
          createdAt: record.createdAt,
        },
      });
      return 'OK';
    } catch (err) {
      if (isUniqueConstraintError(err)) return 'DUPLICATE';
      throw err;
    }
  }

  async listByMatch(matchID: string): Promise<MatchEventRecord[]> {
    const rows = await this.prisma.matchEvent.findMany({
      where: { matchId: matchID },
      orderBy: { moveCounter: 'asc' },
    });
    return rows.map((r) => ({
      matchID: r.matchId,
      moveCounter: r.moveCounter,
      eventKind: r.eventKind,
      payload: (r.payload as Record<string, unknown>) ?? {},
      createdAt: r.createdAt,
    }));
  }

  async clearMatch(matchID: string): Promise<number> {
    const r = await this.prisma.matchEvent.deleteMany({ where: { matchId: matchID } });
    return r.count;
  }

  async countByMatch(matchID: string): Promise<number> {
    return this.prisma.matchEvent.count({ where: { matchId: matchID } });
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return code === PRISMA_UNIQUE_VIOLATION;
}
