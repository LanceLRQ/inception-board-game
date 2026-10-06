// 回放接口单测：读逐步归档、按座位裁剪、对局未结束不提供
//
// 路由用注入的内存归档，不 mock 任何模块。

import { afterEach, describe, it, expect, vi } from 'vitest';
import { buildShareUrl, createReplayShareLink, createReplaysRouter } from './replays.js';
import { ShortLinkService, InMemoryShortLinkStore } from '../services/ShortLinkService.js';
import { AppError } from '../infra/errors.js';
import {
  ACCOUNT_OUTSIDER,
  ACCOUNT_SEAT0,
  ACCOUNT_SEAT1,
  ARGS_SECRET,
  FINISHED_ID,
  fixtureMatchMeta,
  RUNNING_ID,
  SEAT1_SECRET,
  STEP_COUNT,
  seedArchive,
  serveRouter,
  tokenFor,
  type TestServer,
} from '../testing/archiveFixture.js';

vi.mock('../infra/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let server: TestServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

async function setup() {
  const archive = await seedArchive();
  server = await serveRouter(
    createReplaysRouter({
      archive,
      loadMatch: async (id) => fixtureMatchMeta(id),
      countEvents: async () => STEP_COUNT,
      loadDownloadMeta: async (id) =>
        id === FINISHED_ID
          ? {
              ruleVariant: 'classic',
              playerCount: 4,
              startedAt: new Date(0),
              endedAt: new Date(1),
              winner: 'thief',
              winReason: null,
              players: [{ seat: 0, nickname: 'A', role: 'thief', isBot: false }],
            }
          : null,
    }),
  );
  return { archive, server };
}

const EVENT_PATHS = [
  `/replays/${FINISHED_ID}/events`,
  `/replays/${FINISHED_ID}/range`,
  `/replays/${FINISHED_ID}/download`,
];

describe('回放接口 · 对局状态', () => {
  it('对局不存在 → 404', async () => {
    const { server } = await setup();
    for (const suffix of ['events', 'range', 'frames', 'download']) {
      expect((await server.get(`/replays/nope/${suffix}`)).status).toBe(404);
    }
  });

  it('对局未结束 → 409，响应里没有任何事件内容', async () => {
    const { server } = await setup();
    for (const suffix of ['events', 'range', 'frames', 'download']) {
      for (const token of [undefined, tokenFor(ACCOUNT_SEAT1)]) {
        const res = await server.get(`/replays/${RUNNING_ID}/${suffix}`, token);
        expect(res.status).toBe(409);
        expect(res.text).not.toContain(SEAT1_SECRET);
        expect(res.text).not.toContain('cards_drawn');
      }
    }
  });
});

describe('回放接口 · 按座位裁剪', () => {
  it('座位成员看到点名给自己的内容，其他人（含另一座位、非成员、未登录、令牌无效）看不到', async () => {
    const { server } = await setup();
    for (const path of EVENT_PATHS) {
      const member = await server.get(path, tokenFor(ACCOUNT_SEAT1));
      expect(member.status).toBe(200);
      expect(member.text).toContain(SEAT1_SECRET);
      for (const token of [
        tokenFor(ACCOUNT_SEAT0),
        tokenFor(ACCOUNT_OUTSIDER),
        undefined,
        'not-a-valid-token',
      ]) {
        const res = await server.get(path, token);
        expect(res.status).toBe(200);
        expect(res.text).not.toContain(SEAT1_SECRET);
      }
    }
  });

  it('响应里没有 request；非发起者（座位 1、非成员、未登录）看不到 move 参数', async () => {
    const { server } = await setup();
    for (const path of EVENT_PATHS) {
      for (const token of [tokenFor(ACCOUNT_SEAT1), tokenFor(ACCOUNT_OUTSIDER), undefined]) {
        const res = await server.get(path, token);
        expect(res.text).not.toContain('"request"');
        expect(res.text).not.toContain(ARGS_SECRET);
      }
      // 发起者自己看到的 move 参数来自事件的私密部分，而不是 request
      const seat0 = await server.get(path, tokenFor(ACCOUNT_SEAT0));
      expect(seat0.text).not.toContain('"request"');
    }
  });

  it('旧的 viewerID 查询参数被忽略：未登录者不能借它冒充座位', async () => {
    const { server } = await setup();
    const res = await server.get(`/replays/${FINISHED_ID}/events?viewerID=1`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain(SEAT1_SECRET);
    expect(res.json.viewerID).toBeNull();
  });

  it('响应带观察者的座位号：成员为座位号，其他为 null', async () => {
    const { server } = await setup();
    expect(
      (await server.get(`/replays/${FINISHED_ID}/events`, tokenFor(ACCOUNT_SEAT1))).json.viewerID,
    ).toBe('1');
    expect(
      (await server.get(`/replays/${FINISHED_ID}/events`, tokenFor(ACCOUNT_OUTSIDER))).json
        .viewerID,
    ).toBeNull();
  });
});

describe('回放接口 · /events 分页', () => {
  it('每步一项，带版本号、时间与裁剪后的事件，按版本号升序', async () => {
    const { server } = await setup();
    const res = await server.get(`/replays/${FINISHED_ID}/events?limit=2`);
    expect(res.json.data.map((d: { stateID: number }) => d.stateID)).toEqual([1, 2]);
    const first = res.json.data[0]!;
    expect(Object.keys(first).sort()).toEqual(['at', 'events', 'stateID']);
    expect(first.events.map((e: { kind: string }) => e.kind)).toEqual(['move', 'cards_drawn']);
    expect(res.json.hasMore).toBe(true);
    expect(typeof res.json.nextCursor).toBe('string');
  });

  it('沿游标翻页直到结束', async () => {
    const { server } = await setup();
    const seen: number[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      const q: string = cursor ? `&cursor=${cursor}` : '';
      const res = await server.get(`/replays/${FINISHED_ID}/events?limit=2${q}`);
      seen.push(...res.json.data.map((d: { stateID: number }) => d.stateID));
      cursor = res.json.nextCursor;
      if (!res.json.hasMore) break;
    }
    expect(seen).toEqual([1, 2, 3, 4, 5]);
    expect(cursor).toBeNull();
  });

  it('每页条数上限沿用分页校验：超过 100 不被接受', async () => {
    const { server } = await setup();
    expect((await server.get(`/replays/${FINISHED_ID}/events?limit=101`)).status).not.toBe(200);
  });
});

describe('回放接口 · /range 区间', () => {
  it('闭区间按版本号取，给出前后是否还有', async () => {
    const { server } = await setup();
    const res = await server.get(`/replays/${FINISHED_ID}/range?from=2&to=3`);
    expect(res.json.data.map((d: { stateID: number }) => d.stateID)).toEqual([2, 3]);
    expect(res.json).toMatchObject({ from: 2, to: 3, hasPrev: true, hasNext: true });
  });

  it('只给下界或只给上界；整段区间两端都没有更多', async () => {
    const { server } = await setup();
    const lower = await server.get(`/replays/${FINISHED_ID}/range?from=4`);
    expect(lower.json.data.map((d: { stateID: number }) => d.stateID)).toEqual([4, 5]);
    expect(lower.json).toMatchObject({ hasPrev: true, hasNext: false });
    const upper = await server.get(`/replays/${FINISHED_ID}/range?to=2`);
    expect(upper.json.data).toHaveLength(2);
    expect(upper.json).toMatchObject({ hasPrev: false, hasNext: true });
  });

  it('畸形游标 → 422，而不是 500', async () => {
    const { server } = await setup();
    for (const cursor of ['abc', 'bnVsbA', Buffer.from('[1]').toString('base64url')]) {
      const res = await server.get(`/replays/${FINISHED_ID}/events?cursor=${cursor}`);
      expect(res.status).toBe(422);
    }
  });

  it('from 大于 to 或不是整数 → 422', async () => {
    const { server } = await setup();
    expect((await server.get(`/replays/${FINISHED_ID}/range?from=3&to=2`)).status).toBe(422);
    expect((await server.get(`/replays/${FINISHED_ID}/range?from=abc`)).status).toBe(422);
  });
});

describe('回放接口 · /frames 与 /download', () => {
  it('frames：只给起止版本号与总步数，不含事件', async () => {
    const { server } = await setup();
    const res = await server.get(`/replays/${FINISHED_ID}/frames`);
    expect(res.json).toEqual({
      minMoveCounter: 1,
      maxMoveCounter: STEP_COUNT,
      totalFrames: STEP_COUNT,
      complete: true,
      gaps: [],
    });
  });

  it('download：打包裁剪后的全部步骤，带附件头', async () => {
    const { server } = await setup();
    const res = await server.get(`/replays/${FINISHED_ID}/download`, tokenFor(ACCOUNT_SEAT1));
    expect(res.json.steps).toHaveLength(STEP_COUNT);
    expect(res.json.matchID).toBe(FINISHED_ID);
    expect(res.json.winner).toBe('thief');
    const spectator = await server.get(`/replays/${FINISHED_ID}/download`);
    expect(spectator.text).not.toContain(SEAT1_SECRET);
  });
});

describe('replays · buildShareUrl', () => {
  it('正常拼接 baseUrl + /r/code', () => {
    expect(buildShareUrl('https://example.com', 'abc123')).toBe('https://example.com/r/abc123');
  });

  it('baseUrl 末尾带 / 自动 trim', () => {
    expect(buildShareUrl('https://example.com/', 'abc123')).toBe('https://example.com/r/abc123');
  });

  it('baseUrl 末尾多个 / 全部 trim', () => {
    expect(buildShareUrl('https://example.com///', 'x')).toBe('https://example.com/r/x');
  });
});

describe('replays · createReplayShareLink', () => {
  function setup() {
    const store = new InMemoryShortLinkStore();
    const service = new ShortLinkService(store, { length: 6 });
    return { store, service };
  }

  it('matchExists=true → 创建短链并返回完整 URL', async () => {
    const { service } = setup();
    const result = await createReplayShareLink(
      'match-1',
      async () => true,
      service,
      'https://demo.com',
      'player-A',
    );
    expect(result.code).toMatch(/^[1-9A-HJ-NP-Za-km-z]{6}$/); // base58 6 字符
    expect(result.url).toBe(`https://demo.com/r/${result.code}`);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('matchExists=false → 抛 NOT_FOUND，不创建短链', async () => {
    const { service, store } = setup();
    await expect(
      createReplayShareLink(
        'ghost-match',
        async () => false,
        service,
        'https://demo.com',
        'player-A',
      ),
    ).rejects.toThrow(AppError);
    expect(store.size()).toBe(0);
  });

  it('显式传入 expiresInMs → expiresAt 反映自定义 TTL', async () => {
    const { service } = setup();
    const before = Date.now();
    const result = await createReplayShareLink(
      'match-1',
      async () => true,
      service,
      'https://demo.com',
      null,
      60_000, // 1 分钟
    );
    const expiresMs = result.expiresAt!.getTime();
    expect(expiresMs - before).toBeGreaterThanOrEqual(60_000 - 100);
    expect(expiresMs - before).toBeLessThan(60_000 + 1000);
  });

  it('createdByPlayerId=null 也接受（匿名分享）', async () => {
    const { service } = setup();
    const result = await createReplayShareLink(
      'match-1',
      async () => true,
      service,
      'https://demo.com',
      null,
    );
    expect(result.code).toBeDefined();
  });

  it('多次调用为同一 match 生成不同 code（碰撞-free）', async () => {
    const { service } = setup();
    const r1 = await createReplayShareLink(
      'm',
      async () => true,
      service,
      'https://demo.com',
      null,
    );
    const r2 = await createReplayShareLink(
      'm',
      async () => true,
      service,
      'https://demo.com',
      null,
    );
    expect(r1.code).not.toBe(r2.code);
  });
});

describe('GET /replays/:id', () => {
  it('未登录 → 401', async () => {
    const { server: s } = await setup();
    expect((await s.get(`/replays/${FINISHED_ID}`)).status).toBe(401);
  });

  it('对局不存在 → 404', async () => {
    const { server: s } = await setup();
    expect((await s.get('/replays/nope', tokenFor(ACCOUNT_OUTSIDER))).status).toBe(404);
  });

  it('ID 不是 UUID → 404，且不去查库', async () => {
    const loadMatch = vi.fn(async () => null);
    server = await serveRouter(createReplaysRouter({ archive: await seedArchive(), loadMatch }));
    expect((await server.get('/replays/nope', tokenFor(ACCOUNT_OUTSIDER))).status).toBe(404);
    expect(loadMatch).not.toHaveBeenCalled();
  });

  it('未结束：玩家不含阵营 / 角色 / 胜负字段，胜者与原因为空', async () => {
    const { server: s } = await setup();
    const res = await s.get(`/replays/${RUNNING_ID}`, tokenFor(ACCOUNT_OUTSIDER));
    expect(res.status).toBe(200);
    expect(res.json.winner).toBeNull();
    expect(res.json.winReason).toBeNull();
    for (const p of res.json.players) {
      expect(Object.keys(p).sort()).toEqual(['isBot', 'nickname', 'seat']);
    }
  });

  it('已结束：照常返回阵营与胜负', async () => {
    const { server: s } = await setup();
    const res = await s.get(`/replays/${FINISHED_ID}`, tokenFor(ACCOUNT_OUTSIDER));
    expect(res.status).toBe(200);
    expect(res.json.winner).toBe('thief');
    expect(res.json.players[0]).toMatchObject({ role: 'master', finalFaction: 'master' });
  });
});

describe('回放接口 · 记录完整性', () => {
  it('完整归档：四个读取接口都带 complete=true 与空 gaps', async () => {
    const { server } = await setup();
    for (const suffix of ['events', 'range', 'frames', 'download']) {
      const res = await server.get(`/replays/${FINISHED_ID}/${suffix}`);
      expect(res.json.complete, suffix).toBe(true);
      expect(res.json.gaps, suffix).toEqual([]);
    }
  });

  it('归档里有缺口：四个读取接口都带 complete=false 与缺口区间', async () => {
    const { server, archive } = await setup();
    await archive.recordGap(FINISHED_ID, 6, 8);
    for (const suffix of ['events', 'range', 'frames', 'download']) {
      const res = await server.get(`/replays/${FINISHED_ID}/${suffix}`);
      expect(res.json.complete, suffix).toBe(false);
      expect(res.json.gaps, suffix).toEqual([{ from: 6, to: 8 }]);
    }
  });
});
