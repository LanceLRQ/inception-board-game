import { describe, it, expect, afterAll } from 'vitest';
import Redis from 'ioredis';
import { RedisKeys, RedisTTL } from '../infra/redisKeys.js';
import { describeMatchStoreContract, makeTestSnapshot } from './MatchStore.contract.js';
import {
  CREATE_SCRIPT,
  DISCARD_SCRIPT,
  InMemoryMatchStore,
  RedisMatchStore,
  SAVE_SCRIPT,
} from './MatchStore.js';

/**
 * 手写的 Redis 桩，只实现 RedisMatchStore 用到的命令。
 * eval 不解释 Lua：识别出是 SAVE_SCRIPT 后用等价的 JS 执行——
 *   脚本语义：GET KEYS[1]；值等于 ARGV[1] 才 SET KEYS[1] ARGV[2] 并保留原有过期，返回 'ok'，否则 'conflict'。
 * 这比真实 Redis 弱，真实 Redis 的验证见下方 TEST_REDIS_URL 用例。
 */
class FakeRedis {
  readonly kv = new Map<string, string>();
  readonly sets = new Map<string, Set<string>>();
  readonly ttl = new Map<string, number>();

  async get(key: string): Promise<string | null> {
    return this.kv.get(key) ?? null;
  }
  async set(key: string, value: string, ...args: string[]): Promise<'OK' | null> {
    if (args.includes('NX') && this.kv.has(key)) return null;
    this.kv.set(key, value);
    return 'OK';
  }
  async sadd(key: string, member: string): Promise<number> {
    const s = this.sets.get(key) ?? new Set<string>();
    this.sets.set(key, s);
    const had = s.has(member);
    s.add(member);
    return had ? 0 : 1;
  }
  async srem(key: string, member: string): Promise<number> {
    return this.sets.get(key)?.delete(member) ? 1 : 0;
  }
  async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? [])];
  }
  async expire(key: string, seconds: number): Promise<number> {
    if (!this.kv.has(key)) return 0;
    this.ttl.set(key, seconds);
    return 1;
  }
  /** 记录每次 eval 的脚本，用来断言建局只发了一次调用 */
  readonly evalCalls: string[] = [];
  async eval(script: string, _numKeys: number, ...rest: string[]): Promise<string> {
    this.evalCalls.push(script);
    if (script === SAVE_SCRIPT) {
      const [key, expected, next] = rest as [string, string, string];
      if (this.kv.get(key) !== expected) return 'conflict';
      this.kv.set(key, next);
      return 'ok';
    }
    if (script === CREATE_SCRIPT) {
      // 等价于脚本：覆盖写（不带 NX，清掉过期）、加入活跃集合
      const [key, activeKey, json, matchID] = rest as [string, string, string, string];
      const existed = this.kv.has(key);
      this.kv.set(key, json);
      this.ttl.delete(key);
      const s = this.sets.get(activeKey) ?? new Set<string>();
      this.sets.set(activeKey, s);
      s.add(matchID);
      return existed ? 'replaced' : 'created';
    }
    if (script === DISCARD_SCRIPT) {
      const [key, activeKey, matchID] = rest as [string, string, string];
      this.kv.delete(key);
      this.ttl.delete(key);
      this.sets.get(activeKey)?.delete(matchID);
      return 'ok';
    }
    throw new Error('unexpected script');
  }
}

describeMatchStoreContract('InMemoryMatchStore', () => new InMemoryMatchStore());
describeMatchStoreContract(
  'RedisMatchStore（Redis 桩）',
  () => new RedisMatchStore(new FakeRedis() as unknown as Redis),
);

describe('RedisMatchStore · 键与过期', () => {
  it('快照整体存为一个 JSON 字符串，并加入活跃集合', async () => {
    const fake = new FakeRedis();
    const store = new RedisMatchStore(fake as unknown as Redis);
    const snap = makeTestSnapshot('m-key');
    await store.create(snap);
    const raw = fake.kv.get(RedisKeys.matchSnapshot('m-key'));
    expect(JSON.parse(raw!)).toEqual(snap);
    expect(fake.sets.get(RedisKeys.matchActive())?.has('m-key')).toBe(true);
    expect(RedisKeys.matchSnapshot('m-key')).toBe('ico:match:m-key');
    expect(RedisKeys.matchActive()).toBe('ico:match:active');
  });

  it('建局只发一次脚本调用，不拆成多条命令', async () => {
    const fake = new FakeRedis();
    const store = new RedisMatchStore(fake as unknown as Redis);
    await store.create(makeTestSnapshot('m-once'));
    expect(fake.evalCalls).toEqual([CREATE_SCRIPT]);
  });

  it('覆盖上一局的旧快照时去掉旧的过期时间', async () => {
    const fake = new FakeRedis();
    const store = new RedisMatchStore(fake as unknown as Redis);
    await store.create(makeTestSnapshot('m-redo'));
    await store.finish('m-redo');
    expect(fake.ttl.has(RedisKeys.matchSnapshot('m-redo'))).toBe(true);
    await store.create(makeTestSnapshot('m-redo'));
    expect(fake.ttl.has(RedisKeys.matchSnapshot('m-redo'))).toBe(false);
  });

  it('丢弃只发一次脚本调用', async () => {
    const fake = new FakeRedis();
    const store = new RedisMatchStore(fake as unknown as Redis);
    await store.create(makeTestSnapshot('m-gone'));
    fake.evalCalls.length = 0;
    await store.discard('m-gone');
    expect(fake.evalCalls).toEqual([DISCARD_SCRIPT]);
  });

  it('进行中的快照不设过期，finish 后设 1 天过期', async () => {
    const fake = new FakeRedis();
    const store = new RedisMatchStore(fake as unknown as Redis);
    await store.create(makeTestSnapshot('m-ttl'));
    expect(fake.ttl.size).toBe(0);
    await store.finish('m-ttl');
    expect(fake.ttl.get(RedisKeys.matchSnapshot('m-ttl'))).toBe(RedisTTL.MATCH_FINISHED);
    expect(RedisTTL.MATCH_FINISHED).toBe(86400);
  });

  it('读到之后、写入之前被别人改过，脚本判为 conflict', async () => {
    const fake = new FakeRedis();
    const store = new RedisMatchStore(fake as unknown as Redis);
    const snap = makeTestSnapshot('m-race');
    await store.create(snap);
    // 在 save 内部 GET 与 eval 之间插入一次外部写入
    const realEval = fake.eval.bind(fake);
    fake.eval = async (...a: Parameters<FakeRedis['eval']>) => {
      fake.kv.set(RedisKeys.matchSnapshot('m-race'), '{"tampered":true}');
      return realEval(...a);
    };
    const next = { ...snap.state, stateID: snap.state.stateID + 1 };
    expect(await store.save('m-race', next, snap.state.stateID, 5)).toBe('conflict');
  });
});

const redisUrl = process.env.TEST_REDIS_URL;
describe.skipIf(!redisUrl)('RedisMatchStore · 真实 Redis（需要 TEST_REDIS_URL）', () => {
  const prefix = `ico-test-${Math.random().toString(36).slice(2)}:`;
  const clients: Redis[] = [];
  const open = (opts: object = {}): Redis => {
    const c = new Redis(redisUrl!, opts);
    clients.push(c);
    return c;
  };

  describeMatchStoreContract('RedisMatchStore（真实 Redis）', () => {
    // 每个用例各用一个独立键空间，互不影响活跃集合
    const p = `${prefix}${Math.random().toString(36).slice(2)}:`;
    return new RedisMatchStore(open({ keyPrefix: p }));
  });

  afterAll(async () => {
    const cleaner = open();
    const keys = await cleaner.keys(`${prefix}*`);
    if (keys.length > 0) await cleaner.del(...keys);
    await Promise.all(clients.map((c) => c.quit()));
  });
});
