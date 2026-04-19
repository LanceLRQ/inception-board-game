// AssetPreloader - 三阶段预加载（ADR-042）
// 对照：plans/design/06-frontend-design.md §6.17.5
//
// 纯函数策略 + 可注入 fetch，便于单测。
// 三阶段：
//   - critical：启动阻塞（卡背 + 骰子索引），<100KB
//   - match-entry：进入对局前（本局所需角色 / 行动牌 / 金库 / 梦魇）
//   - idle：requestIdleCallback 空闲加载（图鉴全量）
//
// 降级：
//   - navigator.connection.saveData === true → 跳过 match-entry 自动预加载
//   - manifest 加载失败 → 启动继续但卡图走惰性 <img loading="lazy">
//   - 单项失败 → 记 failed[]，由 GameCard 层 fallback 到卡背

export type AssetTier = 'critical' | 'match-entry' | 'idle';

export interface AssetManifestEntry {
  readonly id: string;
  readonly category: string;
  readonly url: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly tier: AssetTier;
}

export interface AssetManifest {
  readonly version: string;
  readonly generatedAt: string;
  readonly totalBytes: number;
  readonly entries: readonly AssetManifestEntry[];
}

export interface PreloadProgress {
  readonly tier: AssetTier;
  readonly loaded: number;
  readonly total: number;
  readonly failed: readonly string[];
  readonly bytesLoaded: number;
  readonly bytesTotal: number;
}

export interface PreloadBatchOptions {
  readonly concurrency: number;
  readonly timeoutMs: number;
  readonly onProgress?: (p: PreloadProgress) => void;
  readonly signal?: AbortSignal;
}

/** 可注入的 fetch 与 now（便于测试） */
export interface PreloaderDeps {
  readonly fetch: typeof fetch;
  readonly now?: () => number;
  readonly saveData?: () => boolean;
}

// === 纯函数 ===

/** 过滤 manifest 中指定 tier 的条目 */
export function filterByTier(
  entries: readonly AssetManifestEntry[],
  tier: AssetTier,
): AssetManifestEntry[] {
  return entries.filter((e) => e.tier === tier);
}

/** 过滤 manifest 中指定 id 列表对应的条目（忽略未命中的 id） */
export function filterByIds(
  entries: readonly AssetManifestEntry[],
  ids: readonly string[],
): AssetManifestEntry[] {
  const set = new Set(ids);
  return entries.filter((e) => set.has(e.id));
}

/** 初始 Progress（loaded/total/failed/bytesLoaded/bytesTotal） */
export function makeInitialProgress(
  tier: AssetTier,
  entries: readonly AssetManifestEntry[],
): PreloadProgress {
  return {
    tier,
    loaded: 0,
    total: entries.length,
    failed: [],
    bytesLoaded: 0,
    bytesTotal: entries.reduce((s, e) => s + e.bytes, 0),
  };
}

/** 更新 Progress：item 成功（appendLoaded=true）或失败（id + appendLoaded=false） */
export function advanceProgress(
  prev: PreloadProgress,
  entry: AssetManifestEntry,
  ok: boolean,
): PreloadProgress {
  if (ok) {
    return {
      ...prev,
      loaded: prev.loaded + 1,
      bytesLoaded: prev.bytesLoaded + entry.bytes,
    };
  }
  return {
    ...prev,
    loaded: prev.loaded + 1,
    failed: [...prev.failed, entry.id],
  };
}

/** 弱网判定：saveData === true → 跳过 match-entry */
export function shouldSkipMatchEntry(saveDataFn?: () => boolean): boolean {
  if (!saveDataFn) return false;
  try {
    return saveDataFn() === true;
  } catch {
    return false;
  }
}

// === 副作用类 ===

export class AssetPreloader {
  private manifest: AssetManifest | null = null;
  private readonly loaded = new Set<string>();
  private readonly inflight = new Map<string, Promise<boolean>>();
  private readonly fetchImpl: typeof fetch;
  private readonly saveDataFn: (() => boolean) | undefined;

  constructor(deps?: Partial<PreloaderDeps>) {
    this.fetchImpl = deps?.fetch ?? (typeof fetch !== 'undefined' ? fetch : throwNoFetch);
    this.saveDataFn = deps?.saveData;
  }

  /** 显式注入 manifest（测试用），跳过 fetch */
  setManifest(manifest: AssetManifest): void {
    this.manifest = manifest;
  }

  /** 当前已加载 id 集合（只读快照） */
  get loadedIds(): ReadonlySet<string> {
    return this.loaded;
  }

  /** 拉取 /cards/manifest.json；失败返回 null（调用方决定如何降级） */
  async loadManifest(url = '/cards/manifest.json'): Promise<AssetManifest | null> {
    try {
      const res = await this.fetchImpl(url, { cache: 'force-cache' });
      if (!res.ok) return null;
      const data = (await res.json()) as AssetManifest;
      this.manifest = data;
      return data;
    } catch {
      return null;
    }
  }

  /** Tier-1：启动阻塞；未加载 manifest 时返回 0 个 */
  async preloadCritical(onProgress?: (p: PreloadProgress) => void): Promise<PreloadProgress> {
    const entries = this.manifest ? filterByTier(this.manifest.entries, 'critical') : [];
    return this.preloadBatch(entries, 'critical', { concurrency: 4, timeoutMs: 5000, onProgress });
  }

  /** Tier-2：进入对局前；saveData 时跳过（返回零进度） */
  async preloadMatchEntry(
    cardIds: readonly string[],
    onProgress?: (p: PreloadProgress) => void,
    signal?: AbortSignal,
  ): Promise<PreloadProgress> {
    if (shouldSkipMatchEntry(this.saveDataFn)) {
      const empty = makeInitialProgress('match-entry', []);
      onProgress?.(empty);
      return empty;
    }
    const entries = this.manifest ? filterByIds(this.manifest.entries, cardIds) : [];
    const pending = entries.filter((e) => !this.loaded.has(e.id));
    const opts: PreloadBatchOptions = {
      concurrency: 6,
      timeoutMs: 10_000,
      ...(onProgress ? { onProgress } : {}),
      ...(signal ? { signal } : {}),
    };
    return this.preloadBatch(pending, 'match-entry', opts);
  }

  /**
   * Tier-3：空闲时分批；浏览器无 requestIdleCallback 时直接返回。
   * 不返回 Promise（fire-and-forget）。
   */
  preloadIdle(): void {
    if (typeof window === 'undefined') return;
    if (!this.manifest) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- requestIdleCallback 全局
    const ric = (window as any).requestIdleCallback as
      | ((cb: (deadline: IdleDeadline) => void) => number)
      | undefined;
    if (!ric) return;

    const idleList = this.manifest.entries.filter(
      (e) => e.tier === 'idle' && !this.loaded.has(e.id),
    );
    const batcher = (deadline: IdleDeadline): void => {
      while (deadline.timeRemaining() > 5 && idleList.length > 0) {
        const entry = idleList.shift();
        if (entry) void this.preloadOne(entry);
      }
      if (idleList.length > 0) ric(batcher);
    };
    ric(batcher);
  }

  /** 单条预加载（幂等 + inflight 去重） */
  async preloadOne(entry: AssetManifestEntry, timeoutMs = 10_000): Promise<boolean> {
    if (this.loaded.has(entry.id)) return true;
    const existing = this.inflight.get(entry.id);
    if (existing) return existing;

    const p = this.fetchWithTimeout(entry.url, timeoutMs)
      .then((res) => {
        if (!res || !res.ok) return false;
        this.loaded.add(entry.id);
        return true;
      })
      .catch(() => false);
    this.inflight.set(entry.id, p);
    try {
      return await p;
    } finally {
      this.inflight.delete(entry.id);
    }
  }

  /** 批量预加载（p-limit 并发控制 + progress 回调） */
  async preloadBatch(
    entries: readonly AssetManifestEntry[],
    tier: AssetTier,
    opts: PreloadBatchOptions,
  ): Promise<PreloadProgress> {
    let progress = makeInitialProgress(tier, entries);
    opts.onProgress?.(progress);
    if (entries.length === 0) return progress;

    const queue: AssetManifestEntry[] = [...entries];
    const workers: Promise<void>[] = [];

    const runWorker = async (): Promise<void> => {
      while (queue.length > 0) {
        if (opts.signal?.aborted) return;
        const entry = queue.shift();
        if (!entry) return;
        const ok = await this.preloadOne(entry, opts.timeoutMs);
        progress = advanceProgress(progress, entry, ok);
        opts.onProgress?.(progress);
      }
    };

    const n = Math.max(1, Math.min(opts.concurrency, entries.length));
    for (let i = 0; i < n; i++) workers.push(runWorker());
    await Promise.all(workers);
    return progress;
  }

  private async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response | null> {
    try {
      if (typeof AbortController === 'undefined') {
        const res = await this.fetchImpl(url, { cache: 'force-cache' });
        return res;
      }
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await this.fetchImpl(url, { cache: 'force-cache', signal: ctrl.signal });
        return res;
      } finally {
        clearTimeout(t);
      }
    } catch {
      return null;
    }
  }
}

function throwNoFetch(): never {
  throw new Error('AssetPreloader: no fetch available (node?). Inject via deps.');
}

// 默认单例
export const assetPreloader = new AssetPreloader();
