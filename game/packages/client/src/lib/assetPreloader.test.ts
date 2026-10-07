import { describe, it, expect, vi } from 'vitest';
import {
  AssetPreloader,
  type AssetManifest,
  type AssetManifestEntry,
  advanceProgress,
  filterByIds,
  filterByTier,
  isConstrainedConnection,
  makeInitialProgress,
} from './assetPreloader.js';

function mkEntry(id: string, tier: AssetManifestEntry['tier'], bytes = 1000): AssetManifestEntry {
  return {
    id,
    category: 'thief',
    url: `/cards/thief/${id}.webp`,
    bytes,
    tier,
  };
}

const SAMPLE_MANIFEST: AssetManifest = {
  version: '1.0.0',
  generatedAt: '2026-04-19T00:00:00Z',
  totalBytes: 6000,
  entries: [
    mkEntry('thief_back', 'critical', 500),
    mkEntry('thief_space_queen', 'match-entry', 2000),
    mkEntry('thief_joker', 'match-entry', 1500),
    mkEntry('other_config_table', 'idle', 2000),
  ],
};

// --- 纯函数 ---

describe('filterByTier', () => {
  it('returns only matching tier entries', () => {
    expect(filterByTier(SAMPLE_MANIFEST.entries, 'critical').length).toBe(1);
    expect(filterByTier(SAMPLE_MANIFEST.entries, 'match-entry').length).toBe(2);
    expect(filterByTier(SAMPLE_MANIFEST.entries, 'idle').length).toBe(1);
  });
});

describe('filterByIds', () => {
  it('returns entries matching id set', () => {
    const out = filterByIds(SAMPLE_MANIFEST.entries, ['thief_joker', 'missing_id']);
    expect(out.map((e) => e.id)).toEqual(['thief_joker']);
  });
});

describe('makeInitialProgress', () => {
  it('sums total bytes and sets zeros', () => {
    const p = makeInitialProgress('match-entry', [
      mkEntry('a', 'match-entry', 1000),
      mkEntry('b', 'match-entry', 500),
    ]);
    expect(p.total).toBe(2);
    expect(p.bytesTotal).toBe(1500);
    expect(p.loaded).toBe(0);
    expect(p.bytesLoaded).toBe(0);
    expect(p.failed).toEqual([]);
  });
});

describe('advanceProgress', () => {
  it('increments loaded and bytesLoaded on success', () => {
    const base = makeInitialProgress('critical', [mkEntry('x', 'critical', 200)]);
    const next = advanceProgress(base, mkEntry('x', 'critical', 200), true);
    expect(next.loaded).toBe(1);
    expect(next.bytesLoaded).toBe(200);
    expect(next.failed).toEqual([]);
  });

  it('records failed id on failure (without bytesLoaded)', () => {
    const base = makeInitialProgress('critical', [mkEntry('x', 'critical', 200)]);
    const next = advanceProgress(base, mkEntry('x', 'critical', 200), false);
    expect(next.loaded).toBe(1);
    expect(next.bytesLoaded).toBe(0);
    expect(next.failed).toEqual(['x']);
  });
});

describe('isConstrainedConnection', () => {
  it('读不到网络信息时不受限', () => {
    expect(isConstrainedConnection(undefined)).toBe(false);
    expect(isConstrainedConnection({})).toBe(false);
  });

  it('数据节省模式或 2g 视为受限，4g / wifi 不受限', () => {
    expect(isConstrainedConnection({ saveData: true })).toBe(true);
    expect(isConstrainedConnection({ effectiveType: '2g' })).toBe(true);
    expect(isConstrainedConnection({ effectiveType: 'slow-2g' })).toBe(true);
    expect(isConstrainedConnection({ effectiveType: '4g', saveData: false })).toBe(false);
    expect(isConstrainedConnection({ effectiveType: '3g' })).toBe(false);
  });
});

// --- AssetPreloader ---

function makeFetchMock(opts: { okIds?: readonly string[]; failIds?: readonly string[] }) {
  return vi.fn(async (url: string) => {
    const m = url.match(/\/([a-z0-9_]+)\.webp$/);
    const id = m?.[1] ?? '';
    if (opts.failIds?.includes(id)) return new Response('', { status: 500 });
    if (!opts.okIds || opts.okIds.includes(id)) return new Response('ok', { status: 200 });
    return new Response('', { status: 500 });
  });
}

describe('AssetPreloader.preloadCritical', () => {
  it('loads all critical-tier entries and reports progress', async () => {
    const fetchMock = makeFetchMock({});
    const p = new AssetPreloader({ fetch: fetchMock as unknown as typeof fetch });
    p.setManifest(SAMPLE_MANIFEST);

    const progressLog: number[] = [];
    const r = await p.preloadCritical((prog) => progressLog.push(prog.loaded));
    expect(r.total).toBe(1);
    expect(r.loaded).toBe(1);
    expect(r.failed).toEqual([]);
    expect(progressLog).toContain(1);
  });

  it('returns zero progress when no catalog is set', async () => {
    const fetchMock = makeFetchMock({});
    const p = new AssetPreloader({ fetch: fetchMock as unknown as typeof fetch });
    const r = await p.preloadCritical();
    expect(r.total).toBe(0);
  });

  it('deduplicates already-loaded ids (second call is noop)', async () => {
    const fetchMock = makeFetchMock({});
    const p = new AssetPreloader({ fetch: fetchMock as unknown as typeof fetch });
    p.setManifest(SAMPLE_MANIFEST);
    await p.preloadCritical();
    const before = fetchMock.mock.calls.length;
    await p.preloadCritical();
    expect(p.loadedIds.has('thief_back')).toBe(true);
    // 已经加载过的不再请求
    expect(fetchMock.mock.calls.length).toBe(before);
  });
});

describe('AssetPreloader.preloadMatchEntry', () => {
  const ok = (): AssetPreloader =>
    new AssetPreloader({
      fetch: makeFetchMock({}) as unknown as typeof fetch,
      constrained: () => false,
    });

  it('取 match-entry 档的全集，再加上调用方给的 id', async () => {
    const p = ok();
    p.setManifest(SAMPLE_MANIFEST);
    const r = await p.preloadMatchEntry(['other_config_table']);
    // 全集 2 张（thief_space_queen、thief_joker）+ 视图里点名的 1 张
    expect(r.total).toBe(3);
    expect(r.loaded).toBe(3);
    expect(p.loadedIds.has('other_config_table')).toBe(true);
    expect(p.loadedIds.has('thief_back')).toBe(false);
  });

  it('受限网络下只取调用方给的 id，不取全集', async () => {
    const fetchMock = makeFetchMock({});
    const p = new AssetPreloader({
      fetch: fetchMock as unknown as typeof fetch,
      constrained: () => true,
    });
    p.setManifest(SAMPLE_MANIFEST);
    const r = await p.preloadMatchEntry(['thief_joker']);
    expect(r.total).toBe(1);
    expect(p.loadedIds.has('thief_joker')).toBe(true);
    expect(p.loadedIds.has('thief_space_queen')).toBe(false);
  });

  it('已经加载过的不再请求，进度只算新增的', async () => {
    const fetchMock = makeFetchMock({});
    const p = new AssetPreloader({
      fetch: fetchMock as unknown as typeof fetch,
      constrained: () => false,
    });
    p.setManifest(SAMPLE_MANIFEST);
    await p.preloadMatchEntry([]);
    const calls = fetchMock.mock.calls.length;
    const again = await p.preloadMatchEntry([]);
    expect(again.total).toBe(0);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it('失败的素材记入 failed，不算已加载，也不影响其余', async () => {
    const fetchMock = makeFetchMock({ failIds: ['thief_joker'] });
    const p = new AssetPreloader({
      fetch: fetchMock as unknown as typeof fetch,
      constrained: () => false,
    });
    p.setManifest(SAMPLE_MANIFEST);
    const r = await p.preloadMatchEntry([]);
    expect(r.failed).toEqual(['thief_joker']);
    expect(r.loaded).toBe(r.total);
    expect(p.loadedIds.has('thief_joker')).toBe(false);
    expect(p.loadedIds.has('thief_space_queen')).toBe(true);
  });

  it('超时的素材同样算失败，进度照常走完', async () => {
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const p = new AssetPreloader({
      fetch: fetchMock as unknown as typeof fetch,
      constrained: () => false,
    });
    p.setManifest(SAMPLE_MANIFEST);
    const r = await p.preloadBatch(
      SAMPLE_MANIFEST.entries.filter((e) => e.tier === 'match-entry'),
      'match-entry',
      { concurrency: 2, timeoutMs: 20 },
    );
    expect(r.loaded).toBe(2);
    expect(r.failed).toHaveLength(2);
  });

  it('取消后不再开始新的请求', async () => {
    const fetchMock = makeFetchMock({});
    const p = new AssetPreloader({
      fetch: fetchMock as unknown as typeof fetch,
      constrained: () => false,
    });
    p.setManifest(SAMPLE_MANIFEST);
    const ctrl = new AbortController();
    ctrl.abort();
    const r = await p.preloadMatchEntry([], undefined, ctrl.signal);
    expect(r.loaded).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('AssetPreloader.preloadIdle', () => {
  it('受限网络下直接跳过，一张都不取', async () => {
    const fetchMock = makeFetchMock({});
    const p = new AssetPreloader({
      fetch: fetchMock as unknown as typeof fetch,
      constrained: () => true,
    });
    p.setManifest(SAMPLE_MANIFEST);
    expect(await p.preloadIdle()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('不受限时取 idle 档的图，并发不超过 2', async () => {
    let active = 0;
    let peak = 0;
    const fetchMock = vi.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return new Response('ok', { status: 200 });
    });
    const many: AssetManifest = {
      ...SAMPLE_MANIFEST,
      entries: Array.from({ length: 8 }, (_, i) => mkEntry(`idle_${i}`, 'idle')),
    };
    const p = new AssetPreloader({
      fetch: fetchMock as unknown as typeof fetch,
      constrained: () => false,
    });
    p.setManifest(many);
    const r = await p.preloadIdle();
    expect(r?.loaded).toBe(8);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('没有待取的图时返回 null', async () => {
    const p = new AssetPreloader({
      fetch: makeFetchMock({}) as unknown as typeof fetch,
      constrained: () => false,
    });
    p.setManifest({ ...SAMPLE_MANIFEST, entries: [mkEntry('a', 'critical')] });
    expect(await p.preloadIdle()).toBeNull();
  });
});

describe('AssetPreloader 默认使用全局 fetch', () => {
  it('以全局对象为 this 调用 fetch（像浏览器那样，this 不对就抛 Illegal invocation）', async () => {
    const strictFetch = vi.fn(function (this: unknown): Promise<Response> {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError('Illegal invocation');
      }
      return Promise.resolve(new Response('ok', { status: 200 }));
    });
    vi.stubGlobal('fetch', strictFetch);
    try {
      const p = new AssetPreloader();
      expect(await p.preloadOne(mkEntry('thief_g', 'critical'))).toBe(true);
      expect(strictFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('AssetPreloader.preloadOne', () => {
  it('响应体读完才算加载成功', async () => {
    const body = vi.fn(async () => new ArrayBuffer(4));
    const fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: body }) as unknown as Response);
    const p = new AssetPreloader({ fetch: fetchMock as unknown as typeof fetch });
    expect(await p.preloadOne(mkEntry('thief_z', 'critical'))).toBe(true);
    expect(body).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent calls for the same id (inflight map)', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async (_url: string) => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return new Response('ok', { status: 200 });
    });
    const p = new AssetPreloader({ fetch: fetchMock as unknown as typeof fetch });

    const entry = mkEntry('thief_back', 'critical');
    const [a, b, c] = await Promise.all([
      p.preloadOne(entry),
      p.preloadOne(entry),
      p.preloadOne(entry),
    ]);
    expect(a && b && c).toBe(true);
    // inflight 应当合并并发调用
    expect(calls).toBe(1);
  });

  it('returns false on 500 response', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 500 }));
    const p = new AssetPreloader({ fetch: fetchMock as unknown as typeof fetch });
    const r = await p.preloadOne(mkEntry('thief_x', 'critical'));
    expect(r).toBe(false);
    expect(p.loadedIds.has('thief_x')).toBe(false);
  });

  it('returns false on thrown error (network)', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    const p = new AssetPreloader({ fetch: fetchMock as unknown as typeof fetch });
    const r = await p.preloadOne(mkEntry('thief_y', 'critical'));
    expect(r).toBe(false);
  });
});
