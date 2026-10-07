import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../app.js';
import jwt from 'jsonwebtoken';
import { hashRecoveryCode } from '../infra/recoveryCode.js';
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

let disconnects: Array<{ playerId: string; code?: string; message?: string }>;

async function start(recoverLimiter?: RecoverAttemptLimiter): Promise<void> {
  db = createMemoryIdentityPrisma();
  disconnects = [];
  const app = createApp({
    identityPrisma: db,
    disconnectPlayer: (playerId, code, message) => {
      disconnects.push({ playerId, code, message });
      return 1;
    },
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
    expect(body.recoveryCode).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
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

  it('不再接受 8 位的旧格式恢复码，也不消耗额度', async () => {
    await start();
    for (let i = 0; i < 20; i++) {
      expect((await post('/identity/recover', { code: 'ABCD-2345' })).status).toBe(400);
    }
    expect((await post('/identity/recover', { code: '0000-0000-0000' })).status).toBe(422);
  });

  it('不带连字符、小写的完整 12 位恢复码同样可恢复', async () => {
    await start();
    const c = await init();
    const compact = c.recoveryCode.replace(/-/g, '').toLowerCase();
    expect((await post('/identity/recover', { code: compact })).status).toBe(200);
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

const authed = (token: string, path: string, init: RequestInit = {}) =>
  fetch(`${base}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });

function versionOf(token: string): number {
  return (jwt.decode(token) as { tokenVersion: number }).tokenVersion;
}

describe('恢复后旧设备的令牌作废', () => {
  interface Recovered {
    token: string;
    recoveryCode: string;
  }
  const recover = async (code: string): Promise<Recovered> =>
    (await (await post('/identity/recover', { code })).json()) as Recovered;

  it('建档的令牌版本是 0，恢复一次加一，新令牌带新版本', async () => {
    await start();
    const c = await init();
    expect(versionOf(c.token)).toBe(0);
    const r1 = await recover(c.recoveryCode);
    expect(versionOf(r1.token)).toBe(1);
    const r2 = await recover(r1.recoveryCode);
    expect(versionOf(r2.token)).toBe(2);
    expect((await db.player.findUnique({ where: { id: c.playerId } }))?.tokenVersion).toBe(2);
  });

  it('恢复后新令牌可用，旧令牌立刻被拒（即使旧令牌刚被缓存过）', async () => {
    await start();
    const c = await init();
    // 先用旧令牌访问一次，让账号状态进入缓存
    expect((await authed(c.token, '/identity/me')).status).toBe(200);
    const r = await recover(c.recoveryCode);
    const oldRes = await authed(c.token, '/identity/me');
    expect(oldRes.status).toBe(401);
    expect(((await oldRes.json()) as { error: { code: string } }).error.code).toBe('TOKEN_REVOKED');
    expect((await authed(r.token, '/identity/me')).status).toBe(200);
  });

  it('旧令牌不能再轮换恢复码、改昵称、查看恢复码状态，新令牌不受影响', async () => {
    await start();
    const c = await init();
    const r = await recover(c.recoveryCode);

    const rotate = await authed(c.token, '/identity/rotate-recovery-code', { method: 'POST' });
    expect(rotate.status).toBe(401);
    const rename = await authed(c.token, '/identity/me', {
      method: 'PATCH',
      body: JSON.stringify({ nickname: '乙乙' }),
    });
    expect(rename.status).toBe(401);
    expect((await authed(c.token, '/identity/recovery-code')).status).toBe(401);

    // 被拒的请求没有产生副作用：昵称没变，新恢复码仍有效
    expect((await db.player.findUnique({ where: { id: c.playerId } }))?.nickname).toBe('甲');
    expect((await post('/identity/recover', { code: r.recoveryCode })).status).toBe(200);
    expect((await authed(r.token, '/identity/recovery-code')).status).toBe(401); // r 已被下一次恢复作废
  });

  it('改昵称与轮换恢复码不改变令牌版本；改昵称签发的新令牌沿用当前版本', async () => {
    await start();
    const c = await init();
    const r = await recover(c.recoveryCode);
    const rename = await authed(r.token, '/identity/me', {
      method: 'PATCH',
      body: JSON.stringify({ nickname: '乙乙' }),
    });
    const { token } = (await rename.json()) as { token: string };
    expect(versionOf(token)).toBe(1);
    expect((await authed(token, '/identity/rotate-recovery-code', { method: 'POST' })).status).toBe(
      200,
    );
    expect((await db.player.findUnique({ where: { id: c.playerId } }))?.tokenVersion).toBe(1);
    expect((await authed(r.token, '/identity/me')).status).toBe(200);
  });

  it('恢复成功后断开该账号现有的全部连接，原因是令牌作废', async () => {
    await start();
    const c = await init();
    await recover(c.recoveryCode);
    expect(disconnects).toEqual([
      { playerId: c.playerId, code: 'TOKEN_REVOKED', message: expect.any(String) },
    ]);
  });

  it('恢复失败（无效码、事务失败）既不加版本也不断连接，旧令牌照常可用', async () => {
    await start();
    const c = await init();
    expect((await post('/identity/recover', { code: '0000-0000-0000' })).status).toBe(422);
    db.recoveryCode.create = async () => {
      throw new Error('db write failed');
    };
    expect((await post('/identity/recover', { code: c.recoveryCode })).status).toBe(500);
    expect(disconnects).toEqual([]);
    expect((await db.player.findUnique({ where: { id: c.playerId } }))?.tokenVersion).toBe(0);
    expect((await authed(c.token, '/identity/me')).status).toBe(200);
  });

  it('恢复成功记一条 INFO 日志，日志里没有恢复码与令牌', async () => {
    await start();
    const c = await init();
    const r = await recover(c.recoveryCode);
    const infoCalls = (logger.info as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const line = infoCalls.find((args) => args[1] === 'identity recovered');
    expect(line?.[0]).toMatchObject({ playerId: c.playerId });
    const text = JSON.stringify(infoCalls);
    expect(text).not.toContain(c.recoveryCode);
    expect(text).not.toContain(r.recoveryCode);
    expect(text).not.toContain(r.token);
    expect(text).not.toContain(c.token);
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
      Array.from({ length: 100 }, () => post('/identity/recover', { code: '0000-0000-0000' })),
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
      expect((await post('/identity/recover', { code: '0000-0000-0000' })).status).toBe(422);
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
    for (let i = 0; i < 9; i++) await post('/identity/recover', { code: '0000-0000-0000' });
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
    expect((await post('/identity/recover', { code: '0000-0000-0000' })).status).toBe(429);
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
      expect((await post('/identity/recover', { code: '0000-0000-0000' })).status).toBe(422);
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
    expect((await post('/identity/recover', { code: '0000-0000-0000' })).status).toBe(422);
  });

  it('超长的 fingerprint 返回 400', async () => {
    await start();
    expect(
      (await post('/identity/recover', { code: '0000-0000-0000', fingerprint: 'f'.repeat(129) }))
        .status,
    ).toBe(400);
  });
});
