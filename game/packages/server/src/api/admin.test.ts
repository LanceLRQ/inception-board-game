// Admin API · 单元测试
// parseListFilter 纯函数 + 路由行为（注入 InMemoryReportArchive 绕过 DB）

import { describe, it, expect, beforeEach } from 'vitest';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import { createAdminRouter, parseListFilter } from './admin.js';
import { createOperatorAuthMiddleware } from '../middleware/operatorAuth.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { InMemoryReportArchive } from '../services/ReportService.js';
import type { ReportRecord } from '../services/ReportService.js';

// ---- parseListFilter 纯函数测试 ----

describe('admin · parseListFilter', () => {
  it('空对象 → 空 filter', () => {
    expect(parseListFilter({})).toEqual({});
  });

  it('映射 matchId/targetId/reporterId → matchID/targetID/reporterID（大写 ID 领域命名）', () => {
    const f = parseListFilter({
      matchId: 'm1',
      targetId: 't1',
      reporterId: 'r1',
    });
    expect(f).toEqual({ matchID: 'm1', targetID: 't1', reporterID: 'r1' });
  });

  it('透传 status / limit / offset', () => {
    const f = parseListFilter({ status: 'pending', limit: 20, offset: 40 });
    expect(f.status).toBe('pending');
    expect(f.limit).toBe(20);
    expect(f.offset).toBe(40);
  });

  it('undefined 字段不进 filter（exactOptionalPropertyTypes 友好）', () => {
    const f = parseListFilter({ status: 'resolved' });
    expect('matchID' in f).toBe(false);
    expect('targetID' in f).toBe(false);
    expect('limit' in f).toBe(false);
  });
});

// ---- HTTP 行为测试：用 http.createServer 包 koa，避免依赖 supertest ----

import { createServer, type Server } from 'node:http';
import { once } from 'node:events';

async function startApp(
  archive: InMemoryReportArchive,
  token: string,
  operatorId = 'op-test',
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const app = new Koa();
  app.use(errorHandler);
  app.use(bodyParser());
  const auth = createOperatorAuthMiddleware({ token, operatorId });
  const router = createAdminRouter({ archive, auth });
  app.use(router.routes());
  app.use(router.allowedMethods());

  const server: Server = createServer(app.callback());
  server.listen(0);
  await once(server, 'listening');
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no server address');
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

async function seed(archive: InMemoryReportArchive, count: number): Promise<ReportRecord[]> {
  const out: ReportRecord[] = [];
  for (let i = 0; i < count; i++) {
    const r = await archive.insert({
      matchID: `m${(i % 2) + 1}`,
      reporterID: `p${i}`,
      targetID: i % 3 === 0 ? 'hot-target' : `t${i}`,
      reason: 'cheating',
      description: null,
      status: 'pending',
      createdAt: new Date(2026, 3, 23, 10, i),
      resolvedAt: null,
      resolvedByOperatorID: null,
      notes: null,
    });
    out.push(r);
  }
  return out;
}

describe('admin API · 路由集成（InMemoryReportArchive + HTTP）', () => {
  let archive: InMemoryReportArchive;
  let baseUrl: string;
  let close: () => Promise<void>;
  const TOKEN = 'secret-operator-token';

  beforeEach(async () => {
    archive = new InMemoryReportArchive();
    const started = await startApp(archive, TOKEN);
    baseUrl = started.baseUrl;
    close = started.close;
  });

  async function cleanup() {
    await close();
  }

  describe('鉴权', () => {
    it('无 Authorization 头 → 401', async () => {
      const res = await fetch(`${baseUrl}/admin/reports`);
      expect(res.status).toBe(401);
      await cleanup();
    });

    it('错误 token → 401', async () => {
      const res = await fetch(`${baseUrl}/admin/reports`, {
        headers: { Authorization: 'Bearer wrong-token' },
      });
      expect(res.status).toBe(401);
      await cleanup();
    });

    it('正确 token → 200', async () => {
      const res = await fetch(`${baseUrl}/admin/reports`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      expect(res.status).toBe(200);
      await cleanup();
    });
  });

  describe('GET /admin/reports', () => {
    it('空 archive → items 为空 total=0', async () => {
      const res = await fetch(`${baseUrl}/admin/reports`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      const body = (await res.json()) as { items: unknown[]; total: number };
      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
      await cleanup();
    });

    it('按 targetId 过滤', async () => {
      await seed(archive, 6);
      const res = await fetch(`${baseUrl}/admin/reports?targetId=hot-target`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      const body = (await res.json()) as { items: ReportRecord[]; total: number };
      // seed 规则：i%3==0 的 targetID=hot-target → 0,3 共 2 条
      expect(body.total).toBe(2);
      expect(body.items.every((r) => r.targetID === 'hot-target')).toBe(true);
      await cleanup();
    });

    it('分页 limit=2 offset=0 返回前 2 条（createdAt 倒序）', async () => {
      await seed(archive, 5);
      const res = await fetch(`${baseUrl}/admin/reports?limit=2&offset=0`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      const body = (await res.json()) as { items: ReportRecord[]; total: number };
      expect(body.items).toHaveLength(2);
      expect(body.total).toBe(5);
      // 最新的（i=4）排第一
      expect(body.items[0]!.reporterID).toBe('p4');
      await cleanup();
    });

    it('非法 limit → 422', async () => {
      const res = await fetch(`${baseUrl}/admin/reports?limit=9999`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      expect(res.status).toBe(422);
      await cleanup();
    });
  });

  describe('GET /admin/reports/stats', () => {
    it('按状态聚合', async () => {
      const created = await seed(archive, 4);
      // 标记其中 2 条为 resolved
      await archive.updateStatus(created[0]!.id, {
        status: 'resolved',
        resolvedByOperatorID: 'op-x',
      });
      await archive.updateStatus(created[1]!.id, {
        status: 'dismissed',
        resolvedByOperatorID: 'op-x',
      });
      const res = await fetch(`${baseUrl}/admin/reports/stats`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      const body = (await res.json()) as Record<string, number>;
      expect(body).toEqual({ pending: 2, resolved: 1, dismissed: 1, total: 4 });
      await cleanup();
    });
  });

  describe('GET /admin/reports/:id', () => {
    it('命中返回详情', async () => {
      const [r1] = await seed(archive, 1);
      const res = await fetch(`${baseUrl}/admin/reports/${r1!.id}`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      const body = (await res.json()) as ReportRecord;
      expect(body.id).toBe(r1!.id);
      await cleanup();
    });

    it('未命中 → 404', async () => {
      const res = await fetch(`${baseUrl}/admin/reports/ghost`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      expect(res.status).toBe(404);
      await cleanup();
    });
  });

  describe('PATCH /admin/reports/:id', () => {
    it('resolved 状态 → 自动填 operator + resolvedAt', async () => {
      const [r1] = await seed(archive, 1);
      const res = await fetch(`${baseUrl}/admin/reports/${r1!.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'resolved', notes: 'replay verified' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as ReportRecord;
      expect(body.status).toBe('resolved');
      expect(body.resolvedByOperatorID).toBe('op-test');
      expect(body.notes).toBe('replay verified');
      await cleanup();
    });

    it('非法 status → 422', async () => {
      const [r1] = await seed(archive, 1);
      const res = await fetch(`${baseUrl}/admin/reports/${r1!.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'bogus' }),
      });
      expect(res.status).toBe(422);
      await cleanup();
    });

    it('未命中 id → 404', async () => {
      const res = await fetch(`${baseUrl}/admin/reports/ghost`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'resolved' }),
      });
      expect(res.status).toBe(404);
      await cleanup();
    });

    it('pending 重开 → 清空 resolvedAt/operator', async () => {
      const [r1] = await seed(archive, 1);
      await archive.updateStatus(r1!.id, {
        status: 'resolved',
        resolvedByOperatorID: 'op-test',
      });
      const res = await fetch(`${baseUrl}/admin/reports/${r1!.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'pending' }),
      });
      const body = (await res.json()) as ReportRecord;
      expect(body.status).toBe('pending');
      expect(body.resolvedAt).toBeNull();
      expect(body.resolvedByOperatorID).toBeNull();
      await cleanup();
    });
  });
});
