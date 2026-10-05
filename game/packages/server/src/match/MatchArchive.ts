// 对局归档：对局元信息、各座位、逐步记录
//
// 逐步记录里的事件是完整事件（含私密部分），读出来后由调用方按观察者裁剪。

import { createHash } from 'node:crypto';
import type { SetupState } from '@icgame/game-engine/setup';
import type { MatchEvent, MatchState, MoveRequest } from '@icgame/game-engine/runner';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { RoomSeat } from './MatchRoom.js';
import type { MatchSnapshot } from './MatchStore.js';

export interface StepRow {
  matchID: string;
  stateID: number;
  request: MoveRequest;
  events: MatchEvent[];
  at: Date;
}

export interface MatchArchive {
  /** 建局时：写对局元信息与各座位 */
  recordStart(snapshot: MatchSnapshot): Promise<void>;
  appendStep(row: StepRow): Promise<void>;
  recordFinish(
    matchID: string,
    final: MatchState<SetupState>,
    seats: readonly RoomSeat[],
  ): Promise<void>;
  listSteps(matchID: string): Promise<StepRow[]>;
}

export class InMemoryMatchArchive implements MatchArchive {
  readonly started = new Map<string, MatchSnapshot>();
  readonly finished = new Map<string, MatchState<SetupState>>();
  private readonly steps = new Map<string, Map<number, StepRow>>();

  async recordStart(snapshot: MatchSnapshot): Promise<void> {
    this.started.set(snapshot.matchID, structuredClone(snapshot));
  }

  async appendStep(row: StepRow): Promise<void> {
    const rows = this.steps.get(row.matchID) ?? new Map<number, StepRow>();
    this.steps.set(row.matchID, rows);
    if (!rows.has(row.stateID)) rows.set(row.stateID, structuredClone(row));
  }

  async recordFinish(
    matchID: string,
    final: MatchState<SetupState>,
    _seats: readonly RoomSeat[],
  ): Promise<void> {
    this.finished.set(matchID, structuredClone(final));
  }

  async listSteps(matchID: string): Promise<StepRow[]> {
    const rows = [...(this.steps.get(matchID)?.values() ?? [])];
    return structuredClone(rows.sort((a, b) => a.stateID - b.stateID));
  }
}

/** PrismaMatchArchive 实际用到的最小接口，便于测试打桩 */
export interface PrismaArchiveClient {
  match: Pick<PrismaClient['match'], 'upsert' | 'update'>;
  matchPlayer: Pick<PrismaClient['matchPlayer'], 'createMany' | 'update'>;
  matchEvent: Pick<PrismaClient['matchEvent'], 'create' | 'findMany'>;
}

const PRISMA_UNIQUE_VIOLATION = 'P2002';
const WIN_REASON_MAX = 100;

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === PRISMA_UNIQUE_VIOLATION
  );
}

/** 种子只存摘要（64 位十六进制），原文不入库 */
function seedDigest(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

function isStepPayload(p: unknown): p is { request: MoveRequest; events: MatchEvent[] } {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as { request?: unknown; events?: unknown };
  return typeof o.request === 'object' && o.request !== null && Array.isArray(o.events);
}

export class PrismaMatchArchive implements MatchArchive {
  constructor(private readonly prisma: PrismaArchiveClient) {}

  async recordStart(snapshot: MatchSnapshot): Promise<void> {
    const g = snapshot.state.G;
    // 元数据只挑字段：setupData 里有种子，不能整体写入
    const metadata = {
      roomCode: snapshot.roomCode,
      seats: snapshot.seats.map((s) => ({ seat: s.seat, isBot: s.isBot, nickname: s.nickname })),
      setup: {
        numPlayers: snapshot.setup.numPlayers,
        ruleVariant: g.ruleVariant,
        exCardsEnabled: g.exCardsEnabled,
        expansionEnabled: g.expansionEnabled,
      },
    };
    const fields = {
      roomId: snapshot.matchID,
      ruleVariant: g.ruleVariant,
      exEnabled: g.exCardsEnabled,
      expansionEnabled: g.expansionEnabled,
      playerCount: snapshot.setup.numPlayers,
      rngSeed: seedDigest(snapshot.setup.seed),
      metadata,
    };
    await this.prisma.match.upsert({
      where: { id: snapshot.matchID },
      create: { id: snapshot.matchID, startedAt: new Date(snapshot.createdAt), ...fields },
      update: fields,
    });

    const data = snapshot.seats.map((s) => {
      const p = g.players[s.seat];
      const faction = p?.faction ?? 'thief';
      return {
        matchId: snapshot.matchID,
        seat: Number(s.seat),
        playerId: s.isBot ? null : s.playerId,
        nickname: s.nickname.slice(0, 50),
        isBot: s.isBot,
        botLevel: s.isBot ? 'L0' : null,
        role: faction,
        finalFaction: faction,
        characterId: p?.characterId ? p.characterId : 'unknown',
      };
    });
    await this.prisma.matchPlayer.createMany({ data, skipDuplicates: true });
  }

  async appendStep(row: StepRow): Promise<void> {
    try {
      await this.prisma.matchEvent.create({
        data: {
          matchId: row.matchID,
          moveCounter: row.stateID,
          eventKind: 'step',
          payload: { request: row.request, events: row.events } as unknown as object,
          createdAt: row.at,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) return;
      throw err;
    }
  }

  async recordFinish(
    matchID: string,
    final: MatchState<SetupState>,
    seats: readonly RoomSeat[],
  ): Promise<void> {
    const winner = final.G.winner;
    await this.prisma.match.update({
      where: { id: matchID },
      data: {
        endedAt: new Date(),
        winner,
        winReason: final.G.winReason === null ? null : final.G.winReason.slice(0, WIN_REASON_MAX),
      },
    });
    for (const s of seats) {
      const p = final.G.players[s.seat];
      if (!p) continue;
      await this.prisma.matchPlayer.update({
        where: { matchId_seat: { matchId: matchID, seat: Number(s.seat) } },
        data: { finalFaction: p.faction, won: winner === null ? null : p.faction === winner },
      });
    }
  }

  async listSteps(matchID: string): Promise<StepRow[]> {
    const rows = await this.prisma.matchEvent.findMany({
      where: { matchId: matchID, eventKind: 'step' },
      orderBy: { moveCounter: 'asc' },
    });
    const out: StepRow[] = [];
    for (const r of rows) {
      if (!isStepPayload(r.payload)) continue;
      out.push({
        matchID: r.matchId,
        stateID: r.moveCounter,
        request: r.payload.request,
        events: r.payload.events,
        at: r.createdAt,
      });
    }
    return out;
  }
}
