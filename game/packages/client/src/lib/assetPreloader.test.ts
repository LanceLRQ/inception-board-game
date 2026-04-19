import { describe, it, expect, vi } from 'vitest';
import {
  AssetPreloader,
  type AssetManifest,
  type AssetManifestEntry,
  advanceProgress,
  filterByIds,
  filterByTier,
  makeInitialProgress,
  shouldSkipMatchEntry,
} from './assetPreloader.js';

function mkEntry(id: string, tier: AssetManifestEntry['tier'], bytes = 1000): AssetManifestEntry {
  return {
    id,
    category: 'thief',
    url: `/cards/thief/${id}.webp`,
    bytes,
    sha256: 'deadbeef',
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

describe('shouldSkipMatchEntry', () => {
  it('returns false when saveData is undefined', () => {
    expect(shouldSkipMatchEntry()).toBe(false);
  });

  it('returns true when saveData() is true', () => {
    expect(shouldSkipMatchEntry(() => true)).toBe(true);
  });

  it('returns false when saveData() throws', () => {
    expect(
      shouldSkipMatchEntry(() => {
        throw new Error();
      }),
    ).toBe(false);
  });
});

// --- AssetPreloader ---

function makeFetchMock(opts: {
  okIds?: readonly string[];
  failIds?: readonly string[];
  manifestBody?: AssetManifest | null;
}) {
  return vi.fn(async (url: string) => {
    if (url.endsWith('/manifest.json')) {
      if (opts.manifestBody === null) {
        return new Response('', { status: 404 });
      }
      return new Response(JSON.stringify(opts.manifestBody ?? SAMPLE_MANIFEST), { status: 200 });
    }
    const m = url.match(/\/([a-z0-9_]+)\.webp$/);
    const id = m?.[1] ?? '';
    if (opts.failIds?.includes(id)) return new Response('', { status: 500 });
    if (!opts.okIds || opts.okIds.includes(id)) return new Response('ok', { status: 200 });
    return new Response('', { status: 500 });
  });
}

describe('AssetPreloader.loadManifest', () => {
  it('fetches manifest and caches it internally', async () => {
    const fetchMock = makeFetchMock({});
    const p = new AssetPreloader({ fetch: fetchMock as unknown as typeof fetch });
    const m = await p.loadManifest();
    expect(m).toEqual(SAMPLE_MANIFEST);
    expect(fetchMock).toHaveBeenCalledWith('/cards/manifest.json', { cache: 'force-cache' });
  });

  it('returns null when manifest fetch fails', async () => {
    const fetchMock = makeFetchMock({ manifestBody: null });
    const p = new AssetPreloader({ fetch: fetchMock as unknown as typeof fetch });
    const m = await p.loadManifest();
    expect(m).toBeNull();
  });
});

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

  it('returns zero progress when no manifest loaded', async () => {
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
    // 第二次应该全是命中 loaded cache，不再新增 fetch 调用（除 manifest）
    // 但 preloadCritical 内部会再次 preloadOne，preloadOne 早退——验证方式：
    expect(p.loadedIds.has('thief_back')).toBe(true);
    // 新增的 fetch 调用应该为 0
    expect(fetchMock.mock.calls.length).toBe(before);
  });
});

describe('AssetPreloader.preloadMatchEntry', () => {
  it('loads only entries whose id is in the request list', async () => {
    const fetchMock = makeFetchMock({});
    const p = new AssetPreloader({ fetch: fetchMock as unknown as typeof fetch });
    p.setManifest(SAMPLE_MANIFEST);

    const r = await p.preloadMatchEntry(['thief_joker']);
    expect(r.total).toBe(1);
    expect(r.loaded).toBe(1);
    expect(p.loadedIds.has('thief_joker')).toBe(true);
    expect(p.loadedIds.has('thief_space_queen')).toBe(false);
  });

  it('skips all when saveData is enabled', async () => {
    const fetchMock = makeFetchMock({});
    const p = new AssetPreloader({
      fetch: fetchMock as unknown as typeof fetch,
      saveData: () => true,
    });
    p.setManifest(SAMPLE_MANIFEST);

    const r = await p.preloadMatchEntry(['thief_joker', 'thief_space_queen']);
    expect(r.total).toBe(0);
    expect(p.loadedIds.size).toBe(0);
  });

  it('records failed ids without marking them as loaded', async () => {
    const fetchMock = makeFetchMock({ failIds: ['thief_joker'] });
    const p = new AssetPreloader({ fetch: fetchMock as unknown as typeof fetch });
    p.setManifest(SAMPLE_MANIFEST);

    const r = await p.preloadMatchEntry(['thief_joker', 'thief_space_queen']);
    expect(r.failed).toEqual(['thief_joker']);
    expect(p.loadedIds.has('thief_joker')).toBe(false);
    expect(p.loadedIds.has('thief_space_queen')).toBe(true);
  });
});

describe('AssetPreloader.preloadOne', () => {
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
