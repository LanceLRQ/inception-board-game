// 账号状态判定与查询（封禁、令牌版本）：鉴权中间件、WebSocket 握手、恢复码流程共用同一套判定

/** 判定封禁所需的两个字段 */
export interface BanFields {
  isBanned: boolean;
  banUntil: Date | null;
}

/** 封禁生效：标记为封禁，且没有到期时间（永久）或到期时间晚于当前。到期的封禁视为未封禁 */
export function isBanActive(fields: BanFields, now: number = Date.now()): boolean {
  if (!fields.isBanned) return false;
  return fields.banUntil === null || fields.banUntil.getTime() > now;
}

export interface BanChecker {
  isBanned(playerId: string): Promise<boolean>;
  /**
   * 令牌里的版本号是否仍是该账号当前的版本。账号凭恢复码在别处找回后版本加一，
   * 旧令牌因此作废；账号不存在也返回 false。
   */
  isTokenCurrent(playerId: string, tokenVersion: number): Promise<boolean>;
  /** 封禁状态或令牌版本被改写后调用，丢弃该账号的缓存，使变更立刻生效 */
  invalidate(playerId: string): void;
}

/** 缓存时长：避免每个请求都查库，同时让到期封禁与外部改动最迟 30 秒内被感知 */
export const BAN_CACHE_TTL_MS = 30_000;

/** 缓存条目上限：建档接口不需要登录，账号 ID 可被人为刷大，不设上限内存会只增不减 */
export const BAN_CACHE_MAX_ENTRIES = 10_000;

/** 账号状态查询用到的数据库操作；真实实现是 Prisma 客户端，内存服务用内存表 */
export interface BanPrisma {
  player: {
    findUnique(args: {
      where: { id: string };
      select: { isBanned: true; banUntil: true; tokenVersion: true };
    }): Promise<(BanFields & { tokenVersion: number }) | null>;
  };
}

/** 缓存里的一条账号状态；tokenVersion 为 null 表示账号不存在 */
interface AccountStatus {
  banned: boolean;
  tokenVersion: number | null;
  expiresAt: number;
}

export interface PrismaBanCheckerOptions {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

export class PrismaBanChecker implements BanChecker {
  private readonly cache = new Map<string, AccountStatus>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;
  /** 每次 invalidate 加一：查询期间发生过失效，这次读到的值可能已经过时，不能写进缓存 */
  private invalidations = 0;

  constructor(
    private readonly prisma: BanPrisma,
    opts: PrismaBanCheckerOptions = {},
  ) {
    this.ttlMs = opts.ttlMs ?? BAN_CACHE_TTL_MS;
    this.maxEntries = opts.maxEntries ?? BAN_CACHE_MAX_ENTRIES;
    this.now = opts.now ?? (() => Date.now());
  }

  async isBanned(playerId: string): Promise<boolean> {
    return (await this.status(playerId)).banned;
  }

  async isTokenCurrent(playerId: string, tokenVersion: number): Promise<boolean> {
    return (await this.status(playerId)).tokenVersion === tokenVersion;
  }

  private async status(playerId: string): Promise<AccountStatus> {
    const now = this.now();
    const hit = this.cache.get(playerId);
    if (hit && hit.expiresAt > now) return hit;

    const epoch = this.invalidations;
    const row = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { isBanned: true, banUntil: true, tokenVersion: true },
    });
    const fresh: AccountStatus = {
      banned: row !== null && isBanActive(row, now),
      tokenVersion: row?.tokenVersion ?? null,
      expiresAt: now + this.ttlMs,
    };
    // 查询期间账号被改写并失效过缓存：这次的结果只用于当前请求，不留给后面的请求
    if (epoch === this.invalidations) {
      this.makeRoom(playerId, now);
      this.cache.set(playerId, fresh);
    }
    return fresh;
  }

  /** 写入新条目前保证不超上限：先清已过期的，仍满就整体清空（缓存丢了只是多查几次库） */
  private makeRoom(playerId: string, now: number): void {
    if (this.cache.size < this.maxEntries || this.cache.has(playerId)) return;
    for (const [id, entry] of this.cache) {
      if (entry.expiresAt <= now) this.cache.delete(id);
    }
    if (this.cache.size >= this.maxEntries) this.cache.clear();
  }

  invalidate(playerId: string): void {
    this.invalidations += 1;
    this.cache.delete(playerId);
  }
}

/** 内存实现：不缓存，直接读自己的表；测试与不接数据库的场景使用 */
export class InMemoryBanChecker implements BanChecker {
  private readonly rows = new Map<string, BanFields>();
  private readonly tokenVersions = new Map<string, number>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  ban(playerId: string, until: Date | null = null): void {
    this.rows.set(playerId, { isBanned: true, banUntil: until });
  }

  unban(playerId: string): void {
    this.rows.delete(playerId);
  }

  async isBanned(playerId: string): Promise<boolean> {
    const row = this.rows.get(playerId);
    return row !== undefined && isBanActive(row, this.now());
  }

  /** 改写账号的令牌版本，模拟「在别处用恢复码找回」后旧令牌作废 */
  setTokenVersion(playerId: string, version: number): void {
    this.tokenVersions.set(playerId, version);
  }

  async isTokenCurrent(playerId: string, tokenVersion: number): Promise<boolean> {
    return (this.tokenVersions.get(playerId) ?? 0) === tokenVersion;
  }

  invalidate(_playerId: string): void {
    // 没有缓存，无需处理
  }
}

/** 在真实 Prisma 客户端（或结构兼容的内存表）上建带缓存的查询器 */
export function createBanChecker(client: unknown, opts?: PrismaBanCheckerOptions): BanChecker {
  return new PrismaBanChecker(client as BanPrisma, opts);
}
