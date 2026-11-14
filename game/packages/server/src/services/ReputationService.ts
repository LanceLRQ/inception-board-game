export type ReputationLevel = 'low' | 'regular' | 'trusted';
export const INITIAL_REPUTATION_SCORE = 50;
export const REPUTATION_MIN = 0;
export const REPUTATION_MAX = 100;
export const REPUTATION_RECOVERY_MS = 30 * 24 * 60 * 60 * 1000;
export const REPUTATION_TIMEOUT_THRESHOLD = 3;

const ABANDON_DELTA = -5;
const TIMEOUT_DELTA = -3;
const COMPLETE_DELTA = 2;
const REPUTATION_DELTAS = {
  report: -10,
  abandon: ABANDON_DELTA,
  complete: COMPLETE_DELTA,
  completeWithTimeouts: COMPLETE_DELTA + TIMEOUT_DELTA,
  abandonWithTimeouts: ABANDON_DELTA + TIMEOUT_DELTA,
} as const;
export type ReputationChange = keyof typeof REPUTATION_DELTAS;

export interface ReputationRecord {
  readonly playerId: string;
  readonly score: number;
  readonly level: ReputationLevel;
  readonly completedMatches: number;
  readonly decayedAt: Date;
  readonly updatedAt: Date;
}

export interface ReputationStore {
  findMany(playerIds: readonly string[]): Promise<ReputationRecord[]>;
  /**
   * 原子地加减信誉分：分数夹在 [REPUTATION_MIN, REPUTATION_MAX]，等级随之重算；
   * 没有记录时从 initialScore 起算。必须由存储自己保证并发安全（不能「读出再写回」），
   * 否则两个并发举报会丢掉一次扣分。
   */
  applyDelta(
    playerId: string,
    delta: number,
    initialScore: number,
    completed?: number,
    at?: Date,
  ): Promise<ReputationRecord>;
}

/** 等级下限分数；SQL 版的等级计算也读这组常量，保证两边一致 */
export const REPUTATION_LEVEL_FLOORS = { regular: 40, trusted: 70, trustedCompletions: 20 };

export function computeReputationLevel(score: number, completedMatches = 0): ReputationLevel {
  if (score < REPUTATION_LEVEL_FLOORS.regular) return 'low';
  if (
    score >= REPUTATION_LEVEL_FLOORS.trusted &&
    completedMatches >= REPUTATION_LEVEL_FLOORS.trustedCompletions
  ) {
    return 'trusted';
  }
  return 'regular';
}

/** 纯函数：计算下一个信誉分（夹到 [MIN, MAX]） */
export function computeNextScore(current: number, delta: number): number {
  const next = current + delta;
  if (next < REPUTATION_MIN) return REPUTATION_MIN;
  if (next > REPUTATION_MAX) return REPUTATION_MAX;
  return next;
}

function recoveredScore(score: number, since: Date, now: Date, initialScore: number): number {
  const periods = Math.max(0, Math.floor((+now - +since) / REPUTATION_RECOVERY_MS));
  return score + Math.min(Math.max(initialScore - score, 0), periods);
}

export interface ReputationServiceOptions {
  readonly initialScore?: number;
}

export class ReputationService {
  private readonly initialScore: number;

  constructor(
    private readonly store: ReputationStore,
    opts: ReputationServiceOptions = {},
  ) {
    this.initialScore = opts.initialScore ?? INITIAL_REPUTATION_SCORE;
  }

  async get(playerId: string): Promise<ReputationRecord> {
    return (await this.getMany([playerId]))[0]!;
  }

  async getMany(playerIds: readonly string[]): Promise<ReputationRecord[]> {
    if (playerIds.length === 0) return [];
    const now = new Date();
    const records = new Map((await this.store.findMany(playerIds)).map((r) => [r.playerId, r]));
    return playerIds.map((playerId) => {
      const rec = records.get(playerId) ?? {
        playerId,
        score: this.initialScore,
        completedMatches: 0,
        decayedAt: now,
        updatedAt: now,
      };
      // 查询不写库；实际加减分时由存储在同一动作内应用恢复并重置计时。
      const score = recoveredScore(rec.score, rec.decayedAt, now, this.initialScore);
      return { ...rec, score, level: computeReputationLevel(score, rec.completedMatches) };
    });
  }

  async adjust(playerId: string, deltaKey: ReputationChange, at?: Date): Promise<ReputationRecord> {
    const completed = deltaKey === 'complete' || deltaKey === 'completeWithTimeouts' ? 1 : 0;
    return this.store.applyDelta(
      playerId,
      REPUTATION_DELTAS[deltaKey],
      this.initialScore,
      completed,
      at,
    );
  }
}

// === 测试 / 开发用内存实现 ===

export class InMemoryReputationStore implements ReputationStore {
  private readonly records = new Map<string, ReputationRecord>();

  async get(playerId: string): Promise<ReputationRecord | null> {
    return this.records.get(playerId) ?? null;
  }

  async findMany(playerIds: readonly string[]): Promise<ReputationRecord[]> {
    return playerIds.map((id) => this.records.get(id)).filter((rec) => rec !== undefined);
  }

  // 读与写之间没有 await，单线程下天然原子
  async applyDelta(
    playerId: string,
    delta: number,
    initialScore: number,
    completed = 0,
    at = new Date(),
  ): Promise<ReputationRecord> {
    const previous = this.records.get(playerId);
    const current = previous
      ? recoveredScore(previous.score, previous.decayedAt, at, initialScore)
      : initialScore;
    const score = computeNextScore(current, delta);
    const completedMatches = (previous?.completedMatches ?? 0) + completed;
    const rec: ReputationRecord = {
      playerId,
      score,
      level: computeReputationLevel(score, completedMatches),
      completedMatches,
      decayedAt: previous && previous.decayedAt > at ? previous.decayedAt : at,
      updatedAt: new Date(),
    };
    this.records.set(playerId, rec);
    return rec;
  }

  size(): number {
    return this.records.size;
  }

  clear(): void {
    this.records.clear();
  }
}
