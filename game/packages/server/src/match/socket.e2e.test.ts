// 真实 socket 驱动的整局测试：真实的 socket.io 服务端与客户端，脚本打完一局，
// 检查每个客户端收到的内容、伪造请求、服务重启后的恢复与掉线接管。

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { InceptionCityGame, eventsFor, viewMatch } from '@icgame/game-engine';
import { signToken } from '../infra/jwt.js';
import { logger } from '../infra/logger.js';
import { InMemoryMatchStore } from './MatchStore.js';
import { InMemoryMatchArchive } from './MatchArchive.js';
import { InMemoryRateGuard } from '../services/RateGuardService.js';
import { createMemoryIdentityPrisma } from '../testing/memoryIdentity.js';
import {
  connect,
  decideMove,
  FAST_TIMING,
  makeRoom,
  rebuildMatch,
  startServer,
  tryConnect,
  waitUntil,
  type RoomAccount,
  type TestClient,
  type TestServer,
} from '../testing/matchHarness.js';

vi.mock('../infra/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const clients: TestClient[] = [];
const servers: TestServer[] = [];

/** 登记以便 afterEach 统一关停 */
function track<T extends TestClient>(c: T): T {
  clients.push(c);
  return c;
}
async function boot(opts: Parameters<typeof startServer>[0] = {}): Promise<TestServer> {
  const s = await startServer(opts);
  servers.push(s);
  return s;
}

afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  for (const s of servers.splice(0)) {
    await s.stop();
    expect(s.rt.httpServer.listening).toBe(false);
  }
});

async function joinAll(
  server: TestServer,
  accounts: RoomAccount[],
  matchID: string,
): Promise<TestClient[]> {
  const out: TestClient[] = [];
  for (const a of accounts) out.push(track(await connect(server, a, matchID)));
  return out;
}

const allInPlaying = (cs: TestClient[]): boolean =>
  cs.every((c) => c.latestView()?.ctx.phase === 'playing');

// ---------------------------------------------------------------------------
// 一、整局 + 二、抓包检查
// ---------------------------------------------------------------------------

describe('整局：4 个真人座位 + 2 个 Bot 座位', () => {
  interface Played {
    clients: TestClient[];
    server: TestServer;
    matchID: string;
    accounts: RoomAccount[];
    activeAfter: string[];
  }
  let played: Played | null = null;
  let failure: unknown = null;
  let server0: TestServer | null = null;

  beforeAll(async () => {
    try {
      const server = await startServer();
      server0 = server;
      const { room, accounts } = makeRoom({ humans: 4, bots: 2 });
      await server.rt.matches.createFromRoom(room);
      const cs = await joinAll(server, accounts, room.id);
      for (const c of cs) c.startAutoPlay();
      await waitUntil(() => cs.every((c) => c.isGameOver()), '所有客户端都收到终局视图', 25_000);
      await waitUntil(
        async () => !(await server.store.listActive()).includes(room.id),
        '对局从活跃集合移除',
      );
      played = {
        clients: cs,
        server,
        matchID: room.id,
        accounts,
        activeAfter: await server.store.listActive(),
      };
    } catch (err) {
      failure = err;
    }
  }, 30_000);

  afterAll(async () => {
    if (played !== null) {
      for (const c of played.clients) c.close();
      await played.server.stop();
      expect(played.server.rt.httpServer.listening).toBe(false);
    } else if (server0 !== null) {
      await server0.stop();
    }
  });

  it('打完整局：各客户端终局版本号相同，归档步数等于版本号，对局不再活跃', async () => {
    if (failure !== null) throw failure;
    const p = played!;
    const finals = p.clients.map((c) => c.latestStateID());
    expect(new Set(finals).size).toBe(1);
    const steps = await p.server.archive.listSteps(p.matchID);
    expect(steps.length).toBe(finals[0]);
    expect(p.activeAfter).not.toContain(p.matchID);
    const snap = await p.server.store.load(p.matchID);
    expect(snap!.state.stateID).toBe(finals[0]);
    expect(snap!.state.ctx.gameover).toBeDefined();
    for (const c of p.clients) expect(c.isGameOver()).toBe(true);
  });

  it('真人客户端自己发的 move 被接受过（每个座位都有）', () => {
    if (failure !== null) throw failure;
    const p = played!;
    for (const c of p.clients) {
      expect(c.acceptedCount, `座位 ${c.seat} 被接受的 move 数`).toBeGreaterThan(0);
    }
  });

  it('抓包检查：每条视图与事件都等于服务端按座位算出的，且不含种子与随机数状态', async () => {
    if (failure !== null) throw failure;
    const p = played!;
    const { rebuilt, seed } = await rebuildMatch(p.server.store, p.server.archive, p.matchID);
    const snap = await p.server.store.load(p.matchID);
    // 重放出的终局与存储里的终局完全一致
    expect(rebuilt.states.at(-1)).toEqual(snap!.state);

    const rngStates = rebuilt.states.map((s) => s.rngState);
    const rngKeys = rngStates.map((s) => s.split(':')[0]!);

    for (const c of p.clients) {
      const seat = c.seat!;
      let checked = 0;
      for (const msg of c.views) {
        const id = msg.view.stateID;
        const state = rebuilt.states[id];
        expect(state, `版本 ${id} 应能重建`).toBeDefined();
        expect(msg.seat).toBe(seat);
        expect(msg.view).toEqual(viewMatch(InceptionCityGame, state!, seat));
        if (msg.type === 'icg:step') {
          expect(msg.events).toEqual(eventsFor(rebuilt.events[id]!, seat));
          for (const ev of msg.events) {
            // 别人 move 的参数、别人抽到的牌不在事件里
            if (ev.secret !== undefined) expect(ev.secret.to).toContain(seat);
          }
        }
        // 对局进行中别人的手牌为 null、只有自己的是数组；终局后引擎公开全部信息，不在此限
        const players = (msg.view.G as { players: Record<string, { hand: unknown }> }).players;
        for (const [pid, pl] of Object.entries(players)) {
          if (pid === seat) expect(Array.isArray(pl.hand)).toBe(true);
          else if (msg.view.ctx.gameover === undefined) expect(pl.hand).toBeNull();
        }
        checked += 1;
      }
      expect(checked, `座位 ${seat} 核对的消息数`).toBeGreaterThan(0);

      const text = JSON.stringify(c.received);
      expect(text).not.toContain(seed);
      expect(text).not.toContain('rngSeed');
      expect(text).not.toContain('rngState');
      expect(text).not.toMatch(/[0-9a-f]{64}/);
      for (const key of rngKeys) expect(text).not.toContain(key);
    }
  });
});

// ---------------------------------------------------------------------------
// 三、伪造
// ---------------------------------------------------------------------------

describe('伪造与畸形请求', () => {
  /** 4 个真人，截止拉长，局面停在轮到某个真人时 */
  async function stillRoom(opts: Parameters<typeof startServer>[0] = {}) {
    const server = await boot({
      timing: { turnTimeoutMs: 60_000, pendingTimeoutMs: 60_000, responseTimeoutCapMs: 60_000 },
      ...opts,
    });
    const { room, accounts } = makeRoom({ humans: 4, bots: 0 });
    await server.rt.matches.createFromRoom(room);
    const cs = await joinAll(server, accounts, room.id);
    await waitUntil(() => allInPlaying(cs), '进入对局阶段');
    const turnSeat = (): string =>
      (cs[0]!.latestView()!.G as { currentPlayerID: string }).currentPlayerID;
    const byTurn = (): TestClient => cs.find((c) => c.seat === turnSeat())!;
    const other = (): TestClient => cs.find((c) => c.seat !== turnSeat())!;
    return { server, room, accounts, cs, byTurn, other, turnSeat };
  }

  it('同一座位最多 3 条连接：第 4 条进来时最旧的一条收到 REPLACED 并被断开', async () => {
    const { server, room, accounts, cs } = await stillRoom();
    const extra: TestClient[] = [];
    for (let i = 0; i < 3; i++) extra.push(track(await connect(server, accounts[0]!, room.id)));

    await waitUntil(() => !cs[0]!.connected, '最旧的连接被断开');
    expect(
      cs[0]!.received.some(
        (r) => r.event === 'icg:error' && (r.payload as { code: string }).code === 'REPLACED',
      ),
    ).toBe(true);
    expect(extra.every((c) => c.connected)).toBe(true);
    expect(cs.slice(1).every((c) => c.connected)).toBe(true);
  });

  it('握手：非成员、不存在的对局、无效令牌都被拒绝', async () => {
    const server = await boot();
    const { room, accounts } = makeRoom({ humans: 4, bots: 0 });
    await server.rt.matches.createFromRoom(room);

    const stranger = signToken({ playerId: 'not-a-member', nickname: 'x' });
    const a = await tryConnect(server.url, stranger, room.id);
    expect(a).toEqual({ ok: false, reason: 'NOT_IN_MATCH' });

    const member = signToken({ playerId: accounts[0]!.playerId, nickname: 'x' });
    const b = await tryConnect(server.url, member, 'no-such-match');
    expect(b).toEqual({ ok: false, reason: 'NOT_IN_MATCH' });

    const c = await tryConnect(server.url, 'garbage', room.id);
    expect(c).toEqual({ ok: false, reason: 'AUTH_INVALID' });
  });

  it('消息里带别人的座位字段：仍按自己的座位处理，版本号不因它增加', async () => {
    const { cs, byTurn, other, turnSeat } = await stillRoom();
    const before = cs.map((c) => c.latestStateID());
    const forger = other();
    const res = await forger.send('doDraw', [], {
      seat: turnSeat(),
      playerID: turnSeat(),
      playerId: byTurn().playerId,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('not_active');
    // 全体版本号不变，且之后合法的真人 move 只推进一个版本
    expect(cs.map((c) => c.latestStateID())).toEqual(before);
    const ok = await byTurn().send('doDraw', []);
    expect(ok.ok).toBe(true);
    await waitUntil(() => cs.every((c) => c.latestStateID() === before[0]! + 1), '版本只前进一步');
  });

  it('未知 move、超长参数、超大请求、畸形载荷：都回拒绝，连接保持，对局继续', async () => {
    const { cs, byTurn, other } = await stillRoom();
    const c = other();
    const v0 = c.latestStateID();

    const unknown = await c.send('noSuchMove', []);
    expect(unknown).toMatchObject({ ok: false, code: 'unknown_move' });
    const tooMany = await c.send('doDraw', [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(tooMany).toMatchObject({ ok: false, code: 'args_too_long' });
    const huge = await c.send('doDraw', ['x'.repeat(5000)]);
    expect(huge).toMatchObject({ ok: false, code: 'request_too_large' });
    const notObject = await c.sendRaw('icg:move', 'doDraw');
    expect(notObject.ok).toBe(false);
    const arrayPayload = await c.sendRaw('icg:move', [1, 2]);
    expect(arrayPayload.ok).toBe(false);
    const nullPayload = await c.sendRaw('icg:move', null);
    expect(nullPayload.ok).toBe(false);

    expect(c.connected).toBe(true);
    expect(c.latestStateID()).toBe(v0);
    // 对局继续
    const ok = await byTurn().send('doDraw', []);
    expect(ok.ok).toBe(true);
    await waitUntil(() => cs.every((x) => x.latestStateID() === v0 + 1), '合法 move 照常推进');
  });

  it('同一 intentId 发两次：第二次结果相同，版本号只前进一次', async () => {
    const { cs, byTurn } = await stillRoom();
    const v0 = cs[0]!.latestStateID();
    const turn = byTurn();
    const first = await turn.send('doDraw', [], { intentId: 'dup-1' });
    const second = await turn.send('doDraw', [], { intentId: 'dup-1' });
    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    await waitUntil(() => cs.every((x) => x.latestStateID() === v0 + 1), '版本推进一步');
    // 再给一点机会让多余的步出现：发一条同步请求，版本仍是 v0+1
    const st = await cs[0]!.sync();
    expect(st.view.stateID).toBe(v0 + 1);
  });

  it('带过期的 stateID：被拒绝为 stale_state', async () => {
    const { cs, byTurn } = await stillRoom();
    const v0 = cs[0]!.latestStateID();
    const res = await byTurn().send('doDraw', [], { stateID: v0 - 1 });
    expect(res).toMatchObject({ ok: false, code: 'stale_state' });
    const ahead = await byTurn().send('doDraw', [], { stateID: v0 + 5 });
    expect(ahead).toMatchObject({ ok: false, code: 'stale_state' });
    expect(cs[0]!.latestStateID()).toBe(v0);
  });

  it('被拒绝的请求同样消耗配额：连发无效请求会被限流', async () => {
    const { cs } = await stillRoom({
      rateGuard: new InMemoryRateGuard({ maxPerWindow: 3, windowMs: 5_000 }),
    });
    const client = cs[0]!;
    const v0 = client.latestStateID();
    const results: Array<{ ok: boolean; code?: string }> = [];
    for (let i = 0; i < 8; i++) results.push(await client.send('noSuchMove', []));
    expect(results.map((r) => r.code)).toEqual([
      ...Array(3).fill('unknown_move'),
      ...Array(5).fill('rate_limited'),
    ]);
    expect(results.slice(3).every((r) => !r.ok && r.code === 'rate_limited')).toBe(true);
    expect(client.connected).toBe(true);
    expect(client.latestStateID()).toBe(v0);
  });

  it('请求过于频繁：出现 rate_limited，窗口过后恢复正常', async () => {
    const { cs, byTurn } = await stillRoom({
      rateGuard: new InMemoryRateGuard({ maxPerWindow: 2, windowMs: 500 }),
    });
    const turn = byTurn();
    const seat = turn.seat!;
    const next = (): { move: string; args: unknown[] } => decideMove(turn.latestView()!, seat)!;
    // 前两步被接受，配额用完
    for (let i = 0; i < 2; i++) {
      const want = next();
      const r = await turn.send(want.move, want.args);
      expect(r.ok, `第 ${i + 1} 步`).toBe(true);
      await turn.waitFor((c) => c.latestView()!.stateID === cs[0]!.latestStateID(), '同步');
    }
    // 之后的连发全部被限流
    const burst = await Promise.all(
      Array.from({ length: 10 }, () => {
        const want = next();
        return turn.send(want.move, want.args);
      }),
    );
    expect(burst.some((r) => !r.ok && r.code === 'rate_limited')).toBe(true);
    expect(turn.connected).toBe(true);
    // 窗口过后恢复：反复尝试直到被接受
    let recovered = false;
    await waitUntil(
      async () => {
        const want = decideMove(turn.latestView()!, seat);
        if (want === null) return true;
        const r = await turn.send(want.move, want.args);
        recovered = r.ok;
        return r.ok;
      },
      '限流窗口过后恢复',
      10_000,
    );
    expect(recovered).toBe(true);
  });

  it('座位视图隔离：同步请求回的永远是自己的视图，伪造字段无效', async () => {
    const { cs } = await stillRoom();
    const [a, b] = cs as [TestClient, TestClient];
    const forged = await a.sync({ seat: b.seat, playerID: b.seat });
    expect(forged.seat).toBe(a.seat);
    const players = (forged.view.G as { players: Record<string, { hand: unknown }> }).players;
    expect(Array.isArray(players[a.seat!]!.hand)).toBe(true);
    expect(players[b.seat!]!.hand).toBeNull();
    for (const c of cs) {
      for (const m of c.views) expect(m.seat).toBe(c.seat);
    }
  });
});

// ---------------------------------------------------------------------------
// 三之二、预设短语
// ---------------------------------------------------------------------------

describe('预设短语', () => {
  async function chatRoom(opts: Parameters<typeof startServer>[0] = {}) {
    const server = await boot({
      timing: { turnTimeoutMs: 60_000, pendingTimeoutMs: 60_000, responseTimeoutCapMs: 60_000 },
      ...opts,
    });
    const { room, accounts } = makeRoom({ humans: 4, bots: 0 });
    await server.rt.matches.createFromRoom(room);
    const cs = await joinAll(server, accounts, room.id);
    await waitUntil(() => allInPlaying(cs), '进入对局阶段');
    return { server, room, accounts, cs };
  }
  const chatOf = (c: TestClient) =>
    c.received
      .filter((r) => r.event === 'icg:chatMessage')
      .map((r) => (r.payload as { message: { sender: string; phraseId: string } }).message);

  it('同一局的所有连接都收到，发送者是座位号；冷却内再发被拒绝', async () => {
    const { cs } = await chatRoom();
    const [a, b, c] = cs as [TestClient, TestClient, TestClient];
    a.socket.emit('icg:chatBroadcast', {
      type: 'icg:chatBroadcast',
      scope: 'match',
      message: 'greet_hi',
    });
    await waitUntil(() => [a, b, c].every((x) => chatOf(x).length === 1), '三个连接都收到短语');
    for (const x of [a, b, c]) {
      expect(chatOf(x)[0]).toMatchObject({ sender: a.seat, phraseId: 'greet_hi' });
    }
    // 3 秒冷却：同一座位马上再发，只收到错误，不再广播
    a.socket.emit('icg:chatBroadcast', {
      type: 'icg:chatBroadcast',
      scope: 'match',
      message: 'greet_hi',
    });
    await waitUntil(
      () =>
        a.received.some(
          (r) => r.event === 'icg:error' && (r.payload as { code: string }).code === 'COOLDOWN',
        ),
      '冷却内被拒绝',
    );
    expect(chatOf(b)).toHaveLength(1);
  });

  it('任意文本、未知短语、畸形载荷都不会广播，连接保持', async () => {
    const { cs } = await chatRoom();
    const [a, b] = cs as [TestClient, TestClient];
    a.socket.emit('icg:chatBroadcast', {
      type: 'icg:chatBroadcast',
      scope: 'match',
      message: '大家好，加我微信',
    });
    a.socket.emit('icg:chatBroadcast', { scope: 'match', message: 'x'.repeat(500) });
    a.socket.emit('icg:chatBroadcast', { scope: 'room', message: 'greet_hi' });
    a.socket.emit('icg:chatBroadcast', 'greet_hi');
    a.socket.emit('icg:chatBroadcast', null);
    await waitUntil(
      () => a.received.filter((r) => r.event === 'icg:error').length >= 5,
      '每条畸形消息都有回应',
    );
    expect(chatOf(a)).toHaveLength(0);
    expect(chatOf(b)).toHaveLength(0);
    expect(a.connected).toBe(true);
  });

  it('梦主不能发盗梦者专用的战术短语；盗梦者可以', async () => {
    const { cs } = await chatRoom();
    const master = (cs[0]!.latestView()!.G as { dreamMasterID: string }).dreamMasterID;
    const masterClient = cs.find((c) => c.seat === master)!;
    const thiefClient = cs.find((c) => c.seat !== master)!;
    masterClient.socket.emit('icg:chatBroadcast', {
      type: 'icg:chatBroadcast',
      scope: 'match',
      message: 'tactic_push',
    });
    await waitUntil(
      () =>
        masterClient.received.some(
          (r) =>
            r.event === 'icg:error' && (r.payload as { code: string }).code === 'FACTION_FORBIDDEN',
        ),
      '梦主发盗梦者短语被拒绝',
    );
    thiefClient.socket.emit('icg:chatBroadcast', {
      type: 'icg:chatBroadcast',
      scope: 'match',
      message: 'tactic_push',
    });
    await waitUntil(() => chatOf(masterClient).length === 1, '盗梦者的短语广播给所有人');
  });

  it('别的对局的连接收不到', async () => {
    const server = await boot({
      timing: { turnTimeoutMs: 60_000, pendingTimeoutMs: 60_000, responseTimeoutCapMs: 60_000 },
    });
    const one = makeRoom({ humans: 4, bots: 0 });
    const two = makeRoom({ humans: 4, bots: 0 });
    await server.rt.matches.createFromRoom(one.room);
    await server.rt.matches.createFromRoom(two.room);
    const a = await joinAll(server, one.accounts, one.room.id);
    const b = await joinAll(server, two.accounts, two.room.id);
    await waitUntil(() => allInPlaying([...a, ...b]), '两局都进入对局阶段');
    a[0]!.socket.emit('icg:chatBroadcast', {
      type: 'icg:chatBroadcast',
      scope: 'match',
      message: 'greet_hi',
    });
    await waitUntil(() => chatOf(a[1]!).length === 1, '本局收到');
    for (const x of b) expect(chatOf(x)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 四、重启恢复
// ---------------------------------------------------------------------------

describe('重启恢复', () => {
  it('中途关停后用同一份存储重新起服务：重连得到关停前的版本号，之后打完', async () => {
    const store = new InMemoryMatchStore();
    const archive = new InMemoryMatchArchive();
    const first = await startServer({ store, archive });
    servers.push(first);
    const { room, accounts } = makeRoom({ humans: 4, bots: 2 });
    await first.rt.matches.createFromRoom(room);
    const cs = await joinAll(first, accounts, room.id);
    for (const c of cs) c.startAutoPlay();
    await waitUntil(() => cs.every((c) => c.latestStateID() >= 25), '打到中途');
    expect(cs.some((c) => c.isGameOver())).toBe(false);

    const oldRoom = first.rt.matches.get(room.id)!;
    for (const c of cs) c.close();
    await first.stop();
    servers.splice(servers.indexOf(first), 1);
    // 关停时可能还有一步在途，等房间队列跑完再读存储
    await oldRoom.idle();
    const saved = await store.load(room.id);
    const savedID = saved!.state.stateID;
    expect(saved!.state.ctx.gameover).toBeUndefined();

    // 恢复后先把节奏放慢：连接之前对局不会自己往前走，第一条视图的版本号才有确定的预期
    const slow = {
      botStepDelayMs: 60_000,
      pendingTimeoutMs: 60_000,
      turnTimeoutMs: 60_000,
      responseTimeoutCapMs: 60_000,
    };
    const second = await boot({ store, archive, restore: true, timing: slow });
    expect(second.url).not.toBe(first.url);
    const again: TestClient[] = [];
    for (const a of accounts) again.push(track(await connect(second, a, room.id)));
    for (const c of again) {
      await c.waitFor((x) => x.views.length > 0, '收到第一条视图');
      const firstMsg = c.views[0]!;
      expect(firstMsg.type).toBe('icg:state');
      expect(firstMsg.view.stateID).toBe(savedID);
    }
    // 恢复节奏：连接变化不会重置已挂的计时器，所以重新从存储挂载房间，让它按新时长排程，再打完
    Object.assign(second.timing, FAST_TIMING);
    second.rt.matches.shutdown();
    expect(await second.rt.matches.restoreAll()).toEqual({ restored: 1, discarded: 0, failed: [] });
    for (const c of again) c.startAutoPlay();
    await waitUntil(() => again.every((c) => c.isGameOver()), '重启后打完', 25_000);
    const finalID = again[0]!.latestStateID();
    expect(new Set(again.map((c) => c.latestStateID())).size).toBe(1);
    const steps = await archive.listSteps(room.id);
    expect(steps.length).toBe(finalID);
    expect(finalID).toBeGreaterThan(savedID);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// 五、掉线接管
// ---------------------------------------------------------------------------

describe('掉线接管', () => {
  it('掉线超过阈值后由服务端代为行动，重连后恢复为真人', async () => {
    const server = await boot({
      timing: { turnTimeoutMs: 150, pendingTimeoutMs: 150, responseTimeoutCapMs: 150 },
      bot: { takeoverThresholdMs: 1, hardCutoffMs: 3_600_000 },
    });
    const { room, accounts } = makeRoom({ humans: 4, bots: 2 });
    await server.rt.matches.createFromRoom(room);
    const cs = await joinAll(server, accounts, room.id);
    const [dropped, ...rest] = cs as [TestClient, ...TestClient[]];
    for (const c of rest) c.startAutoPlay();
    await waitUntil(() => allInPlaying(cs), '进入对局阶段');
    const seat = dropped.seat!;
    const watcher = rest[0]!;
    const seatOf = (c: TestClient) => c.seatTables.at(-1)?.seats.find((s) => s.seat === seat);

    dropped.close();
    await watcher.waitFor((c) => seatOf(c)?.connected === false, '座位表显示掉线');
    expect(seatOf(watcher)).toMatchObject({ connected: false, takenOver: false });

    // 阈值只有 1 毫秒：等墙钟走过之后手动推进一次
    const t0 = Date.now();
    await waitUntil(() => Date.now() - t0 > 5, '越过接管阈值');
    server.rt.bot.tick();
    await watcher.waitFor((c) => seatOf(c)?.takenOver === true, '座位表显示已被接管');
    expect(seatOf(watcher)).toMatchObject({ connected: false, takenOver: true });

    // 此后该座位的 move 由服务端代发：其余客户端能看到该座位发起的 move 事件
    const takeoverVersion = watcher.latestStateID();
    await watcher.waitFor(
      (c) =>
        c.views.some(
          (m) =>
            m.type === 'icg:step' &&
            m.view.stateID > takeoverVersion &&
            m.events.some((e) => e.kind === 'move' && e.actor === seat),
        ),
      '被接管座位由服务端代为行动',
      20_000,
    );

    // 重连：接管撤销，座位恢复在线，真人自己的 move 重新被接受
    const back = track(await connect(server, accounts[Number(seat)]!, room.id));
    back.startAutoPlay();
    await watcher.waitFor(
      (c) => seatOf(c)?.connected === true && seatOf(c)?.takenOver === false,
      '重连后座位恢复为真人',
    );
    await back.waitFor((c) => c.acceptedCount > 0, '重连后的真人自己行动被接受', 20_000);
  }, 30_000);
});

describe('对局撤销后的迟到断线', () => {
  it('撤销后再断开连接：Bot 管理器不会把这一局的登记重新建出来', async () => {
    const server = await boot({
      timing: { turnTimeoutMs: 60_000, pendingTimeoutMs: 60_000, responseTimeoutCapMs: 60_000 },
    });
    const { room, accounts } = makeRoom({ humans: 2, bots: 2 });
    await server.rt.matches.createFromRoom(room);
    const [a] = await joinAll(server, accounts, room.id);
    expect(server.rt.bot.snapshot(room.id)).not.toBeNull();

    await server.rt.matches.discardMatch(room.id);
    expect(server.rt.bot.snapshot(room.id)).toBeNull();

    const disconnected = (): number =>
      vi.mocked(logger.info).mock.calls.filter((c) => c[1] === 'ws disconnected').length;
    const before = disconnected();
    a!.close();
    await waitUntil(() => disconnected() > before, '网关处理了断线');
    expect(server.rt.bot.snapshot(room.id)).toBeNull();
  });
});

describe('挂机托管', () => {
  it('不操作的真人被代发两次后托管，只有本人的 icg:resume 能取消；畸形请求被拒', async () => {
    const server = await boot({
      timing: { turnTimeoutMs: 100, pendingTimeoutMs: 100, responseTimeoutCapMs: 100 },
    });
    const { room, accounts } = makeRoom({ humans: 2, bots: 2 });
    await server.rt.matches.createFromRoom(room);
    const [idle, active] = (await joinAll(server, accounts, room.id)) as [TestClient, TestClient];
    active.startAutoPlay();
    await waitUntil(() => allInPlaying([idle, active]), '进入对局阶段');
    const seat = idle.seat!;
    const seatOf = (c: TestClient) => c.seatTables.at(-1)?.seats.find((s) => s.seat === seat);

    await active.waitFor(
      (c) => seatOf(c)?.takenOver === true,
      '挂机座位在座位表里显示托管',
      20_000,
    );
    expect(seatOf(active)).toMatchObject({ takenOver: true, takeoverReason: 'idle' });

    // 另一个座位发 icg:resume，不影响挂机座位；消息体里伪造座位也无效
    const before = active.seatTables.length;
    active.socket.emit('icg:resume', { type: 'icg:resume', seat });
    await active.waitFor((c) => c.seatTables.length > before, '收到 icg:resume 的应答');
    expect(seatOf(active)).toMatchObject({ takenOver: true, takeoverReason: 'idle' });

    // 畸形载荷：回错误，连接保持
    const errs = idle.received.length;
    idle.socket.emit('icg:resume', { type: 'icg:move' });
    await idle.waitFor(
      (c) => c.received.slice(errs).some((r) => r.event === 'icg:error') && c.connected,
      '畸形 icg:resume 被拒',
    );

    // 本人取消：座位表里出现 takenOver 为 false 的版本
    const mark = active.seatTables.length;
    idle.socket.emit('icg:resume', { type: 'icg:resume' });
    await active.waitFor(
      (c) =>
        c.seatTables
          .slice(mark)
          .some((t) => t.seats.find((s) => s.seat === seat)?.takenOver === false),
      '本人取消托管后座位表更新',
    );
  }, 30_000);
});

// ---------------------------------------------------------------------------
// 封禁
// ---------------------------------------------------------------------------

describe('封禁', () => {
  async function room() {
    const server = await boot({
      timing: { turnTimeoutMs: 60_000, pendingTimeoutMs: 60_000, responseTimeoutCapMs: 60_000 },
    });
    const { room: r, accounts } = makeRoom({ humans: 2, bots: 2 });
    await server.rt.matches.createFromRoom(r);
    return { server, matchID: r.id, accounts };
  }

  it('被封禁的账号握手被拒，错误为 BANNED；解封后可连接', async () => {
    const { server, matchID, accounts } = await room();
    const acct = accounts[0]!;
    const token = signToken({ playerId: acct.playerId, nickname: acct.nickname });
    server.bans.ban(acct.playerId);
    const out = await tryConnect(server.url, token, matchID, acct.playerId);
    expect(out).toEqual({ ok: false, reason: 'BANNED' });

    server.bans.unban(acct.playerId);
    const again = await tryConnect(server.url, token, matchID, acct.playerId);
    expect(again.ok).toBe(true);
    if (again.ok) track(again.client);
  });

  it('网关按账号断开现有连接：连接收到 BANNED 并被断开，其他账号不受影响', async () => {
    const { server, matchID, accounts } = await room();
    const [a, b] = await joinAll(server, accounts, matchID);
    const second = track(await connect(server, accounts[0]!, matchID));

    expect(server.rt.gateway.disconnectPlayer(accounts[0]!.playerId)).toBe(2);
    await waitUntil(() => !a!.connected && !second.connected, '被封禁账号的连接全部断开');
    expect(
      a!.received.some(
        (r) => r.event === 'icg:error' && (r.payload as { code: string }).code === 'BANNED',
      ),
    ).toBe(true);
    expect(b!.connected).toBe(true);
  });

  it('运营封禁接口 → 该账号现有连接被断开，其他账号不受影响；解封不断开', async () => {
    vi.stubEnv('OPERATOR_TOKEN', 'e2e-operator-token-0123');
    try {
      const db = createMemoryIdentityPrisma();
      const server = await boot({
        identityPrisma: db,
        timing: { turnTimeoutMs: 60_000, pendingTimeoutMs: 60_000, responseTimeoutCapMs: 60_000 },
      });
      const { room: r, accounts } = makeRoom({ humans: 2, bots: 2 });
      await server.rt.matches.createFromRoom(r);
      for (const a of accounts) {
        await db.player.create({
          data: { id: a.playerId, nickname: a.nickname, avatarSeed: a.playerId, locale: 'zh-CN' },
        });
      }
      const [a, b] = await joinAll(server, accounts, r.id);
      const second = track(await connect(server, accounts[0]!, r.id));
      const adminCall = (verb: 'ban' | 'unban', playerId: string) =>
        fetch(`${server.url}/admin/players/${playerId}/${verb}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer e2e-operator-token-0123',
          },
          body: '{}',
        });

      // 解封一个没被封的账号：连接不受影响
      expect((await adminCall('unban', accounts[1]!.playerId)).status).toBe(200);
      expect(b!.connected).toBe(true);

      expect((await adminCall('ban', accounts[0]!.playerId)).status).toBe(200);
      await waitUntil(() => !a!.connected && !second.connected, '被封禁账号的连接全部断开');
      expect(
        a!.received.some(
          (m) => m.event === 'icg:error' && (m.payload as { code: string }).code === 'BANNED',
        ),
      ).toBe(true);
      expect(b!.connected).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
