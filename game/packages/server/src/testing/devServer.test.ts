import { afterEach, describe, expect, it, vi } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { startDevServer, type DevServer } from './devServer.js';

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

describe('全内存开发服务', () => {
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
