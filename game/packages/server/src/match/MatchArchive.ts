// 对局归档：对局元信息、各座位、逐步记录
//
// 逐步记录里的事件是完整事件（含私密部分），读出来后由调用方按观察者裁剪。

import { createHash } from 'node:crypto';
import { matchOutcome } from '@icgame/game-engine';
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

/** 对局的结束时间与座位归属，供接口层决定回放能否提供、观察者坐哪个座位 */
export interface MatchInfo {
  /** 对局未结束为 null */
  endedAt: Date | null;
  /** 座位号为字符串；Bot 座位的账号为 null */
  seats: Array<{ seat: string; playerId: string | null }>;
}

/** 归档里缺失的一段步骤（起止版本号都包含在内） */
export interface StepGap {
  from: number;
  to: number;
}

export interface MatchArchive {
  /**
   * 建局时：写对局元信息与各座位。
   * 同一个 id 已有记录时（上一次建局被撤销、或覆盖了残留快照）先清掉旧的步骤与座位，
   * 不让另一条时间线的内容混进来。
   */
  recordStart(snapshot: MatchSnapshot): Promise<void>;
  /** 删掉这局全部逐步记录（含缺口行）与座位行；对局行本身保留 */
  resetMatch(matchID: string): Promise<void>;
  /** 删掉步号大于 stateID 的步骤行与缺口行（缺口按结束版本号判断） */
  truncateAfter(matchID: string, stateID: number): Promise<void>;
  appendStep(row: StepRow): Promise<void>;
  recordFinish(
    matchID: string,
    final: MatchState<SetupState>,
    seats: readonly RoomSeat[],
  ): Promise<void>;
  listSteps(matchID: string): Promise<StepRow[]>;
  /** 记一段缺失的步骤；同一个 to 已记过视为已记录 */
  recordGap(matchID: string, fromStateID: number, toStateID: number): Promise<void>;
  listGaps(matchID: string): Promise<StepGap[]>;
  /** 已归档的最大步号；没有步返回 0 */
  lastStepID(matchID: string): Promise<number>;
  /** 对局不存在返回 null */
  matchInfo(matchID: string): Promise<MatchInfo | null>;
}

export class InMemoryMatchArchive implements MatchArchive {
  readonly started = new Map<string, MatchSnapshot>();
  readonly finished = new Map<string, MatchState<SetupState>>();
  private readonly steps = new Map<string, Map<number, StepRow>>();
  private readonly endedAt = new Map<string, Date>();
  /** 缺口按 to 去重，与数据库实现的唯一约束一致 */
  private readonly gaps = new Map<string, Map<number, StepGap>>();

  async recordStart(snapshot: MatchSnapshot): Promise<void> {
    await this.resetMatch(snapshot.matchID);
    this.started.set(snapshot.matchID, structuredClone(snapshot));
  }

  async resetMatch(matchID: string): Promise<void> {
    this.started.delete(matchID);
    this.finished.delete(matchID);
    this.steps.delete(matchID);
    this.endedAt.delete(matchID);
    this.gaps.delete(matchID);
  }

  async truncateAfter(matchID: string, stateID: number): Promise<void> {
    const rows = this.steps.get(matchID);
    if (rows) for (const id of [...rows.keys()]) if (id > stateID) rows.delete(id);
    const gaps = this.gaps.get(matchID);
    if (gaps) for (const to of [...gaps.keys()]) if (to > stateID) gaps.delete(to);
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
    this.endedAt.set(matchID, new Date());
  }

  async matchInfo(matchID: string): Promise<MatchInfo | null> {
    const snap = this.started.get(matchID);
    if (!snap) return null;
    return {
      endedAt: this.endedAt.get(matchID) ?? null,
      seats: snap.seats.map((s) => ({ seat: s.seat, playerId: s.isBot ? null : s.playerId })),
    };
  }

  async listSteps(matchID: string): Promise<StepRow[]> {
    const rows = [...(this.steps.get(matchID)?.values() ?? [])];
    return structuredClone(rows.sort((a, b) => a.stateID - b.stateID));
  }

  async recordGap(matchID: string, fromStateID: number, toStateID: number): Promise<void> {
    const gaps = this.gaps.get(matchID) ?? new Map<number, StepGap>();
    this.gaps.set(matchID, gaps);
    if (!gaps.has(toStateID)) gaps.set(toStateID, { from: fromStateID, to: toStateID });
  }

  async listGaps(matchID: string): Promise<StepGap[]> {
    return [...(this.gaps.get(matchID)?.values() ?? [])]
      .map((g) => ({ ...g }))
      .sort((a, b) => a.from - b.from);
  }

  async lastStepID(matchID: string): Promise<number> {
    let max = 0;
    for (const id of this.steps.get(matchID)?.keys() ?? []) max = Math.max(max, id);
    return max;
  }
}

/** PrismaMatchArchive 实际用到的最小接口，便于测试打桩 */
export interface PrismaArchiveClient {
  match: Pick<PrismaClient['match'], 'upsert' | 'update' | 'findUnique'>;
  matchPlayer: Pick<
    PrismaClient['matchPlayer'],
    'createMany' | 'update' | 'findMany' | 'deleteMany'
  >;
  matchEvent: Pick<PrismaClient['matchEvent'], 'create' | 'findMany' | 'findFirst' | 'deleteMany'>;
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

function isGapPayload(p: unknown): p is StepGap {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as { from?: unknown; to?: unknown };
  return typeof o.from === 'number' && typeof o.to === 'number';
}

function isStepPayload(p: unknown): p is { request: MoveRequest; events: MatchEvent[] } {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as { request?: unknown; events?: unknown };
  return typeof o.request === 'object' && o.request !== null && Array.isArray(o.events);
}

export class PrismaMatchArchive implements MatchArchive {
  constructor(private readonly prisma: PrismaArchiveClient) {}

  /** 步骤行与座位行都只通过 matchId 挂在对局行上，彼此没有外键，删除顺序无所谓 */
  async resetMatch(matchID: string): Promise<void> {
    await this.prisma.matchEvent.deleteMany({ where: { matchId: matchID } });
    await this.prisma.matchPlayer.deleteMany({ where: { matchId: matchID } });
  }

  async truncateAfter(matchID: string, stateID: number): Promise<void> {
    await this.prisma.matchEvent.deleteMany({
      where: { matchId: matchID, moveCounter: { gt: stateID } },
    });
  }

  async recordStart(snapshot: MatchSnapshot): Promise<void> {
    await this.resetMatch(snapshot.matchID);
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
      // 覆盖上一次留下的对局行时，结束信息也要一并清掉
      endedAt: null,
      winner: null,
      winReason: null,
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
    const { winner, reason } = matchOutcome(final.ctx.gameover, final.G);
    await this.prisma.match.update({
      where: { id: matchID },
      data: {
        endedAt: new Date(),
        winner,
        winReason: reason === null ? null : reason.slice(0, WIN_REASON_MAX),
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
      if (r.eventKind !== 'step' || !isStepPayload(r.payload)) continue;
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

  /**
   * 缺口行与步骤行共用 match_events：event_kind = 'gap'，move_counter 取缺口的结束版本号。
   * 缺口的结束步从未落库（被丢弃或在退出时丢失），所以不会与步骤行撞唯一约束；
   * 同一个结束版本号重复记录撞上唯一约束，视为已记录。
   */
  async recordGap(matchID: string, fromStateID: number, toStateID: number): Promise<void> {
    try {
      await this.prisma.matchEvent.create({
        data: {
          matchId: matchID,
          moveCounter: toStateID,
          eventKind: 'gap',
          payload: { from: fromStateID, to: toStateID },
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) return;
      throw err;
    }
  }

  async listGaps(matchID: string): Promise<StepGap[]> {
    const rows = await this.prisma.matchEvent.findMany({
      where: { matchId: matchID, eventKind: 'gap' },
      orderBy: { moveCounter: 'asc' },
    });
    const out: StepGap[] = [];
    for (const r of rows) {
      if (isGapPayload(r.payload)) out.push({ from: r.payload.from, to: r.payload.to });
    }
    return out;
  }

  async lastStepID(matchID: string): Promise<number> {
    const row = await this.prisma.matchEvent.findFirst({
      where: { matchId: matchID, eventKind: 'step' },
      orderBy: { moveCounter: 'desc' },
      select: { moveCounter: true },
    });
    return row?.moveCounter ?? 0;
  }

  async matchInfo(matchID: string): Promise<MatchInfo | null> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchID },
      select: { endedAt: true },
    });
    if (!match) return null;
    const players = await this.prisma.matchPlayer.findMany({
      where: { matchId: matchID },
      select: { seat: true, playerId: true },
      orderBy: { seat: 'asc' },
    });
    return {
      endedAt: match.endedAt,
      seats: players.map((p) => ({ seat: String(p.seat), playerId: p.playerId })),
    };
  }
}
