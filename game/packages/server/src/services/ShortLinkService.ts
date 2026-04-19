// ShortLinkService - 短链业务（生成/查询/碰撞/过期）
// 对照：plans/design/07-backend-network.md §7.11 / ADR-033
//
// 设计：
//   - 抽象 ShortLinkStore 接口（Prisma 实现 + 内存实现便于测试）
//   - generate(): 用 base58 + 碰撞重试，默认 6 字符
//   - resolve(): 查询 + 过期校验 + 命中统计
//   - 过期策略：短链默认 7 天过期；room/match 类型可显式传 expiresAt

import {
  generateUniqueShortCode,
  isValidBase58Code,
  DEFAULT_SHORTLINK_LENGTH,
  type RandomBytesFn,
} from '@icgame/shared';

export type ShortLinkTargetType = 'room' | 'match' | 'replay';

export interface ShortLinkRecord {
  readonly code: string;
  readonly targetType: ShortLinkTargetType;
  readonly targetId: string;
  readonly createdByPlayerId: string | null;
  readonly createdAt: Date;
  readonly expiresAt: Date | null;
  readonly hitCount: number;
  readonly lastHitAt: Date | null;
}

export interface ShortLinkCreateInput {
  readonly targetType: ShortLinkTargetType;
  readonly targetId: string;
  readonly createdByPlayerId?: string | null;
  readonly expiresInMs?: number;
}

export interface ShortLinkStore {
  findByCode(code: string): Promise<ShortLinkRecord | null>;
  save(record: Omit<ShortLinkRecord, 'hitCount' | 'lastHitAt'>): Promise<ShortLinkRecord>;
  recordHit(code: string): Promise<void>;
  exists(code: string): Promise<boolean>;
}

export interface ShortLinkServiceOptions {
  readonly length?: number;
  readonly defaultTtlMs?: number;
  readonly maxAttempts?: number;
  readonly now?: () => Date;
  readonly randomBytes?: RandomBytesFn;
}

export type ShortLinkResolveResult =
  | { readonly ok: true; readonly record: ShortLinkRecord }
  | { readonly ok: false; readonly reason: 'NOT_FOUND' | 'EXPIRED' | 'INVALID_CODE' };

export class ShortLinkService {
  private readonly length: number;
  private readonly defaultTtlMs: number;
  private readonly maxAttempts: number;
  private readonly now: () => Date;
  private readonly randomBytes: RandomBytesFn | undefined;

  constructor(
    private readonly store: ShortLinkStore,
    opts: ShortLinkServiceOptions = {},
  ) {
    this.length = opts.length ?? DEFAULT_SHORTLINK_LENGTH;
    this.defaultTtlMs = opts.defaultTtlMs ?? 7 * 24 * 3600 * 1000;
    this.maxAttempts = opts.maxAttempts ?? 8;
    this.now = opts.now ?? (() => new Date());
    this.randomBytes = opts.randomBytes;
  }

  async create(input: ShortLinkCreateInput): Promise<ShortLinkRecord> {
    const code = await generateUniqueShortCode((c) => this.store.exists(c), {
      length: this.length,
      maxAttempts: this.maxAttempts,
      ...(this.randomBytes ? { randomBytes: this.randomBytes } : {}),
    });

    const createdAt = this.now();
    const ttl = input.expiresInMs ?? this.defaultTtlMs;
    const expiresAt = ttl > 0 ? new Date(createdAt.getTime() + ttl) : null;

    return this.store.save({
      code,
      targetType: input.targetType,
      targetId: input.targetId,
      createdByPlayerId: input.createdByPlayerId ?? null,
      createdAt,
      expiresAt,
    });
  }

  async resolve(code: string): Promise<ShortLinkResolveResult> {
    if (!isValidBase58Code(code, this.length)) {
      return { ok: false, reason: 'INVALID_CODE' };
    }
    const record = await this.store.findByCode(code);
    if (!record) return { ok: false, reason: 'NOT_FOUND' };
    if (record.expiresAt && record.expiresAt.getTime() <= this.now().getTime()) {
      return { ok: false, reason: 'EXPIRED' };
    }
    // 异步统计命中，不阻塞
    void this.store.recordHit(code).catch(() => {
      /* 统计失败不影响主流程 */
    });
    return { ok: true, record };
  }
}

// === 测试用的内存实现 ===

export class InMemoryShortLinkStore implements ShortLinkStore {
  private readonly records = new Map<string, ShortLinkRecord>();

  async findByCode(code: string): Promise<ShortLinkRecord | null> {
    return this.records.get(code) ?? null;
  }

  async save(input: Omit<ShortLinkRecord, 'hitCount' | 'lastHitAt'>): Promise<ShortLinkRecord> {
    const full: ShortLinkRecord = { ...input, hitCount: 0, lastHitAt: null };
    this.records.set(full.code, full);
    return full;
  }

  async recordHit(code: string): Promise<void> {
    const rec = this.records.get(code);
    if (!rec) return;
    this.records.set(code, {
      ...rec,
      hitCount: rec.hitCount + 1,
      lastHitAt: new Date(),
    });
  }

  async exists(code: string): Promise<boolean> {
    return this.records.has(code);
  }

  size(): number {
    return this.records.size;
  }

  clear(): void {
    this.records.clear();
  }
}
