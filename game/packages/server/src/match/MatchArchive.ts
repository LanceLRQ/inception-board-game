// 对局归档：对局元信息、各座位、逐步记录
//
// 逐步记录里的事件是完整事件（含私密部分），读出来后由调用方按观察者裁剪。

import { createHash } from 'node:crypto';
import { matchOutcome } from '@icgame/game-engine';
import type { SetupState } from '@icgame/game-engine/setup';
import type { MatchEvent, MatchState, MoveRequest } from '@icgame/game-engine/runner';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { buildAchievementRows } from '../seed/seed.js';
import {
  computeEarnedAchievements,
  type AchievementPlayerInput,
} from '../services/achievements.js';
import { computeMvpResults, type MvpPlayerStats } from '../services/mvpScore.js';
import type { RoomSeat } from './MatchRoom.js';
import type { MatchSnapshot } from './MatchStore.js';
import { readColdReplay, type ColdEvent, type ReplayObjectStore } from './ColdReplay.js';

export interface StepRow {
  matchID: string;
  stateID: number;
  request: MoveRequest;
  events: MatchEvent[];
  at: Date;
}

export interface StepQuery {
  from?: number;
  to?: number;
  take?: number;
}

export interface StepSummary {
  min: number | null;
  max: number | null;
  count: number;
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

export interface RoomMatchResult {
  id: string;
  scored: boolean;
  scores: Array<{ playerId: string; nickname: string; score: number }>;
}

function matchScore(G: SetupState, seat: RoomSeat, won: boolean | null): number | null {
  if (seat.isBot || seat.departed || won === null) return null;
  if (!won) return 0;
  const shattered = G.bribePool.some((card) => card.kind === 'fail' && card.heldBy === seat.seat);
  return G.players[seat.seat]?.faction === 'thief' && shattered ? 4 : 3;
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
  /** 主动中止：记录结束时间，不公开阵营、不产生胜负。 */
  recordStop(matchID: string): Promise<void>;
  listSteps(matchID: string, query?: StepQuery): Promise<StepRow[]>;
  stepSummary(matchID: string): Promise<StepSummary>;
  /** 记一段缺失的步骤；同一个 to 已记过视为已记录 */
  recordGap(matchID: string, fromStateID: number, toStateID: number): Promise<void>;
  listGaps(matchID: string): Promise<StepGap[]>;
  /** 已归档的最大步号；没有步返回 0 */
  lastStepID(matchID: string): Promise<number>;
  /** 对局不存在返回 null */
  matchInfo(matchID: string): Promise<MatchInfo | null>;
  roomResults?(roomId: string): Promise<RoomMatchResult[]>;
}

export class InMemoryMatchArchive implements MatchArchive {
  readonly started = new Map<string, MatchSnapshot>();
  readonly finished = new Map<string, MatchState<SetupState>>();
  private readonly steps = new Map<string, Map<number, StepRow>>();
  private readonly endedAt = new Map<string, Date>();
  private readonly finishedSeats = new Map<string, readonly RoomSeat[]>();
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
    this.finishedSeats.delete(matchID);
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
    seats: readonly RoomSeat[],
  ): Promise<void> {
    this.finished.set(matchID, structuredClone(final));
    this.finishedSeats.set(matchID, structuredClone(seats));
    this.endedAt.set(matchID, new Date());
  }

  async recordStop(matchID: string): Promise<void> {
    this.endedAt.set(matchID, new Date());
  }

  async roomResults(roomId: string): Promise<RoomMatchResult[]> {
    const results: RoomMatchResult[] = [];
    for (const [id, snapshot] of this.started) {
      if ((snapshot.roomId ?? id) !== roomId || !this.endedAt.has(id)) continue;
      const final = this.finished.get(id);
      const winner = final ? matchOutcome(final.ctx.gameover, final.G).winner : null;
      const scores = (this.finishedSeats.get(id) ?? []).flatMap((seat) => {
        if (!final || !seat.playerId || winner === null) return [];
        const score = matchScore(final.G, seat, final.G.players[seat.seat]?.faction === winner);
        return score === null ? [] : [{ playerId: seat.playerId, nickname: seat.nickname, score }];
      });
      results.push({ id, scored: winner !== null, scores });
    }
    return results;
  }

  async matchInfo(matchID: string): Promise<MatchInfo | null> {
    const snap = this.started.get(matchID);
    if (!snap) return null;
    return {
      endedAt: this.endedAt.get(matchID) ?? null,
      seats: snap.seats.map((s) => ({ seat: s.seat, playerId: s.isBot ? null : s.playerId })),
    };
  }

  async listSteps(
    matchID: string,
    { from = -Infinity, to = Infinity, take }: StepQuery = {},
  ): Promise<StepRow[]> {
    const rows = [...(this.steps.get(matchID)?.values() ?? [])]
      .filter((row) => row.stateID >= from && row.stateID <= to)
      .sort((a, b) => a.stateID - b.stateID);
    return structuredClone(rows.slice(0, take));
  }

  async stepSummary(matchID: string): Promise<StepSummary> {
    const rows = this.steps.get(matchID);
    if (!rows?.size) return { min: null, max: null, count: 0 };
    let min = Infinity;
    let max = -Infinity;
    for (const id of rows.keys()) {
      min = Math.min(min, id);
      max = Math.max(max, id);
    }
    return { min, max, count: rows.size };
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
  $queryRaw: PrismaClient['$queryRaw'];
  $transaction: PrismaClient['$transaction'];
  match: Pick<PrismaClient['match'], 'upsert' | 'update' | 'findUnique' | 'findMany'>;
  matchPlayer: Pick<
    PrismaClient['matchPlayer'],
    'createMany' | 'update' | 'findMany' | 'deleteMany'
  >;
  matchEvent: Pick<PrismaClient['matchEvent'], 'create' | 'findMany' | 'findFirst' | 'deleteMany'>;
  achievement: Pick<PrismaClient['achievement'], 'createMany'>;
  playerAchievement: Pick<PrismaClient['playerAchievement'], 'createMany'>;
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
  private readonly coldReads = new Map<string, Promise<ColdEvent[]>>();

  constructor(
    private readonly prisma: PrismaArchiveClient,
    private readonly objects?: ReplayObjectStore,
  ) {}

  private async coldEvents(matchID: string): Promise<ColdEvent[]> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchID },
      select: { replayArchiveKey: true },
    });
    const key = match?.replayArchiveKey;
    if (!key) return [];
    if (!this.objects) throw new Error('Replay archive storage is not configured');
    let pending = this.coldReads.get(key);
    if (!pending) {
      pending = readColdReplay(this.objects, key).finally(() => this.coldReads.delete(key));
      this.coldReads.set(key, pending);
    }
    return pending;
  }

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
      roomId: snapshot.roomId ?? snapshot.matchID,
      ruleVariant: g.ruleVariant,
      exEnabled: g.exCardsEnabled,
      expansionEnabled: g.expansionEnabled,
      playerCount: snapshot.setup.numPlayers,
      rngSeed: seedDigest(snapshot.setup.seed),
      metadata,
      // 覆盖上一次留下的对局行时，结束信息也要一并清掉
      endedAt: null,
      replayArchiveKey: null,
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
    const { G } = final;
    const { winner, reason } = matchOutcome(final.ctx.gameover, G);
    const participants = seats.filter((s) => !s.isBot && s.playerId !== null);
    const awards: Array<{ playerId: string; achievementId: string }> = [];
    const mvpBySeat = new Map<string, ReturnType<typeof computeMvpResults>[number]>();
    if (winner !== null && participants.length > 0) {
      const counters = new Map(
        participants.map(({ seat }) => [
          seat,
          {
            diedCount: 0,
            damageDealt: 0,
            turnsTaken: 0,
            cardsPlayed: 0,
            reviveCount: 0,
            unlockCanceledCount: 0,
            vaultOpenedByYou: 0,
          },
        ]),
      );
      for (const { events, request } of await this.listSteps(matchID)) {
        for (const { kind, actor, data } of events) {
          const acting = actor === null ? undefined : counters.get(actor);
          const player = typeof data.player === 'string' ? counters.get(data.player) : undefined;
          if (kind === 'player_died' && typeof data.cause === 'string') {
            const killer = counters.get(data.cause);
            if (player) player.diedCount++;
            if (killer) killer.damageDealt++;
          } else if (kind === 'turn_started' && typeof data.owner === 'string') {
            const owner = counters.get(data.owner);
            if (owner) owner.turnsTaken++;
          } else if (kind === 'card_played' && player) {
            player.cardsPlayed++;
          } else if (kind === 'player_revived' && acting && actor !== data.player) {
            acting.reviveCount++;
          } else if (
            kind === 'unlock_resolved' &&
            data.success === false &&
            request.move === 'respondCancelUnlock' &&
            acting
          ) {
            acting.unlockCanceledCount++;
          } else if (kind === 'vault_opened' && typeof data.openedBy === 'string') {
            const opener = counters.get(data.openedBy);
            if (opener) opener.vaultOpenedByYou++;
          }
        }
      }
      const achievements: AchievementPlayerInput[] = [];
      const mvpStats: MvpPlayerStats[] = [];
      for (const s of participants) {
        const p = G.players[s.seat];
        const counts = counters.get(s.seat);
        if (!p || !counts) continue;
        const stats = {
          faction: p.faction,
          kills: p.shootCount,
          unlockSuccessCount: p.unlockCount,
          bribesReceived: p.bribeReceived,
        };
        const result = p.faction === winner ? 'win' : 'lose';
        const { diedCount, ...contributions } = counts;
        mvpStats.push({
          ...stats,
          ...contributions,
          playerID: s.seat,
          result: s.departed ? 'abandoned' : result,
        });
        if (!s.departed && s.playerId !== null) {
          achievements.push({
            ...stats,
            playerID: s.playerId,
            originalFaction: s.seat === G.dreamMasterID ? 'master' : 'thief',
            result,
            diedCount,
          });
        }
      }
      for (const result of computeMvpResults(mvpStats)) mvpBySeat.set(result.playerID, result);
      const earned = computeEarnedAchievements(achievements, {
        totalRounds: G.turnNumber,
        winnerFaction: winner,
      });
      for (const [playerId, ids] of earned) {
        for (const achievementId of ids) awards.push({ playerId, achievementId });
      }
    }

    const writes: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.match.update({
        where: { id: matchID },
        data: {
          endedAt: new Date(),
          winner,
          winReason: reason === null ? null : reason.slice(0, WIN_REASON_MAX),
        },
      }),
    ];
    for (const s of seats) {
      const p = G.players[s.seat];
      if (!p) continue;
      const mvp = mvpBySeat.get(s.seat);
      const won = winner === null || s.departed ? null : p.faction === winner;
      writes.push(
        this.prisma.matchPlayer.update({
          where: { matchId_seat: { matchId: matchID, seat: Number(s.seat) } },
          data: {
            finalFaction: p.faction,
            won,
            score: matchScore(G, s, won),
            abandoned: s.departed === true,
            ...(mvp && { isMvp: mvp.isMVP, mvpScore: mvp.mvpScore }),
          },
        }),
      );
    }
    if (awards.length > 0) {
      writes.push(
        this.prisma.achievement.createMany({ data: buildAchievementRows(), skipDuplicates: true }),
        this.prisma.playerAchievement.createMany({ data: awards, skipDuplicates: true }),
      );
    }
    await this.prisma.$transaction(writes);
  }

  async recordStop(matchID: string): Promise<void> {
    await this.prisma.match.update({
      where: { id: matchID },
      data: { endedAt: new Date(), winner: null, winReason: 'host_ended' },
    });
  }

  async roomResults(roomId: string): Promise<RoomMatchResult[]> {
    const matches = await this.prisma.match.findMany({
      where: { roomId, endedAt: { not: null } },
      orderBy: { startedAt: 'asc' },
      select: {
        id: true,
        winner: true,
        matchPlayers: {
          where: { playerId: { not: null }, score: { not: null } },
          select: { playerId: true, nickname: true, score: true },
        },
      },
    });
    return matches.map(({ id, winner, matchPlayers }) => ({
      id,
      scored: winner !== null,
      scores: matchPlayers.flatMap(({ playerId, nickname, score }) =>
        playerId === null || score === null ? [] : [{ playerId, nickname, score }],
      ),
    }));
  }

  async listSteps(matchID: string, { from, to, take }: StepQuery = {}): Promise<StepRow[]> {
    // PostgreSQL 的 int4 边界外没有版本号。保留旧接口对大数及负数区间的行为。
    if ((from !== undefined && from > 2147483647) || (to !== undefined && to < -2147483648))
      return [];
    let lower = from !== undefined && from >= -2147483648 ? from : undefined;
    const upper = to !== undefined && to <= 2147483647 ? to : undefined;
    const out: StepRow[] = [];
    while (take === undefined || out.length < take) {
      const remaining = take === undefined ? undefined : take - out.length;
      const rows = await this.prisma.matchEvent.findMany({
        where: {
          matchId: matchID,
          eventKind: 'step',
          ...(lower !== undefined || upper !== undefined
            ? {
                moveCounter: {
                  ...(lower !== undefined && { gte: lower }),
                  ...(upper !== undefined && { lte: upper }),
                },
              }
            : {}),
        },
        orderBy: { moveCounter: 'asc' },
        ...(remaining !== undefined && { take: remaining }),
      });
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
      const last = rows.at(-1);
      if (
        remaining === undefined ||
        rows.length < remaining ||
        !last ||
        last.moveCounter === 2147483647
      )
        break;
      lower = last.moveCounter + 1;
    }
    if (take !== undefined && out.length === take) return out;
    if (take === undefined && out.length > 0) return out;
    const cold = await this.coldEvents(matchID);
    if (cold.length === 0) return out;
    return cold
      .flatMap(({ moveCounter, eventKind, payload, createdAt }) =>
        eventKind === 'step' &&
        (from === undefined || moveCounter >= from) &&
        (to === undefined || moveCounter <= to) &&
        isStepPayload(payload)
          ? [
              {
                matchID,
                stateID: moveCounter,
                at: createdAt,
                request: payload.request,
                events: payload.events,
              },
            ]
          : [],
      )
      .slice(0, take);
  }

  async stepSummary(matchID: string): Promise<StepSummary> {
    const [summary] = await this.prisma.$queryRaw<StepSummary[]>`
      SELECT min(move_counter) AS min, max(move_counter) AS max, count(*)::int AS count
      FROM match_events
      WHERE match_id = ${matchID}::uuid AND event_kind = 'step'
        AND jsonb_typeof(payload -> 'request') IN ('object', 'array')
        AND jsonb_typeof(payload -> 'events') = 'array'
    `;
    if (summary!.count > 0) return summary!;
    const counters = (await this.coldEvents(matchID))
      .filter((row) => row.eventKind === 'step' && isStepPayload(row.payload))
      .map((row) => row.moveCounter);
    return { min: counters[0] ?? null, max: counters.at(-1) ?? null, count: counters.length };
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
    const source = rows.length > 0 ? rows : await this.coldEvents(matchID);
    return source.flatMap(({ eventKind, payload }) =>
      eventKind === 'gap' && isGapPayload(payload) ? [{ from: payload.from, to: payload.to }] : [],
    );
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
