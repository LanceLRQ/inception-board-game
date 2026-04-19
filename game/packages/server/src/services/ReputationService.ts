// ReputationService - 信誉分规则与 upsert
// 对照：plans/design/08-security-ai.md §8.4b 反作弊与信誉分
//
// 规则（MVP 简化）：
//   - 初始 1000 分
//   - 被举报（任意原因）-10（最低 0）
//   - 掉线弃局 -20
//   - 正常完局 +2（上限 1500）
//   - level 分档：0-599 restricted / 600-799 watched / 800-1099 normal / 1100+ trusted
//
// 设计：Store 接口化，生产用 Prisma 适配器，测试用 InMemoryStore

export type ReputationLevel = 'restricted' | 'watched' | 'normal' | 'trusted';
export const INITIAL_REPUTATION_SCORE = 1000;
export const REPUTATION_MIN = 0;
export const REPUTATION_MAX = 1500;

export const REPUTATION_DELTAS = {
  report: -10,
  abandon: -20,
  complete: +2,
} as const;

export interface ReputationRecord {
  readonly playerId: string;
  readonly score: number;
  readonly level: ReputationLevel;
  readonly updatedAt: Date;
}

export interface ReputationStore {
  get(playerId: string): Promise<ReputationRecord | null>;
  upsert(
    playerId: string,
    next: { readonly score: number; readonly level: ReputationLevel },
  ): Promise<ReputationRecord>;
}

/** 纯函数：根据当前分计算等级 */
export function computeReputationLevel(score: number): ReputationLevel {
  if (score < 600) return 'restricted';
  if (score < 800) return 'watched';
  if (score < 1100) return 'normal';
  return 'trusted';
}

/** 纯函数：计算下一个信誉分（夹到 [MIN, MAX]） */
export function computeNextScore(current: number, delta: number): number {
  const next = current + delta;
  if (next < REPUTATION_MIN) return REPUTATION_MIN;
  if (next > REPUTATION_MAX) return REPUTATION_MAX;
  return next;
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
    const rec = await this.store.get(playerId);
    if (rec) return rec;
    // 未建档：返回初始值快照（不写入，等到 adjust 时才 upsert）
    return {
      playerId,
      score: this.initialScore,
      level: computeReputationLevel(this.initialScore),
      updatedAt: new Date(),
    };
  }

  async adjust(
    playerId: string,
    deltaKey: keyof typeof REPUTATION_DELTAS,
  ): Promise<ReputationRecord> {
    const delta = REPUTATION_DELTAS[deltaKey];
    const current = await this.store.get(playerId);
    const base = current?.score ?? this.initialScore;
    const nextScore = computeNextScore(base, delta);
    const nextLevel = computeReputationLevel(nextScore);
    return this.store.upsert(playerId, { score: nextScore, level: nextLevel });
  }
}

// === 测试 / 开发用内存实现 ===

export class InMemoryReputationStore implements ReputationStore {
  private readonly records = new Map<string, ReputationRecord>();

  async get(playerId: string): Promise<ReputationRecord | null> {
    return this.records.get(playerId) ?? null;
  }

  async upsert(
    playerId: string,
    next: { readonly score: number; readonly level: ReputationLevel },
  ): Promise<ReputationRecord> {
    const rec: ReputationRecord = {
      playerId,
      score: next.score,
      level: next.level,
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
