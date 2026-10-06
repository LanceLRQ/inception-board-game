// AssetPreloader - 三阶段预加载
//
// 纯函数策略 + 可注入 fetch，便于单测。目录（哪张图属于哪一档）由 cardCatalog 给出，这里只管怎么取。
// 三阶段：
//   - critical：进站就取，界面必需的小图（通用背面、金库牌面），不阻塞页面
//   - match-entry：进入对局前取，显示真实进度（牌种全集 + 本人视图里可见的牌与角色）
//   - idle：空闲时低并发地取其余的图，用得到时也会按需加载
//
// 降级：
//   - 数据节省模式（saveData）或慢网（2g）：跳过空闲阶段，进对局前只取视图里已经出现的牌
//   - 单项失败或超时 → 记 failed[]，不阻塞进入对局，由 CardArt 显示卡名文字与类别色块
//
// 只取公开的牌种全集或本人视图里可见的牌：不按别人的手牌或未翻开的身份取图（见 cardCatalog）。

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
  /** 当前是否处于受限网络（数据节省模式或慢网）；缺省按浏览器的 navigator.connection 判断 */
  readonly constrained?: () => boolean;
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

/** 受限网络：数据节省模式开着，或有效网络类型是 2g / slow-2g */
export function isConstrainedConnection(
  conn: { saveData?: boolean; effectiveType?: string } | undefined,
): boolean {
  if (!conn) return false;
  return conn.saveData === true || conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g';
}

/** 读取浏览器当前的网络状况；读不到（不支持 / 抛错）当作不受限 */
export function browserConnectionConstrained(): boolean {
  try {
    const nav = globalThis.navigator as
      | (Navigator & { connection?: { saveData?: boolean; effectiveType?: string } })
      | undefined;
    return isConstrainedConnection(nav?.connection);
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
  private readonly constrainedFn: () => boolean;

  constructor(deps?: Partial<PreloaderDeps>) {
    // 默认用全局 fetch，必须包一层：把 window.fetch 存成实例属性再调用，this 会指向实例，浏览器抛 Illegal invocation
    this.fetchImpl =
      deps?.fetch ??
      (typeof fetch !== 'undefined'
        ? (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init)
        : throwNoFetch);
    this.constrainedFn = deps?.constrained ?? browserConnectionConstrained;
  }

  /** 注入图片目录（见 cardCatalog 的 buildCardCatalog） */
  setManifest(manifest: AssetManifest): void {
    this.manifest = manifest;
  }

  /** 当前已加载 id 集合（只读快照） */
  get loadedIds(): ReadonlySet<string> {
    return this.loaded;
  }

  /** 此刻是否处于受限网络 */
  get constrained(): boolean {
    try {
      return this.constrainedFn() === true;
    } catch {
      return false;
    }
  }

  /** Tier-1：进站就取；没有目录时返回 0 个 */
  async preloadCritical(onProgress?: (p: PreloadProgress) => void): Promise<PreloadProgress> {
    const entries = this.manifest ? filterByTier(this.manifest.entries, 'critical') : [];
    const pending = entries.filter((e) => !this.loaded.has(e.id));
    return this.preloadBatch(pending, 'critical', { concurrency: 4, timeoutMs: 5000, onProgress });
  }

  /**
   * Tier-2：进入对局前。要取的是「牌种全集（match-entry 档）」加上调用方给的 id（本人视图里可见的牌与角色）；
   * 受限网络下只取调用方给的 id，不取全集。
   */
  async preloadMatchEntry(
    cardIds: readonly string[],
    onProgress?: (p: PreloadProgress) => void,
    signal?: AbortSignal,
  ): Promise<PreloadProgress> {
    const wanted = new Set(cardIds);
    const entries = this.manifest
      ? this.manifest.entries.filter(
          (e) => wanted.has(e.id) || (!this.constrained && e.tier === 'match-entry'),
        )
      : [];
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
   * Tier-3：浏览器空闲时低并发地取其余的图。受限网络下跳过（返回 null）。
   * 没有 requestIdleCallback 的环境用短延时代替。
   */
  async preloadIdle(
    onProgress?: (p: PreloadProgress) => void,
    signal?: AbortSignal,
  ): Promise<PreloadProgress | null> {
    if (!this.manifest || this.constrained) return null;
    const pending = this.manifest.entries.filter(
      (e) => e.tier === 'idle' && !this.loaded.has(e.id),
    );
    if (pending.length === 0) return null;
    await waitForIdle(signal);
    if (signal?.aborted || this.constrained) return null;
    return this.preloadBatch(pending, 'idle', {
      concurrency: IDLE_CONCURRENCY,
      timeoutMs: 15_000,
      ...(onProgress ? { onProgress } : {}),
      ...(signal ? { signal } : {}),
    });
  }

  /** 单条预加载（幂等 + inflight 去重）；响应体读完才算加载成功 */
  async preloadOne(entry: AssetManifestEntry, timeoutMs = 10_000): Promise<boolean> {
    if (this.loaded.has(entry.id)) return true;
    const existing = this.inflight.get(entry.id);
    if (existing) return existing;

    const p = this.fetchWithTimeout(entry.url, timeoutMs)
      .then((ok) => {
        if (ok) this.loaded.add(entry.id);
        return ok;
      })
      .catch(() => false);
    this.inflight.set(entry.id, p);
    try {
      return await p;
    } finally {
      this.inflight.delete(entry.id);
    }
  }

  /** 批量预加载（并发控制 + progress 回调）；单张失败只记入 failed，不影响其余 */
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

  private async fetchWithTimeout(url: string, timeoutMs: number): Promise<boolean> {
    const ctrl = typeof AbortController === 'undefined' ? null : new AbortController();
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const res = await this.fetchImpl(url, {
        cache: 'force-cache',
        ...(ctrl ? { signal: ctrl.signal } : {}),
      });
      if (!res.ok) return false;
      // 读完响应体：只有真正下载完（并进了 HTTP 缓存 / Service Worker 缓存），进度才算数
      await res.arrayBuffer();
      return true;
    } catch {
      return false;
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }
}

/** 空闲阶段的并发数：低到不会和对局里的请求抢带宽 */
const IDLE_CONCURRENCY = 2;
const IDLE_FALLBACK_DELAY_MS = 300;

/** 等到浏览器空闲（或被取消）；没有 requestIdleCallback 时延时一小段 */
function waitForIdle(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const ric = (
      globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }
    ).requestIdleCallback;
    if (typeof ric === 'function') ric(() => resolve(), { timeout: 3000 });
    else setTimeout(resolve, IDLE_FALLBACK_DELAY_MS);
  });
}

function throwNoFetch(): never {
  throw new Error('AssetPreloader: no fetch available (node?). Inject via deps.');
}
