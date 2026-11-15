import { afterEach, describe, expect, it, vi } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import Redis from 'ioredis';
import { nextAutoAction } from '@icgame/bot';
import { startDevServer, type DevServer } from './devServer.js';
import { RedisKeys } from '../infra/redisKeys.js';
import { InMemoryMatchArchive } from '../match/MatchArchive.js';
import { InMemoryReputationStore, ReputationService } from '../services/ReputationService.js';

vi.mock('../infra/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let dev: DevServer | null = null;
const sockets: Socket[] = [];

afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await dev?.stop();
  dev = null;
});

async function api<T>(
  base: string,
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(res.status).toBeLessThan(300);
  return (await res.json()) as T;
}

function firstState(base: string, token: string, matchID: string): Promise<{ seat: string }> {
  return new Promise((resolve, reject) => {
    const socket = io(base, { path: '/ws', auth: { token, matchID }, transports: ['websocket'] });
    sockets.push(socket);
    socket.on('icg:state', (msg: { seat: string }) => resolve(msg));
    socket.on('connect_error', reject);
  });
}

const redisUrl = process.env.TEST_REDIS_URL;
describe.skipIf(!redisUrl)('快速匹配 HTTP 与真实 Redis', () => {
  it('配桌前移走信誉已跨档的玩家，旧票据也能原地迁移且保留顺序', async () => {
    const prefix = `ico-test-${crypto.randomUUID()}:`;
    const redis = new Redis(redisUrl!, { keyPrefix: prefix });
    const store = new InMemoryReputationStore();
    const reputation = new ReputationService(store);
    try {
      dev = await startDevServer({ matchmakingRedis: redis, reputation });
      const { url, rt } = dev;
      const [changed, a, b, c, d, legacy, trusted] = await Promise.all(
        Array.from({ length: 7 }, (_, i) =>
          api<{ playerId: string; token: string }>(url, 'POST', '/identity/init', undefined, {
            nickname: `分池玩家${i}`,
          }),
        ),
      );
      const request = (user: { token: string }, method = 'GET') =>
        api<{ status: string; ticketId?: number }>(
          url,
          method,
          '/matchmake',
          user.token,
          method === 'POST' ? { playerCount: 4 } : undefined,
        );
      for (const user of [changed, a, b, c, d]) await store.applyDelta(user!.playerId, 0, 50, 3);
      const ticket = await request(changed!, 'POST');
      await request(a!, 'POST');
      await request(b!, 'POST');

      // 配桌已经读取候选账号，信誉在整桌复核前发生变化。
      const findMany = store.findMany.bind(store);
      const readCohorts = vi.spyOn(store, 'findMany').mockImplementation(async (ids) => {
        if (ids.length === 4) await store.applyDelta(changed!.playerId, -12, 50);
        return findMany(ids);
      });
      try {
        expect(await request(c!, 'POST')).toMatchObject({ status: 'queued' });
        expect(readCohorts).toHaveBeenCalledWith([changed, a, b, c].map((user) => user!.playerId));
      } finally {
        readCohorts.mockRestore();
      }
      expect(rt.matches.activeCount()).toBe(0);
      expect(await request(changed!)).toEqual({ ...ticket, lowReputation: true });
      expect(await request(d!, 'POST')).toMatchObject({ status: 'matched' });
      expect(rt.matches.activeCount()).toBe(1);

      await store.applyDelta(trusted!.playerId, 20, 50, 20);
      const trustedTicket = await request(trusted!, 'POST');
      const trustedRaw = await redis.get(RedisKeys.matchmakingTicket(trusted!.playerId));
      expect(trustedRaw && JSON.parse(trustedRaw)).toMatchObject({ queue: '4:classic:trusted' });
      expect(trustedTicket).toMatchObject({ status: 'queued' });

      const key = RedisKeys.matchmakingTicket(legacy!.playerId);
      const baseQueue = `${RedisKeys.matchmaking()}:queue:`;
      await redis.set(
        key,
        JSON.stringify({ queue: '4:classic:normal', playerCount: 4, order: 1000 }),
        'EX',
        60,
      );
      await redis.zadd(`${baseQueue}4:classic:normal`, 1000, legacy!.playerId);
      expect(await request(legacy!)).toEqual({ status: 'queued', playerCount: 4, ticketId: 1000 });
      expect(await redis.zscore(`${baseQueue}4:classic:normal`, legacy!.playerId)).toBeNull();
      expect(await redis.zscore(`${baseQueue}4:classic:novice`, legacy!.playerId)).toBe('1000');
    } finally {
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length) await redis.del(...keys.map((key) => key.slice(prefix.length)));
      await redis.quit();
    }
  });

  it('前三场按新手分池，凑桌时已完成第三场的账号保留票据迁出', async () => {
    const prefix = `ico-test-${crypto.randomUUID()}:`;
    const redis = new Redis(redisUrl!, { keyPrefix: prefix });
    const store = new InMemoryReputationStore();
    const reputation = new ReputationService(store);
    try {
      dev = await startDevServer({ matchmakingRedis: redis, reputation });
      const { url, rt } = dev;
      const users = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          api<{ playerId: string; token: string }>(url, 'POST', '/identity/init', undefined, {
            nickname: `新手池玩家${i}`,
          }),
        ),
      );
      const [graduating, lowNovice, a, b, c, veteran] = users;
      const request = (user: (typeof users)[number], method = 'GET') =>
        api<{ status: string; matchId?: string; ticketId?: number }>(
          url,
          method,
          '/matchmake',
          user.token,
          method === 'POST' ? { playerCount: 4 } : undefined,
        );
      await store.applyDelta(graduating!.playerId, 0, 50, 2);
      await store.applyDelta(lowNovice!.playerId, -15, 50);
      await store.applyDelta(veteran!.playerId, 0, 50, 3);

      const ticket = await request(graduating!, 'POST');
      expect(await request(veteran!, 'POST')).toMatchObject({ status: 'queued' });
      expect(await request(lowNovice!, 'POST')).not.toHaveProperty('lowReputation');
      expect(await request(a!, 'POST')).toMatchObject({ status: 'queued' });
      expect(rt.matches.activeCount()).toBe(0);

      await reputation.adjust(graduating!.playerId, 'abandon');
      expect(await request(graduating!)).toEqual(ticket);
      await reputation.adjust(graduating!.playerId, 'complete');
      expect(await request(b!, 'POST')).toMatchObject({ status: 'queued' });
      const regularQueue = `${RedisKeys.matchmaking()}:queue:4:classic:regular`;
      expect(await redis.zscore(regularQueue, graduating!.playerId)).toBe(String(ticket.ticketId));
      expect(await request(graduating!)).toEqual(ticket);

      const { status, matchId } = await request(c!, 'POST');
      expect(status).toBe('matched');
      expect(
        rt.matches
          .get(matchId!)
          ?.seats()
          .map(({ playerId }) => playerId),
      ).toEqual([lowNovice, a, b, c].map((user) => user!.playerId));
      expect(await request(veteran!)).toMatchObject({ status: 'queued' });
    } finally {
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length) await redis.del(...keys.map((key) => key.slice(prefix.length)));
      await redis.quit();
    }
  });

  it('第三场还在结算时复用原票据，入库后才能进入常规池', async () => {
    const prefix = `ico-test-${crypto.randomUUID()}:`;
    const redis = new Redis(redisUrl!, { keyPrefix: prefix });
    const store = new InMemoryReputationStore();
    const reputation = new ReputationService(store);
    let release = (): void => {};
    let entered = (): void => {};
    const releaseFinish = new Promise<void>((resolve) => {
      release = resolve;
    });
    const enteredFinish = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const recordFinish = InMemoryMatchArchive.prototype.recordFinish;
    const slowFinish = vi
      .spyOn(InMemoryMatchArchive.prototype, 'recordFinish')
      .mockImplementationOnce(async function (this: InMemoryMatchArchive, ...args) {
        entered();
        await releaseFinish;
        await recordFinish.apply(this, args);
      });
    let lastMove: Promise<unknown> | undefined;
    try {
      dev = await startDevServer({
        matchmakingRedis: redis,
        reputation,
        randomSeed: () => 'ab'.repeat(32),
      });
      const { url, rt } = dev;
      const users = await Promise.all(
        Array.from({ length: 7 }, (_, i) =>
          api<{ playerId: string; token: string }>(url, 'POST', '/identity/init', undefined, {
            nickname: `结算玩家${i}`,
          }),
        ),
      );
      const join = (user: (typeof users)[number]) =>
        api<{ status: string; matchId?: string }>(url, 'POST', '/matchmake', user.token, {
          playerCount: 4,
        });
      const graduating = users[0]!;
      await store.applyDelta(graduating.playerId, 0, 50, 2);
      for (const user of users.slice(0, 3)) await join(user);
      const { matchId } = await join(users[3]!);
      const room = rt.matches.get(matchId!)!;
      for (const user of users.slice(4)) await join(user);

      for (let i = 0; i < 1000 && room.current().ctx.gameover === undefined; i++) {
        const action = nextAutoAction(room.current(), { humanPlayerIDs: [] })!;
        lastMove = room
          .submit(action.playerID, { ...action, intentId: String(i) })
          .then((result) => {
            expect(result.ok).toBe(true);
          });
        await Promise.race([lastMove, enteredFinish]);
      }
      expect(room.current().ctx.gameover).toBeDefined();
      expect((await reputation.get(graduating.playerId)).completedMatches).toBe(2);
      const headers = {
        authorization: `Bearer ${graduating.token}`,
        'content-type': 'application/json',
      };
      const retry = await fetch(`${url}/matchmake`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ playerCount: 4 }),
      });
      expect(retry.status).toBe(409);
      expect(rt.matches.activeCount()).toBe(1);
      const ticket = await redis.get(RedisKeys.matchmakingTicket(graduating.playerId));
      const assignment = JSON.parse(ticket!) as { matchId: string; order: number };
      expect(assignment.matchId).toBe(matchId);
      expect(
        await api(url, 'DELETE', `/matchmake?ticketId=${assignment.order}`, graduating.token),
      ).toEqual({ status: 'idle' });
      expect(await api(url, 'POST', `/matches/${matchId}/leave`, graduating.token)).toEqual({
        ok: true,
      });
      expect(await redis.get(RedisKeys.matchmakingTicket(graduating.playerId))).toBe(ticket);

      release();
      await lastMove;
      expect((await reputation.get(graduating.playerId)).completedMatches).toBe(3);
      expect(await join(graduating)).toMatchObject({ status: 'queued' });
      expect(
        await redis.zscore(
          `${RedisKeys.matchmaking()}:queue:4:classic:regular`,
          graduating.playerId,
        ),
      ).not.toBeNull();
    } finally {
      release();
      await lastMove;
      slowFinish.mockRestore();
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length) await redis.del(...keys.map((key) => key.slice(prefix.length)));
      await redis.quit();
    }
  });

  it('按人数和信誉分池，取消或掉线票据不会占位，并发请求只建一局', async () => {
    const prefix = `ico-test-${crypto.randomUUID()}:`;
    const redis = new Redis(redisUrl!, { keyPrefix: prefix });
    const reputationStore = new InMemoryReputationStore();
    const reputation = new ReputationService(reputationStore);
    try {
      dev = await startDevServer({ matchmakingRedis: redis, reputation });
      const base = dev.url;
      const users = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          api<{ playerId: string; token: string }>(base, 'POST', '/identity/init', undefined, {
            nickname: `匹配玩家${i}`,
          }),
        ),
      );
      const [a, b, c, waiter, otherSize, otherReputation, expired, d] = users;
      type User = (typeof users)[number];
      const join = (user: User, playerCount = 4) =>
        api<{ status: string; ticketId: number }>(base, 'POST', '/matchmake', user.token, {
          playerCount,
        });
      const status = (user: User) =>
        api<{ status: string; matchId: string }>(base, 'GET', '/matchmake', user.token);
      await reputationStore.applyDelta(otherReputation!.playerId, -15, 50, 3);
      expect((await fetch(`${base}/matchmake`)).status).toBe(401);
      expect(await join(otherSize!, 5)).toMatchObject({ status: 'queued', playerCount: 5 });
      expect(await join(otherReputation!)).toMatchObject({ status: 'queued' });
      const cancel = (user: User, ticketId: number) =>
        api(base, 'DELETE', `/matchmake?ticketId=${ticketId}`, user.token);
      const firstTicket = await join(waiter!);
      expect(firstTicket).toMatchObject({ status: 'queued' });
      expect(await cancel(waiter!, firstTicket.ticketId)).toEqual({ status: 'idle' });
      const secondTicket = await join(waiter!, 5);
      expect(await cancel(waiter!, firstTicket.ticketId)).toEqual(secondTicket);
      expect(await cancel(waiter!, secondTicket.ticketId)).toEqual({ status: 'idle' });
      const reserved = await join(waiter!, 5);
      // 模拟 Redis 已分配席位、进程尚未创建出对局就重启。
      const ticketKey = RedisKeys.matchmakingTicket(waiter!.playerId);
      const raw = JSON.parse((await redis.get(ticketKey))!) as { queue: string };
      const [redisNow] = await redis.time();
      await redis.set(
        ticketKey,
        JSON.stringify({
          ...raw,
          matchId: crypto.randomUUID(),
          queuedUntil: Number(redisNow) + 30,
        }),
      );
      await redis.zrem(`${RedisKeys.matchmaking()}:queue:${raw.queue}`, waiter!.playerId);
      expect(await status(waiter!)).toEqual(reserved);
      expect(await cancel(waiter!, reserved.ticketId)).toEqual({ status: 'idle' });
      expect(await join(expired!)).toMatchObject({ status: 'queued' });
      await redis.del(RedisKeys.matchmakingTicket(expired!.playerId));
      expect(await join(a!)).toMatchObject({ status: 'queued' });
      expect(await join(a!, 5)).toMatchObject({ status: 'queued', playerCount: 4 });
      expect(await join(b!)).toMatchObject({ status: 'queued' });
      expect(await join(c!)).toMatchObject({ status: 'queued' });
      const createMatch = vi.spyOn(dev.rt.matches, 'createMatchedMatch');
      createMatch.mockRejectedValueOnce(new Error('建局暂时失败'));
      const failed = await fetch(`${base}/matchmake`, {
        method: 'POST',
        headers: { authorization: `Bearer ${d!.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ playerCount: 4 }),
      });
      expect(failed.status).toBe(500);
      expect(dev.rt.matches.activeCount()).toBe(0);
      await Promise.all([join(d!), join(d!), status(a!), status(otherSize!)]);

      const participants = [a!, b!, c!, d!];
      const results = await Promise.all(participants.map(status));
      const { matchId } = results[0]!;
      expect(matchId).toMatch(/^[a-f0-9-]{36}$/);
      expect(results).toEqual(participants.map(() => ({ status: 'matched', matchId })));
      expect(dev.rt.matches.activeCount()).toBe(1);
      expect(createMatch).toHaveBeenCalledTimes(2);
      expect(
        dev.rt.matches
          .get(matchId)
          ?.seats()
          .map(({ playerId }) => playerId),
      ).toEqual(participants.map(({ playerId }) => playerId));
      const views = await Promise.all(
        participants.map((user) => firstState(base, user.token, matchId)),
      );
      expect(views.map(({ seat }) => seat)).toEqual(['0', '1', '2', '3']);
      expect(await status(otherSize!)).toMatchObject({ status: 'queued', playerCount: 5 });
      expect(await status(otherReputation!)).toMatchObject({
        status: 'queued',
        playerCount: 4,
        lowReputation: true,
      });
      expect(await status(waiter!)).toEqual({ status: 'idle' });
      expect(await status(expired!)).toEqual({ status: 'idle' });

      const friend = await api<{ code: string }>(base, 'POST', '/rooms', otherSize!.token, {
        maxPlayers: 4,
      });
      expect(await status(otherSize!)).toEqual({ status: 'idle' });
      const joinRoom = (user: User) =>
        fetch(`${base}/rooms/${friend.code}/join`, {
          method: 'POST',
          headers: { authorization: `Bearer ${user.token}` },
        });
      expect((await joinRoom(otherReputation!)).status).toBe(200);
      expect(await status(otherReputation!)).toEqual({ status: 'idle' });
      expect((await joinRoom(b!)).status).toBe(409);

      const leave = `${base}/matches/${matchId}/leave`;
      expect(
        (
          await fetch(leave, {
            method: 'POST',
            headers: { authorization: `Bearer ${waiter!.token}` },
          })
        ).status,
      ).toBe(403);
      expect(await api(base, 'POST', `/matches/${matchId}/leave`, a!.token)).toEqual({ ok: true });
      expect(await status(a!)).toEqual({ status: 'idle' });
      expect(await status(b!)).toEqual({ status: 'matched', matchId });
      // 响应丢失时重复提交退出仍成功，且已经让出的席位不会恢复。
      expect(await api(base, 'POST', `/matches/${matchId}/leave`, a!.token)).toEqual({ ok: true });
    } finally {
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length) await redis.del(...keys.map((key) => key.slice(prefix.length)));
      await redis.quit();
    }
  });
});

describe('全内存开发服务', () => {
  it('公开房间按人数和游标查询，只展示有空位的等待房间', async () => {
    dev = await startDevServer();
    const base = dev.url;
    const { token } = await api<{ token: string }>(base, 'POST', '/identity/init', undefined, {
      nickname: '房主',
    });
    const create = (body: unknown) => api<{ code: string }>(base, 'POST', '/rooms', token, body);
    const list = (query = '') =>
      api<{ data: { code: string }[]; nextCursor: string | null; hasMore: boolean }>(
        base,
        'GET',
        `/rooms/public${query}`,
        token,
      );
    await create({ maxPlayers: 4 });
    const four = await create({ maxPlayers: 4, isPublic: true });
    const five = await create({ maxPlayers: 5, isPublic: true });
    const full = await create({ maxPlayers: 4, isPublic: true });
    await api(base, 'POST', `/rooms/${full.code}/fill-ai`, token);

    const page = await list('?limit=1');
    expect(page).toEqual({
      data: [{ code: expect.any(String), currentPlayers: 1, maxPlayers: expect.any(Number) }],
      nextCursor: expect.any(String),
      hasMore: true,
    });
    const next = await list(`?limit=1&cursor=${encodeURIComponent(page.nextCursor!)}`);
    expect(next).toMatchObject({ nextCursor: null, hasMore: false });
    expect(new Set([...page.data, ...next.data].map(({ code }) => code))).toEqual(
      new Set([four.code, five.code]),
    );
    expect((await list('?maxPlayers=4')).data).toEqual([
      { code: four.code, currentPlayers: 1, maxPlayers: 4 },
    ]);

    await api(base, 'POST', `/rooms/${four.code}/fill-ai`, token);
    await api(base, 'POST', `/rooms/${four.code}/start`, token);
    await api(base, 'POST', `/rooms/${five.code}/leave`, token);
    expect(await list()).toEqual({ data: [], nextCursor: null, hasMore: false });
  });

  it('公开房间最后一个空位只有一个并发加入请求成功', async () => {
    dev = await startDevServer();
    const base = dev.url;
    const [owner, a, b] = await Promise.all(
      ['房主', '玩家甲', '玩家乙'].map((nickname) =>
        api<{ token: string }>(base, 'POST', '/identity/init', undefined, { nickname }),
      ),
    );
    const { code } = await api<{ code: string }>(base, 'POST', '/rooms', owner!.token, {
      maxPlayers: 4,
      isPublic: true,
    });
    await api(base, 'POST', `/rooms/${code}/fill-ai`, owner!.token, { count: 2 });
    const joins = await Promise.all(
      [a!, b!].map(({ token }) =>
        fetch(`${base}/rooms/${code}/join`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
        }),
      ),
    );
    expect(joins.map(({ status }) => status).sort()).toEqual([200, 409]);
    const [{ room }, persisted] = await Promise.all([
      joins.find(({ ok }) => ok)!.json(),
      api(base, 'GET', `/rooms/code/${code}`, owner!.token),
    ]);
    expect(persisted).toMatchObject({ players: room.players, currentPlayers: 4 });
  });

  it('建档、建房、加入、补 Bot、开始后，两个连接都收到首包', async () => {
    dev = await startDevServer({ port: 0 });
    const base = dev.url;

    const a = await api<{ token: string }>(base, 'POST', '/identity/init', undefined, {
      nickname: '甲',
    });
    const b = await api<{ token: string }>(base, 'POST', '/identity/init', undefined, {
      nickname: '乙',
    });
    const room = await api<{ code: string }>(base, 'POST', '/rooms', a.token, { maxPlayers: 4 });
    await api(base, 'POST', `/rooms/${room.code}/join`, b.token);
    await api(base, 'POST', `/rooms/${room.code}/fill-ai`, a.token);
    const started = await api<{ matchId: string }>(
      base,
      'POST',
      `/rooms/${room.code}/start`,
      a.token,
    );

    const [sa, sb] = await Promise.all([
      firstState(base, a.token, started.matchId),
      firstState(base, b.token, started.matchId),
    ]);
    expect(new Set([sa.seat, sb.seat]).size).toBe(2);
  });

  it('固定了种子：每一局的种子都是它，首包里却看不到种子', async () => {
    dev = await startDevServer({ port: 0, randomSeed: () => 'fixed-seed-for-test' });
    const base = dev.url;
    const a = await api<{ token: string }>(base, 'POST', '/identity/init', undefined, {
      nickname: '甲',
    });
    const starts: string[] = [];
    for (let i = 0; i < 2; i++) {
      const room = await api<{ code: string }>(base, 'POST', '/rooms', a.token, { maxPlayers: 4 });
      await api(base, 'POST', `/rooms/${room.code}/fill-ai`, a.token);
      const started = await api<{ matchId: string }>(
        base,
        'POST',
        `/rooms/${room.code}/start`,
        a.token,
      );
      starts.push(started.matchId);
      const first = await firstState(base, a.token, started.matchId);
      expect(JSON.stringify(first)).not.toContain('fixed-seed-for-test');
      // 两局都用同一个种子，也就是同一份布局
      expect(dev.rt.matches.get(started.matchId)?.current().G.rngSeed).toBe('fixed-seed-for-test');
      // 腾出玩家的「已在房间中」限制，下一局才能再建房
      await api(base, 'POST', `/rooms/${room.code}/leave`, a.token).catch(() => undefined);
    }
    expect(new Set(starts).size).toBe(2);
  });

  it('环境变量配置了固定种子：开发服务采用；生产环境配置则拒绝启动', async () => {
    vi.stubEnv('MATCH_FIXED_SEED', 'env-seed');
    try {
      dev = await startDevServer({ port: 0 });
      const base = dev.url;
      const a = await api<{ token: string }>(base, 'POST', '/identity/init', undefined, {
        nickname: '甲',
      });
      const room = await api<{ code: string }>(base, 'POST', '/rooms', a.token, { maxPlayers: 4 });
      await api(base, 'POST', `/rooms/${room.code}/fill-ai`, a.token);
      const started = await api<{ matchId: string }>(
        base,
        'POST',
        `/rooms/${room.code}/start`,
        a.token,
      );
      expect(dev.rt.matches.get(started.matchId)?.current().G.rngSeed).toBe('env-seed');
      await dev.stop();
      dev = null;

      vi.stubEnv('NODE_ENV', 'production');
      await expect(startDevServer({ port: 0 })).rejects.toThrow('MATCH_FIXED_SEED');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('没固定种子：每一局的种子都不一样', async () => {
    dev = await startDevServer({ port: 0 });
    const base = dev.url;
    const a = await api<{ token: string }>(base, 'POST', '/identity/init', undefined, {
      nickname: '甲',
    });
    const seeds = new Set<string>();
    for (let i = 0; i < 2; i++) {
      const room = await api<{ code: string }>(base, 'POST', '/rooms', a.token, { maxPlayers: 4 });
      await api(base, 'POST', `/rooms/${room.code}/fill-ai`, a.token);
      const started = await api<{ matchId: string }>(
        base,
        'POST',
        `/rooms/${room.code}/start`,
        a.token,
      );
      seeds.add(dev.rt.matches.get(started.matchId)!.current().G.rngSeed);
      await api(base, 'POST', `/rooms/${room.code}/leave`, a.token).catch(() => undefined);
    }
    expect(seeds.size).toBe(2);
  });

  it('房间变化经 /rooms 命名空间推给成员：加入、补 Bot、开始都不用轮询；局外人连不上', async () => {
    dev = await startDevServer({ port: 0 });
    const base = dev.url;
    const a = await api<{ token: string }>(base, 'POST', '/identity/init', undefined, {
      nickname: '甲',
    });
    const b = await api<{ token: string }>(base, 'POST', '/identity/init', undefined, {
      nickname: '乙',
    });
    const outsider = await api<{ token: string }>(base, 'POST', '/identity/init', undefined, {
      nickname: '丙',
    });
    const room = await api<{ code: string }>(base, 'POST', '/rooms', a.token, { maxPlayers: 4 });

    interface RoomMsg {
      room: { status: string; matchId?: string; players: Array<{ nickname: string }> };
    }
    const received: RoomMsg[] = [];
    const socket = io(`${base}/rooms`, {
      path: '/ws',
      auth: { token: a.token, code: room.code },
      transports: ['websocket'],
    });
    sockets.push(socket);
    socket.on('icg:room', (msg: RoomMsg) => received.push(msg));
    const until = async (cond: () => boolean): Promise<void> => {
      const deadline = Date.now() + 3000;
      while (!cond()) {
        if (Date.now() > deadline) throw new Error('等待超时');
        await new Promise((r) => setTimeout(r, 10));
      }
    };

    // 连上就收到当前状态
    await until(() => received.length === 1);
    expect(received[0]!.room.players).toHaveLength(1);

    await api(base, 'POST', `/rooms/${room.code}/join`, b.token);
    await until(() => received.length === 2);
    expect(received[1]!.room.players.map((p) => p.nickname)).toContain('乙');

    await api(base, 'POST', `/rooms/${room.code}/fill-ai`, a.token);
    await until(() => received.length === 3);
    expect(received[2]!.room.players).toHaveLength(4);

    await api(base, 'POST', `/rooms/${room.code}/start`, a.token);
    await until(() => received.length === 4);
    expect(received[3]!.room.status).toBe('playing');
    expect(received[3]!.room.matchId).toBeTruthy();
    // 推送里没有对局内的东西
    expect(JSON.stringify(received[3])).not.toMatch(/rngState|hand|vault/i);

    const rejected = await new Promise<string>((resolve) => {
      const s = io(`${base}/rooms`, {
        path: '/ws',
        auth: { token: outsider.token, code: room.code },
        transports: ['websocket'],
        reconnection: false,
      });
      sockets.push(s);
      s.on('connect_error', (err: Error) => resolve(err.message));
    });
    expect(rejected).toBe('NOT_IN_ROOM');
  });

  it('邀请链接：抓取器得到带房间码的分享卡片，浏览器被重定向；成员昵称不出现在卡片里', async () => {
    dev = await startDevServer({ port: 0 });
    const base = dev.url;
    const a = await api<{ token: string }>(base, 'POST', '/identity/init', undefined, {
      nickname: '机密昵称',
    });
    const room = await api<{ code: string }>(base, 'POST', '/rooms', a.token, { maxPlayers: 4 });

    const card = await fetch(`${base}/invite/${room.code}`, {
      headers: { 'user-agent': 'Twitterbot/1.0' },
    });
    expect(card.status).toBe(200);
    const html = await card.text();
    expect(html).toContain('og:title');
    expect(html).toContain(room.code);
    expect(html).toContain(`${base}/invite/${room.code}`);
    expect(html).not.toContain('机密昵称');

    const redirect = await fetch(`${base}/invite/${room.code}`, {
      redirect: 'manual',
      headers: { 'user-agent': 'Mozilla/5.0 Chrome/126' },
    });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('location')).toBe(`/room/${room.code}`);

    const missing = await fetch(`${base}/invite/ZZZZZZ`, {
      headers: { 'user-agent': 'Twitterbot/1.0' },
    });
    expect(missing.status).toBe(200);
    expect(await missing.text()).not.toContain('ZZZZZZ');
  });

  it('举报：对真人座位成功，同一局重复举报 409，举报自己与 Bot 座位 400，局外人 403', async () => {
    dev = await startDevServer({ port: 0 });
    const base = dev.url;
    const a = await api<{ token: string }>(base, 'POST', '/identity/init', undefined, {
      nickname: '甲',
    });
    const b = await api<{ token: string }>(base, 'POST', '/identity/init', undefined, {
      nickname: '乙',
    });
    const outsider = await api<{ token: string }>(base, 'POST', '/identity/init', undefined, {
      nickname: '丙',
    });
    const room = await api<{ code: string }>(base, 'POST', '/rooms', a.token, { maxPlayers: 4 });
    await api(base, 'POST', `/rooms/${room.code}/join`, b.token);
    await api(base, 'POST', `/rooms/${room.code}/fill-ai`, a.token);
    const started = await api<{ matchId: string }>(
      base,
      'POST',
      `/rooms/${room.code}/start`,
      a.token,
    );
    const [sa, sb] = await Promise.all([
      firstState(base, a.token, started.matchId),
      firstState(base, b.token, started.matchId),
    ]);

    const post = (token: string, body: unknown): Promise<Response> =>
      fetch(`${base}/matches/${started.matchId}/report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
    const botSeat = [0, 1, 2, 3].find((n) => String(n) !== sa.seat && String(n) !== sb.seat)!;

    expect((await post(a.token, { targetSeat: Number(sb.seat), reason: 'afk' })).status).toBe(201);
    expect((await post(a.token, { targetSeat: Number(sb.seat), reason: 'afk' })).status).toBe(409);
    expect((await post(a.token, { targetSeat: Number(sa.seat), reason: 'afk' })).status).toBe(400);
    expect((await post(a.token, { targetSeat: botSeat, reason: 'afk' })).status).toBe(400);
    expect(
      (await post(outsider.token, { targetSeat: Number(sa.seat), reason: 'afk' })).status,
    ).toBe(403);
    expect((await post(b.token, { targetSeat: Number(sa.seat), reason: 'nope' })).status).toBe(400);
  });
  it('凭恢复码在新设备找回账号：旧设备的对局与房间连接被踢，旧令牌不能再握手，新令牌可以', async () => {
    dev = await startDevServer({ port: 0 });
    const base = dev.url;
    const a = await api<{ token: string; recoveryCode: string }>(
      base,
      'POST',
      '/identity/init',
      undefined,
      { nickname: '甲' },
    );
    const room = await api<{ code: string }>(base, 'POST', '/rooms', a.token, { maxPlayers: 4 });
    await api(base, 'POST', `/rooms/${room.code}/fill-ai`, a.token);
    const started = await api<{ matchId: string }>(
      base,
      'POST',
      `/rooms/${room.code}/start`,
      a.token,
    );

    const open = (url: string, auth: Record<string, string>) => {
      // 两条连接各用独立的底层连接（forceNew），否则同一地址的连接会被复用，断开一条会带走另一条
      const socket = io(url, {
        path: '/ws',
        auth,
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      sockets.push(socket);
      const errors: Array<{ code?: string }> = [];
      socket.on('icg:error', (msg: { code?: string }) => errors.push(msg));
      return { socket, errors };
    };
    const until = async (cond: () => boolean): Promise<void> => {
      const deadline = Date.now() + 3000;
      while (!cond()) {
        if (Date.now() > deadline) throw new Error('等待超时');
        await new Promise((r) => setTimeout(r, 10));
      }
    };
    const matchConn = open(base, { token: a.token, matchID: started.matchId });
    const roomConn = open(`${base}/rooms`, { token: a.token, code: room.code });
    await until(() => matchConn.socket.connected && roomConn.socket.connected);

    // 新设备凭恢复码找回
    const recovered = await api<{ token: string }>(base, 'POST', '/identity/recover', undefined, {
      code: a.recoveryCode,
    });

    await until(() => matchConn.socket.disconnected && roomConn.socket.disconnected);
    expect(matchConn.errors).toContainEqual(expect.objectContaining({ code: 'TOKEN_REVOKED' }));
    expect(roomConn.errors).toContainEqual(expect.objectContaining({ code: 'TOKEN_REVOKED' }));

    // 旧令牌重连被拒，且原因明确；新令牌正常
    const rejectOf = (url: string, auth: Record<string, string>) =>
      new Promise<string>((resolve) => {
        const { socket } = open(url, auth);
        socket.on('connect_error', (err: Error) => resolve(err.message));
      });
    expect(await rejectOf(base, { token: a.token, matchID: started.matchId })).toBe(
      'TOKEN_REVOKED',
    );
    expect(await rejectOf(`${base}/rooms`, { token: a.token, code: room.code })).toBe(
      'TOKEN_REVOKED',
    );
    expect((await firstState(base, recovered.token, started.matchId)).seat).toBeTruthy();
  });
});
