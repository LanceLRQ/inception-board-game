// 举报路由单测：对局成员与举报归档使用内存实现；只 mock 日志

import { afterEach, describe, it, expect, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import { createReportsRouter, type ReportsPrisma } from './reports.js';
import { createPrismaReputationStore } from '../services/PrismaReputationStore.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { signToken } from '../infra/jwt.js';
import { InMemoryReportArchive, ReportService } from '../services/ReportService.js';

vi.mock('../infra/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const MATCH_ID = 'abcdef01-1111-4111-8111-1111111111ab';
const ACCOUNT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACCOUNT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACCOUNT_OUTSIDER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const fakePrisma: ReportsPrisma = {
  match: {
    async findUnique({ where }) {
      // UUID 列对大小写不敏感，和 PostgreSQL 一致；返回的是库里存的规范写法
      if (where.id.toLowerCase() !== MATCH_ID) return null;
      return {
        id: MATCH_ID,
        matchPlayers: [
          { seat: 0, playerId: ACCOUNT_A, isBot: false },
          { seat: 1, playerId: ACCOUNT_B, isBot: false },
          { seat: 2, playerId: null, isBot: true },
        ],
      };
    },
  },
};

let server: Server | null = null;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = null;
});

async function setup() {
  const archive = new InMemoryReportArchive();
  const reportService = new ReportService({ archive });
  const app = new Koa();
  app.use(errorHandler);
  app.use(bodyParser());
  app.use(createReportsRouter({ prisma: fakePrisma, reportService }).routes());
  server = createServer(app.callback());
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const { port } = server.address() as AddressInfo;

  async function post(matchId: string, account: string, body: unknown) {
    const res = await fetch(`http://127.0.0.1:${port}/matches/${matchId}/report`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${signToken({ playerId: account, nickname: account, tokenVersion: 0 })}`,
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  }
  return { post, archive };
}

describe('POST /matches/:id/report', () => {
  it('正常举报 201，入库等待核实，响应中没有信誉分', async () => {
    const { post, archive } = await setup();
    const res = await post(MATCH_ID, ACCOUNT_A, { targetSeat: 1, reason: 'afk' });
    expect(res.status).toBe(201);
    expect(res.json).toEqual({ reported: true });
    const rows = await archive.list({});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reporterID: ACCOUNT_A,
      targetID: ACCOUNT_B,
      matchID: MATCH_ID,
      status: 'pending',
    });
  });

  it('同一对局 ID 换大小写再举报仍是 409', async () => {
    const { post, archive } = await setup();
    const first = await post(MATCH_ID, ACCOUNT_A, { targetSeat: 1, reason: 'afk' });
    expect(first.status).toBe(201);
    const upper = await post(MATCH_ID.toUpperCase(), ACCOUNT_A, { targetSeat: 1, reason: 'afk' });
    expect(upper.status).toBe(409);
    const mixed = await post('abcdef01-1111-4111-8111-1111111111Ab', ACCOUNT_A, {
      targetSeat: 1,
      reason: 'afk',
    });
    expect(mixed.status).toBe(409);
    const rows = await archive.list({});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.matchID).toBe(MATCH_ID);
  });

  it('对局不存在 404（含不是 UUID 的对局 ID）', async () => {
    const { post } = await setup();
    const missing = await post('22222222-2222-4222-8222-222222222222', ACCOUNT_A, {
      targetSeat: 1,
      reason: 'afk',
    });
    expect(missing.status).toBe(404);
    const malformed = await post('not-a-uuid', ACCOUNT_A, { targetSeat: 1, reason: 'afk' });
    expect(malformed.status).toBe(404);
  });

  it('举报人不是这局成员 403，且不落库', async () => {
    const { post, archive } = await setup();
    const res = await post(MATCH_ID, ACCOUNT_OUTSIDER, { targetSeat: 1, reason: 'afk' });
    expect(res.status).toBe(403);
    expect(archive.size()).toBe(0);
  });

  it('目标座位是 Bot 400', async () => {
    const { post, archive } = await setup();
    const res = await post(MATCH_ID, ACCOUNT_A, { targetSeat: 2, reason: 'afk' });
    expect(res.status).toBe(400);
    expect(archive.size()).toBe(0);
  });

  it('目标座位不存在 400', async () => {
    const { post } = await setup();
    const res = await post(MATCH_ID, ACCOUNT_A, { targetSeat: 9, reason: 'afk' });
    expect(res.status).toBe(400);
  });

  it('举报自己 400', async () => {
    const { post } = await setup();
    const res = await post(MATCH_ID, ACCOUNT_A, { targetSeat: 0, reason: 'afk' });
    expect(res.status).toBe(400);
  });

  it('重复举报 409，归档只留一条记录', async () => {
    const { post, archive } = await setup();
    expect((await post(MATCH_ID, ACCOUNT_A, { targetSeat: 1, reason: 'afk' })).status).toBe(201);
    const again = await post(MATCH_ID, ACCOUNT_A, { targetSeat: 1, reason: 'cheating' });
    expect(again.status).toBe(409);
    expect(archive.size()).toBe(1);
  });

  it('不再接受账号 ID：缺 targetSeat 或只传 targetPlayerId 都是 400', async () => {
    const { post } = await setup();
    const res = await post(MATCH_ID, ACCOUNT_A, { targetPlayerId: ACCOUNT_B, reason: 'afk' });
    expect(res.status).toBe(400);
  });
});

describe('createPrismaReputationStore.applyDelta', () => {
  it('一次加减只发一条原子写入语句，不先读后写', async () => {
    const queryRaw = vi.fn(async () => [
      {
        playerId: ACCOUNT_B,
        score: 40,
        level: 'regular',
        completedMatches: 0,
        decayedAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const findMany = vi.fn();
    const store = createPrismaReputationStore({
      reputation: { findMany },
      $queryRaw: queryRaw,
    } as never);
    const rec = await store.applyDelta(ACCOUNT_B, -10, 50);
    expect(rec.score).toBe(40);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(findMany).not.toHaveBeenCalled();
  });
});
