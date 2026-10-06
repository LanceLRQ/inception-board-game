import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../app.js';
import { hashRecoveryCode, legacyHashRecoveryCode } from '../infra/recoveryCode.js';
import {
  createMemoryIdentityPrisma,
  type MemoryIdentityPrisma,
} from '../testing/memoryIdentity.js';
import {
  FallbackRecoverAttemptLimiter,
  InMemoryRecoverAttemptLimiter,
  RECOVER_FAIL_LIMIT,
  type RecoverAttemptLimiter,
} from '../services/RecoverAttemptLimiter.js';

vi.mock('../infra/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from '../infra/logger.js';

let server: Server | null = null;
let base = '';
let db: MemoryIdentityPrisma;

async function start(recoverLimiter?: RecoverAttemptLimiter): Promise<void> {
  db = createMemoryIdentityPrisma();
  const app = createApp({
    identityPrisma: db,
    ...(recoverLimiter ? { recoverLimiter } : {}),
    rateLimit: async (_ctx, next) => {
      await next();
    },
  });
  server = createServer(app.callback());
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = null;
});

interface Created {
  playerId: string;
  token: string;
  recoveryCode: string;
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function init(): Promise<Created> {
  return (await (await post('/identity/init', { nickname: '甲' })).json()) as Created;
}

describe('恢复码存储与一次性', () => {
  it('建档签发的恢复码按带密钥的哈希入库', async () => {
    await start();
    const c = await init();
    const row = await db.recoveryCode.findUnique({
      where: { codeHash: hashRecoveryCode(c.recoveryCode) },
      include: { player: true },
    });
    expect(row?.playerId).toBe(c.playerId);
    expect(
      await db.recoveryCode.findUnique({
        where: { codeHash: legacyHashRecoveryCode(c.recoveryCode) },
        include: { player: true },
      }),
    ).toBeNull();
  });

  it('恢复成功后旧码失效，响应带新码且新码可用', async () => {
    await start();
    const c = await init();
    const r1 = await post('/identity/recover', { code: c.recoveryCode });
    expect(r1.status).toBe(200);
    const body = (await r1.json()) as {
      playerId: string;
      recoveryCode: string;
      recoveryCodeWarning: string;
    };
    expect(body.playerId).toBe(c.playerId);
    expect(body.recoveryCode).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(body.recoveryCode).not.toBe(c.recoveryCode);
    expect(body.recoveryCodeWarning).toBeTruthy();

    expect((await post('/identity/recover', { code: c.recoveryCode })).status).toBe(422);

    const r2 = await post('/identity/recover', { code: body.recoveryCode });
    expect(r2.status).toBe(200);
  });

  it('同一恢复码并发提交两次：两个请求都已读到有效记录，也只有一个成功', async () => {
    await start();
    const c = await init();
    // 让两个请求都先读到「有效」的记录，再各自去更新，确保走到的是条件更新这一步
    const realFind = db.recoveryCode.findUnique.bind(db.recoveryCode);
    let arrived = 0;
    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => (release = resolve));
    db.recoveryCode.findUnique = async (args) => {
      const row = await realFind(args);
      arrived += 1;
      if (arrived >= 2) release();
      await bothRead;
      return row;
    };

    const [a, b] = await Promise.all([
      post('/identity/recover', { code: c.recoveryCode }),
      post('/identity/recover', { code: c.recoveryCode }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 422]);
  });

  it('小写输入同样可恢复', async () => {
    await start();
    const c = await init();
    expect((await post('/identity/recover', { code: c.recoveryCode.toLowerCase() })).status).toBe(
      200,
    );
  });

  it('旧的无盐哈希记录可恢复，并被改写成新哈希', async () => {
    await start();
    const player = await db.player.create({
      data: { id: 'p-legacy', nickname: '乙', avatarSeed: '1', locale: 'zh-CN' },
    });
    await db.recoveryCode.create({
      data: { codeHash: legacyHashRecoveryCode('ABCD-1234'), playerId: player.id },
    });

    const r = await post('/identity/recover', { code: 'ABCD-1234' });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { playerId: string }).playerId).toBe('p-legacy');

    // 旧哈希已不存在，记录改写到新哈希（并已作废）
    expect(
      await db.recoveryCode.findUnique({
        where: { codeHash: legacyHashRecoveryCode('ABCD-1234') },
        include: { player: true },
      }),
    ).toBeNull();
    const upgraded = await db.recoveryCode.findUnique({
      where: { codeHash: hashRecoveryCode('ABCD-1234') },
      include: { player: true },
    });
    expect(upgraded?.revokedAt).not.toBeNull();
    expect((await post('/identity/recover', { code: 'ABCD-1234' })).status).toBe(422);
  });

  it('GET /identity/recovery-code 只返回是否存在与创建时间，不含哈希', async () => {
    await start();
    const c = await init();
    const res = await fetch(`${base}/identity/recovery-code`, {
      headers: { authorization: `Bearer ${c.token}` },
    });
    const text = await res.text();
    expect(text).not.toContain('codeHash');
    expect(text).not.toContain(hashRecoveryCode(c.recoveryCode));
    const body = JSON.parse(text) as { hasCode: boolean; createdAt: string };
    expect(body.hasCode).toBe(true);
    expect(body.createdAt).toBeTruthy();
  });
});

describe('恢复码作废与新建在同一事务内', () => {
  it('轮换时新码写入失败，旧码仍然有效', async () => {
    await start();
    const c = await init();
    db.recoveryCode.create = async () => {
      throw new Error('db write failed');
    };
    const res = await fetch(`${base}/identity/rotate-recovery-code`, {
      method: 'POST',
      headers: { authorization: `Bearer ${c.token}` },
    });
    expect(res.status).toBe(500);
    const row = await db.recoveryCode.findUnique({
      where: { codeHash: hashRecoveryCode(c.recoveryCode) },
      include: { player: true },
    });
    expect(row?.revokedAt).toBeNull();
  });

  it('恢复时新码写入失败，用过的码仍然有效', async () => {
    await start();
    const c = await init();
    db.recoveryCode.create = async () => {
      throw new Error('db write failed');
    };
    const res = await post('/identity/recover', { code: c.recoveryCode });
    expect(res.status).toBe(500);
    const row = await db.recoveryCode.findUnique({
      where: { codeHash: hashRecoveryCode(c.recoveryCode) },
      include: { player: true },
    });
    expect(row?.revokedAt).toBeNull();
  });
});

describe('恢复失败限速：并发', () => {
  it('同时发 100 个错误恢复码，真正进入校验的不超过额度', async () => {
    await start();
    // 查库加一点延时，让并发请求在任何一次失败落地之前都已越过限速检查
    const realFind = db.recoveryCode.findUnique.bind(db.recoveryCode);
    db.recoveryCode.findUnique = async (args) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return realFind(args);
    };
    const results = await Promise.all(
      Array.from({ length: 100 }, () => post('/identity/recover', { code: '0000-0000' })),
    );
    const statuses = results.map((r) => r.status);
    const invalid = statuses.filter((s) => s === 422).length;
    const limited = statuses.filter((s) => s === 429).length;
    expect(invalid).toBeLessThanOrEqual(RECOVER_FAIL_LIMIT);
    expect(invalid + limited).toBe(100);
  });
});

describe('恢复失败限速', () => {
  it('失败满 10 次后一律 429，包括正确的恢复码', async () => {
    await start();
    const c = await init();
    for (let i = 0; i < 10; i++) {
      expect((await post('/identity/recover', { code: '0000-0000' })).status).toBe(422);
    }
    expect((await post('/identity/recover', { code: c.recoveryCode })).status).toBe(429);
  });

  it('成功不计数：成功多次后仍可继续失败 9 次而不被限制', async () => {
    await start();
    let code = (await init()).recoveryCode;
    for (let i = 0; i < 12; i++) {
      const r = await post('/identity/recover', { code });
      expect(r.status).toBe(200);
      code = ((await r.json()) as { recoveryCode: string }).recoveryCode;
    }
    for (let i = 0; i < 9; i++) await post('/identity/recover', { code: '0000-0000' });
    expect((await post('/identity/recover', { code })).status).toBe(200);
  });

  it('限速器抛错时请求被拒绝并记错误日志，而不是放行', async () => {
    await start({
      tryConsume: async () => {
        throw new Error('redis down');
      },
      refund: async () => {
        throw new Error('redis down');
      },
    });
    const c = await init();
    expect((await post('/identity/recover', { code: '0000-0000' })).status).toBe(429);
    expect((await post('/identity/recover', { code: c.recoveryCode })).status).toBe(429);
    expect(logger.error).toHaveBeenCalled();
  });

  it('主限速器总是抛错、由回落的进程内计数接管：前 10 次进入校验，第 11 次被限速', async () => {
    const broken: RecoverAttemptLimiter = {
      tryConsume: async () => {
        throw new Error('redis down');
      },
      refund: async () => {
        throw new Error('redis down');
      },
    };
    await start(new FallbackRecoverAttemptLimiter(broken, new InMemoryRecoverAttemptLimiter()));
    const c = await init();
    for (let i = 0; i < RECOVER_FAIL_LIMIT; i++) {
      expect((await post('/identity/recover', { code: '0000-0000' })).status).toBe(422);
    }
    expect((await post('/identity/recover', { code: c.recoveryCode })).status).toBe(429);
  });

  it('退还额度失败不影响成功响应，只记警告', async () => {
    await start({
      tryConsume: async () => true,
      refund: async () => {
        throw new Error('redis down');
      },
    });
    const c = await init();
    expect((await post('/identity/recover', { code: c.recoveryCode })).status).toBe(200);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('连续成功恢复超过额度仍然成功', async () => {
    await start();
    let code = (await init()).recoveryCode;
    for (let i = 0; i < RECOVER_FAIL_LIMIT * 2; i++) {
      const r = await post('/identity/recover', { code });
      expect(r.status).toBe(200);
      code = ((await r.json()) as { recoveryCode: string }).recoveryCode;
    }
  });

  it('形状不对的恢复码不消耗额度', async () => {
    await start();
    for (let i = 0; i < 20; i++) {
      expect((await post('/identity/recover', { code: 'bad' })).status).toBe(400);
    }
    expect((await post('/identity/recover', { code: '0000-0000' })).status).toBe(422);
  });

  it('超长的 fingerprint 返回 400', async () => {
    await start();
    expect(
      (await post('/identity/recover', { code: '0000-0000', fingerprint: 'f'.repeat(129) })).status,
    ).toBe(400);
  });
});
