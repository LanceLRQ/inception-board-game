// 对局事件接口单测：登录后按座位裁剪，对局未结束不提供

import { afterEach, describe, it, expect, vi } from 'vitest';
import { createMatchesRouter } from './matches.js';
import {
  ACCOUNT_OUTSIDER,
  ACCOUNT_SEAT1,
  FINISHED_ID,
  fixtureMatchMeta,
  RUNNING_ID,
  SEAT1_SECRET,
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

async function setup(): Promise<TestServer> {
  server = await serveRouter(
    createMatchesRouter({
      archive: await seedArchive(),
      loadMatch: async (id) => fixtureMatchMeta(id),
    }),
  );
  return server;
}

describe('GET /matches/:id/events', () => {
  it('未登录 → 401', async () => {
    const s = await setup();
    expect((await s.get(`/matches/${FINISHED_ID}/events`)).status).toBe(401);
  });

  it('对局不存在 → 404；未结束 → 409 且没有事件', async () => {
    const s = await setup();
    expect((await s.get('/matches/nope/events', tokenFor(ACCOUNT_SEAT1))).status).toBe(404);
    const running = await s.get(`/matches/${RUNNING_ID}/events`, tokenFor(ACCOUNT_SEAT1));
    expect(running.status).toBe(409);
    expect(running.text).not.toContain(SEAT1_SECRET);
  });

  it('座位成员看到点名给自己的内容；非成员是旁观者，看不到；都没有 request', async () => {
    const s = await setup();
    const member = await s.get(`/matches/${FINISHED_ID}/events`, tokenFor(ACCOUNT_SEAT1));
    expect(member.status).toBe(200);
    expect(member.text).toContain(SEAT1_SECRET);
    expect(member.text).not.toContain('"request"');
    const outsider = await s.get(`/matches/${FINISHED_ID}/events`, tokenFor(ACCOUNT_OUTSIDER));
    expect(outsider.status).toBe(200);
    expect(outsider.text).not.toContain(SEAT1_SECRET);
  });

  it('沿游标分页，序号是版本号', async () => {
    const s = await setup();
    const token = tokenFor(ACCOUNT_SEAT1);
    const first = await s.get(`/matches/${FINISHED_ID}/events?limit=3`, token);
    expect(first.json.data.map((d: { stateID: number }) => d.stateID)).toEqual([1, 2, 3]);
    expect(first.json.hasMore).toBe(true);
    const second = await s.get(
      `/matches/${FINISHED_ID}/events?limit=3&cursor=${first.json.nextCursor}`,
      token,
    );
    expect(second.json.data.map((d: { stateID: number }) => d.stateID)).toEqual([4, 5]);
    expect(second.json.hasMore).toBe(false);
    expect(second.json.nextCursor).toBeNull();
  });
});

describe('GET /matches/:id', () => {
  it('未登录 → 401', async () => {
    const s = await setup();
    expect((await s.get(`/matches/${FINISHED_ID}`)).status).toBe(401);
  });

  it('对局不存在 → 404', async () => {
    const s = await setup();
    expect((await s.get('/matches/nope', tokenFor(ACCOUNT_OUTSIDER))).status).toBe(404);
  });

  it('ID 不是 UUID → 404，且不去查库', async () => {
    const loadMatch = vi.fn(async () => null);
    server = await serveRouter(createMatchesRouter({ archive: await seedArchive(), loadMatch }));
    expect((await server.get('/matches/nope', tokenFor(ACCOUNT_OUTSIDER))).status).toBe(404);
    expect(loadMatch).not.toHaveBeenCalled();
  });

  it('未结束：玩家不含阵营 / 角色 / 胜负字段，胜者与原因为空', async () => {
    const s = await setup();
    const res = await s.get(`/matches/${RUNNING_ID}`, tokenFor(ACCOUNT_OUTSIDER));
    expect(res.status).toBe(200);
    expect(res.json.winner).toBeNull();
    expect(res.json.winReason).toBeNull();
    for (const p of res.json.players) {
      expect(Object.keys(p).sort()).toEqual(['isBot', 'nickname', 'seat']);
    }
  });

  it('已结束：照常返回阵营、胜负与结算原因', async () => {
    const s = await setup();
    const res = await s.get(`/matches/${FINISHED_ID}`, tokenFor(ACCOUNT_OUTSIDER));
    expect(res.status).toBe(200);
    expect(res.json.winner).toBe('thief');
    expect(res.json.winReason).toBe('vault_opened');
    expect(res.json.players[1]).toMatchObject({
      role: 'thief',
      finalFaction: 'thief',
      won: true,
      abandoned: false,
    });
  });
});
