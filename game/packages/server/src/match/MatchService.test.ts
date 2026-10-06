import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InceptionCityGame } from '@icgame/game-engine';
import { applyMove, type GameDef } from '@icgame/game-engine/runner';
import type { SetupState } from '@icgame/game-engine/setup';
import { AppError } from '../infra/errors.js';
import { BotManager } from '../services/BotManager.js';
import type { RoomPlayer, RoomState } from '../services/LobbyService.js';
import { FakeTimers } from '../testing/fakeTimers.js';
import { InMemoryMatchArchive } from './MatchArchive.js';
import { InMemoryMatchStore, type MatchSnapshot } from './MatchStore.js';
import { makeTestSnapshot } from './MatchStore.contract.js';
import { FINISHED_ROOM_LINGER_MS, MatchService, type MatchServiceDeps } from './MatchService.js';
import type { TimingConfig } from './scheduling.js';

const { log } = vi.hoisted(() => ({
  log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../infra/logger.js', () => ({ logger: log }));

const timing: TimingConfig = { botStepDelayMs: 10, pendingTimeoutMs: 5_000, turnTimeoutMs: 20_000 };
const SEED = 'ab'.repeat(32);
const game: GameDef<SetupState> = InceptionCityGame;

/** 让出一个宏任务，使已就绪的异步续体全部跑完 */
const pump = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function makeRoom(n: number, humans: readonly number[] = [], id = 'room-1'): RoomState {
  const players: RoomPlayer[] = Array.from({ length: n }, (_, i) => ({
    playerId: humans.includes(i) ? `acct-${i}` : `bot-${i}`,
    nickname: humans.includes(i) ? `真人${i}` : `AI${i}`,
    avatarSeed: 's',
    seat: i,
    isBot: !humans.includes(i),
    joinedAt: 0,
  }));
  return {
    id,
    code: 'ABCDEF',
    ownerPlayerId: 'acct-0',
    maxPlayers: 10,
    ruleVariant: 'classic',
    exCardsEnabled: false,
    expansionEnabled: false,
    status: 'waiting',
    players,
    createdAt: 0,
    expiresAt: 0,
  };
}

/** 按指令失败的存储替身：failDiscard 为真时撤销快照抛错 */
class FlakyStore extends InMemoryMatchStore {
  failDiscard = false;
  failLoad = false;
  failSave = false;
  override async load(matchID: string): Promise<MatchSnapshot | null> {
    if (this.failLoad) throw new Error('load down');
    return super.load(matchID);
  }
  override async save(
    ...args: Parameters<InMemoryMatchStore['save']>
  ): ReturnType<InMemoryMatchStore['save']> {
    if (this.failSave) throw new Error('save down');
    return super.save(...args);
  }
  override async discard(matchID: string): Promise<void> {
    if (this.failDiscard) throw new Error('discard down');
    await super.discard(matchID);
  }
}

/** 登记时按指令失败的 Bot 管理器替身 */
class FlakyBotManager extends BotManager {
  failRegister = 0;
  disposed: string[] = [];
  override registerMatch(matchID: string): void {
    if (this.failRegister > 0) {
      this.failRegister -= 1;
      throw new Error('register failed');
    }
    super.registerMatch(matchID);
  }
  override disposeMatch(matchID: string): void {
    this.disposed.push(matchID);
    super.disposeMatch(matchID);
  }
}

interface Harness {
  svc: MatchService;
  store: InMemoryMatchStore;
  archive: InMemoryMatchArchive;
  bot: BotManager;
  timers: FakeTimers;
  onStep: ReturnType<typeof vi.fn>;
  onSeatsChanged: ReturnType<typeof vi.fn>;
  onGameOver: ReturnType<typeof vi.fn>;
}

function makeHarness(
  patch: Partial<MatchServiceDeps> = {},
  shared: { store?: InMemoryMatchStore; archive?: InMemoryMatchArchive } = {},
): Harness {
  const timers = new FakeTimers();
  const store = shared.store ?? new InMemoryMatchStore();
  const archive = shared.archive ?? new InMemoryMatchArchive();
  const bot = new BotManager({ now: timers.now });
  const onStep = vi.fn();
  const onSeatsChanged = vi.fn();
  const onGameOver = vi.fn();
  const svc = new MatchService({
    store,
    archive,
    bot,
    timing,
    timers,
    randomSeed: () => SEED,
    onStep,
    onSeatsChanged,
    onGameOver,
    ...patch,
  });
  return { svc, store, archive, bot, timers, onStep, onSeatsChanged, onGameOver };
}

/** 造一份残留快照：借一局真实建局产生的快照改 id */
function makeSnapshotFor(_h: Harness, matchID: string): MatchSnapshot {
  return { ...makeTestSnapshot(matchID), roomCode: 'STALE' };
}

/** 一直触发计时器，直到没有计时器、步数用尽或 stop 返回 true */
async function drain(h: Harness, id: string, stop: () => boolean = () => false): Promise<void> {
  for (let i = 0; i < 20_000; i++) {
    await h.svc.get(id)?.idle();
    if (stop() || !h.timers.fireNext()) break;
  }
  await h.svc.get(id)?.idle();
}

async function fireSteps(h: Harness, id: string, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await h.svc.get(id)!.idle();
    h.timers.fireNext();
  }
  await h.svc.get(id)!.idle();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MatchService 建局', () => {
  it('建局后返回 matchID（等于房间 id），能取到房间，并写入快照与归档', async () => {
    const h = makeHarness();
    const id = await h.svc.createFromRoom(makeRoom(5, [0, 2]));
    expect(id).toBe('room-1');

    const room = h.svc.get(id);
    expect(room).not.toBeNull();
    expect(room!.seats().map((s) => s.seat)).toEqual(['0', '1', '2', '3', '4']);

    expect(await h.store.listActive()).toEqual([id]);
    const snap = await h.store.load(id);
    expect(snap!.roomCode).toBe('ABCDEF');
    expect(snap!.state.stateID).toBe(0);
    expect(snap!.setup.numPlayers).toBe(5);
    expect(h.archive.started.has(id)).toBe(true);
  });

  it('座位昵称与 Bot 座位传进了引擎状态', async () => {
    const h = makeHarness();
    const id = await h.svc.createFromRoom(makeRoom(4, [0]));
    const g = h.svc.get(id)!.current().G;
    expect(g.players['0']!.nickname).toBe('真人0');
    expect(g.players['0']!.type).toBe('human');
    expect(g.players['1']!.type).toBe('bot');
    expect(g.rngSeed).toBe(SEED);
  });

  it('人数不在 4-10 时抛 CONFLICT 且不留痕迹', async () => {
    const h = makeHarness();
    for (const n of [3, 11]) {
      const err = await h.svc.createFromRoom(makeRoom(n, [0], `r${n}`)).catch((e) => e);
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe('CONFLICT');
      expect(err.message).toBe('需要 4–10 名玩家');
      expect(h.svc.get(`r${n}`)).toBeNull();
    }
    expect(await h.store.listActive()).toEqual([]);
  });

  it('同一个 id 已有房间时抛 CONFLICT，并发的两次只成功一次', async () => {
    const h = makeHarness();
    await h.svc.createFromRoom(makeRoom(4, [0]));
    await expect(h.svc.createFromRoom(makeRoom(4, [0]))).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    const h2 = makeHarness();
    const results = await Promise.allSettled([
      h2.svc.createFromRoom(makeRoom(4, [0], 'dup')),
      h2.svc.createFromRoom(makeRoom(4, [0], 'dup')),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('快照写入之后的步骤失败：回滚到无残留，原错误抛出，再建一次成功', async () => {
    const timers = new FakeTimers();
    const store = new FlakyStore();
    const bot = new FlakyBotManager({ now: timers.now });
    const h = makeHarness({ bot }, { store });
    bot.failRegister = 1;

    await expect(h.svc.createFromRoom(makeRoom(4, [0]))).rejects.toThrow('register failed');
    expect(h.svc.get('room-1')).toBeNull();
    expect(await store.load('room-1')).toBeNull();
    expect(await store.listActive()).toEqual([]);
    expect(bot.disposed).toContain('room-1');

    await expect(h.svc.createFromRoom(makeRoom(4, [0]))).resolves.toBe('room-1');
    expect(h.svc.get('room-1')).not.toBeNull();
    expect(await store.listActive()).toEqual(['room-1']);
  });

  it('回滚自身失败只记 error，不盖住原错误', async () => {
    const timers = new FakeTimers();
    const store = new FlakyStore();
    const bot = new FlakyBotManager({ now: timers.now });
    const h = makeHarness({ bot }, { store });
    bot.failRegister = 1;
    store.failDiscard = true;
    log.error.mockClear();

    await expect(h.svc.createFromRoom(makeRoom(4, [0]))).rejects.toThrow('register failed');
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ matchID: 'room-1' }),
      'store discard failed',
    );
  });

  it('存储里留着同 id 的旧快照时覆盖并打 warn，建局成功', async () => {
    const h = makeHarness();
    await h.store.create({ ...makeSnapshotFor(h, 'room-1') });
    log.warn.mockClear();
    await expect(h.svc.createFromRoom(makeRoom(4, [0]))).resolves.toBe('room-1');
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ matchID: 'room-1' }),
      expect.stringContaining('replaced'),
    );
    expect((await h.store.load('room-1'))!.setup.seed).toBe(SEED);
  });

  it('discardMatch：关房间、清 Bot 登记、删快照', async () => {
    const h = makeHarness();
    const id = await h.svc.createFromRoom(makeRoom(4, [0]));
    const room = h.svc.get(id)!;
    await h.svc.discardMatch(id);
    expect(h.svc.get(id)).toBeNull();
    expect(room.deadlineAt()).toBeNull();
    expect(await h.store.load(id)).toBeNull();
    expect(await h.store.listActive()).toEqual([]);
    // 不存在的对局也不抛错
    await expect(h.svc.discardMatch('nope')).resolves.toBeUndefined();
  });

  it('默认种子是 64 位十六进制，两局不同', async () => {
    const h = makeHarness({ randomSeed: undefined });
    await h.svc.createFromRoom(makeRoom(4, [0], 'a'));
    await h.svc.createFromRoom(makeRoom(4, [0], 'b'));
    const a = (await h.store.load('a'))!.setup.seed;
    const b = (await h.store.load('b'))!.setup.seed;
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect((await h.store.load('a'))!.setup.setupData.rngSeed).toBe(a);
  });

  it('store.create 失败：建局失败，注册表、Bot 管理器、归档都不留条目', async () => {
    const h = makeHarness();
    vi.spyOn(h.store, 'create').mockRejectedValue(new Error('redis down'));
    const register = vi.spyOn(h.bot, 'registerMatch');
    await expect(h.svc.createFromRoom(makeRoom(4, [0]))).rejects.toThrow('redis down');
    expect(h.svc.get('room-1')).toBeNull();
    expect(register).not.toHaveBeenCalled();
    expect(h.archive.started.size).toBe(0);
    // 失败后同一个 id 还能再建
    vi.mocked(h.store.create).mockRestore();
    await expect(h.svc.createFromRoom(makeRoom(4, [0]))).resolves.toBe('room-1');
  });

  it('archive.recordStart 失败只记 ERROR，不让建局失败', async () => {
    const h = makeHarness();
    vi.spyOn(h.archive, 'recordStart').mockRejectedValue(new Error('pg down'));
    await expect(h.svc.createFromRoom(makeRoom(4, [0]))).resolves.toBe('room-1');
    expect(h.svc.get('room-1')).not.toBeNull();
    expect(log.error).toHaveBeenCalled();
  });

  it('建局时向 Bot 管理器登记对局', async () => {
    const h = makeHarness();
    const register = vi.spyOn(h.bot, 'registerMatch');
    await h.svc.createFromRoom(makeRoom(4, [0]));
    expect(register).toHaveBeenCalledWith('room-1');
  });
});

describe('MatchService.seatOf', () => {
  it('只认真人座位', async () => {
    const h = makeHarness();
    const id = await h.svc.createFromRoom(makeRoom(5, [1, 3]));
    expect(h.svc.seatOf(id, 'acct-1')).toBe('1');
    expect(h.svc.seatOf(id, 'acct-3')).toBe('3');
    expect(h.svc.seatOf(id, 'bot-0')).toBeNull();
    expect(h.svc.seatOf(id, 'nobody')).toBeNull();
    expect(h.svc.seatOf(id, '')).toBeNull();
    expect(h.svc.seatOf('missing', 'acct-1')).toBeNull();
  });
});

describe('MatchService 对局过程', () => {
  it('归档写入很慢时 onStep 照常下发，不被数据库挡住；写完后落库顺序正确', async () => {
    const release: Array<() => void> = [];
    const written: number[] = [];
    class SlowArchive extends InMemoryMatchArchive {
      override async appendStep(row: Parameters<InMemoryMatchArchive['appendStep']>[0]) {
        await new Promise<void>((resolve) => release.push(resolve));
        await super.appendStep(row);
        written.push(row.stateID);
      }
    }
    const archive = new SlowArchive();
    const h = makeHarness({}, { archive });
    const id = await h.svc.createFromRoom(makeRoom(4));
    await fireSteps(h, id, 3);
    // 第一步的归档还卡着，后面的步骤仍在继续下发
    expect(h.onStep.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(h.onStep.mock.calls[0]![0]).toBe(id);
    expect(written).toEqual([]);
    expect(release).toHaveLength(1);

    while (written.length < 3) {
      release.shift()?.();
      await pump();
    }
    expect(written).toEqual([1, 2, 3]);
  });

  it('归档写入失败：退避重试后补写，不缺步，不阻塞 onStep', async () => {
    const h = makeHarness();
    let failures = 2;
    const original = h.archive.appendStep.bind(h.archive);
    vi.spyOn(h.archive, 'appendStep').mockImplementation(async (row) => {
      if (failures > 0) {
        failures -= 1;
        throw new Error('pg down');
      }
      await original(row);
    });
    const id = await h.svc.createFromRoom(makeRoom(4));
    await fireSteps(h, id, 3);
    expect(h.onStep.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(log.error).toHaveBeenCalled();
    // 重试计时器与对局自己的排程共用假时钟，推到归档补齐为止
    for (let i = 0; i < 200; i++) {
      await pump();
      const rows = await h.archive.listSteps(id);
      if (rows.length >= h.onStep.mock.calls.length) break;
      h.timers.fireNext();
    }
    const rows = await h.archive.listSteps(id);
    expect(rows.map((r) => r.stateID)).toEqual(rows.map((_, i) => i + 1));
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('归档行带请求与完整事件，快照版本随之前进', async () => {
    const h = makeHarness();
    const id = await h.svc.createFromRoom(makeRoom(4));
    await fireSteps(h, id, 3);
    const rows = await h.archive.listSteps(id);
    expect(rows.map((r) => r.stateID)).toEqual(rows.map((_, i) => i + 1));
    expect(rows[0]!.request.move).toBeTypeOf('string');
    expect((await h.store.load(id))!.state.stateID).toBe(rows.length);
  });

  it('房间用座位号向 Bot 管理器询问接管状态，并在 seatsChanged 时通知', async () => {
    const h = makeHarness();
    const asked = vi.spyOn(h.bot, 'isBotControlled');
    const id = await h.svc.createFromRoom(makeRoom(4, [0, 1]));
    expect(asked).toHaveBeenCalledWith(id, '0');
    expect(asked).toHaveBeenCalledWith(id, '1');
    expect(asked).not.toHaveBeenCalledWith(id, 'acct-0');

    const reschedule = vi.spyOn(h.svc.get(id)!, 'reschedule');
    h.svc.seatsChanged(id);
    expect(reschedule).toHaveBeenCalledTimes(1);
    expect(h.onSeatsChanged).toHaveBeenCalledWith(id);
  });

  it('接管事件触发房间重新排程并通知座位变化', async () => {
    const h = makeHarness();
    const id = await h.svc.createFromRoom(makeRoom(4, [0, 1]));
    const reschedule = vi.spyOn(h.svc.get(id)!, 'reschedule');
    h.bot.onDisconnect(id, '0');
    h.timers.t += 61_000;
    h.bot.tick();
    expect(h.bot.isBotControlled(id, '0')).toBe(true);
    expect(reschedule).toHaveBeenCalled();
    expect(h.onSeatsChanged).toHaveBeenCalledWith(id);
  });

  it('从未连上来的真人座位超过接管阈值后被接管，按时连上的不受影响', async () => {
    const h = makeHarness();
    const id = await h.svc.createFromRoom(makeRoom(4, [0, 1]));
    h.timers.t += 30_000;
    h.bot.onReconnect(id, '1');
    h.timers.t += 31_000;
    h.bot.tick();
    expect(h.bot.isBotControlled(id, '0')).toBe(true);
    expect(h.bot.isBotControlled(id, '1')).toBe(false);
    expect(h.bot.isBotControlled(id, '2')).toBe(false);
  });

  it('所有真人座位都没连上来：接管后走自动步的短延迟而不是回合截止', async () => {
    const h = makeHarness();
    const id = await h.svc.createFromRoom(makeRoom(4, [0, 1]));
    h.timers.t += 61_000;
    h.bot.tick();
    const room = h.svc.get(id)!;
    expect(room.deadlineAt()).toBeNull();
    expect(h.bot.isBotControlled(id, '0')).toBe(true);
    expect(h.bot.isBotControlled(id, '1')).toBe(true);
  });

  it('恢复路径同样：重启后没有人回来的真人座位被接管', async () => {
    const first = makeHarness();
    const id = await first.svc.createFromRoom(makeRoom(4, [0, 1]));
    first.svc.shutdown();

    const second = makeHarness({}, { store: first.store, archive: first.archive });
    await second.svc.restoreAll();
    second.timers.t += 61_000;
    second.bot.tick();
    expect(second.bot.isBotControlled(id, '0')).toBe(true);
    expect(second.bot.isBotControlled(id, '1')).toBe(true);
  });

  it('seatsChanged 对不存在的对局不抛错也不通知', () => {
    const h = makeHarness();
    h.svc.seatsChanged('nope');
    expect(h.onSeatsChanged).not.toHaveBeenCalled();
  });
});

describe('MatchService 对局结束', () => {
  it('全 Bot 房间打完：各调用一次 recordFinish / store.finish / disposeMatch / onGameOver，房间延迟移除', async () => {
    const h = makeHarness();
    const recordFinish = vi.spyOn(h.archive, 'recordFinish');
    const finish = vi.spyOn(h.store, 'finish');
    const dispose = vi.spyOn(h.bot, 'disposeMatch');
    const id = await h.svc.createFromRoom(makeRoom(5));
    const room = h.svc.get(id)!;
    const close = vi.spyOn(room, 'close');

    await drain(h, id, () => h.onGameOver.mock.calls.length > 0);
    expect(recordFinish).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledWith(id);
    expect(h.onGameOver).toHaveBeenCalledTimes(1);
    expect(h.onGameOver.mock.calls[0]![0]).toBe(id);
    expect(h.archive.finished.has(id)).toBe(true);
    expect(await h.store.listActive()).toEqual([]);

    // 延迟一小段时间才移除，让最后一条消息发完
    expect(h.svc.get(id)).toBe(room);
    expect(h.timers.pending().some((p) => p.at === h.timers.now() + FINISHED_ROOM_LINGER_MS)).toBe(
      true,
    );
    h.timers.t += FINISHED_ROOM_LINGER_MS;
    await drain(h, id);
    expect(h.svc.get(id)).toBeNull();
    expect(close).toHaveBeenCalled();
    expect(recordFinish).toHaveBeenCalledTimes(1);
  });

  it('结束流程除归档外每一步失败只记 ERROR 并继续后面的', async () => {
    const h = makeHarness();
    const finish = vi.spyOn(h.store, 'finish').mockRejectedValue(new Error('redis'));
    const dispose = vi.spyOn(h.bot, 'disposeMatch').mockImplementation(() => {
      throw new Error('bot');
    });
    h.onGameOver.mockRejectedValue(new Error('gateway'));
    const id = await h.svc.createFromRoom(makeRoom(4));
    await drain(h, id, () => h.onGameOver.mock.calls.length > 0);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(h.onGameOver).toHaveBeenCalledTimes(1);
    expect(log.error.mock.calls.length).toBeGreaterThanOrEqual(3);
    // 即使每步都失败，房间仍会被移除
    await drain(h, id);
    expect(h.svc.get(id)).toBeNull();
  });

  it('结束归档失败：不调 store.finish，对局留在活跃集合，重启恢复时重试并成功后移除', async () => {
    const first = makeHarness();
    const recordFinish = vi
      .spyOn(first.archive, 'recordFinish')
      .mockRejectedValueOnce(new Error('pg down'));
    const finish = vi.spyOn(first.store, 'finish');
    const id = await first.svc.createFromRoom(makeRoom(4));
    await drain(first, id, () => first.onGameOver.mock.calls.length > 0);
    expect(recordFinish).toHaveBeenCalledTimes(1);
    expect(finish).not.toHaveBeenCalled();
    expect(await first.store.listActive()).toEqual([id]);
    // 内存里的房间照常延迟移除
    await drain(first, id);
    expect(first.svc.get(id)).toBeNull();
    first.svc.shutdown();

    const second = makeHarness({}, { store: first.store, archive: first.archive });
    const result = await second.svc.restoreAll();
    expect(result).toEqual({ restored: 0, failed: [] });
    // 归档对象是共用的：第一次抛错、重启后重试一次
    expect(recordFinish).toHaveBeenCalledTimes(2);
    expect(await second.store.listActive()).toEqual([]);
  });
});

describe('MatchService 快照写入失败', () => {
  /** 让库里的版本领先内存一步：先在存储里写入「完成布置」之后的状态 */
  async function advanceStoreBehindRoomsBack(h: Harness, id: string) {
    const snap = (await h.store.load(id))!;
    const out = applyMove(game, snap.state, {
      playerID: snap.state.ctx.currentPlayer,
      move: 'completeSetup',
      args: [],
    });
    if (!out.ok) throw new Error('setup failed');
    await h.store.save(id, out.state, snap.state.stateID, h.timers.now());
    return { stored: out.state, firstMover: snap.state.ctx.currentPlayer };
  }

  it('写快照遇到真冲突：从存储重新加载并原地换上新房间，状态等于库里的，连接重发完整视图', async () => {
    const onResync = vi.fn();
    const onAborted = vi.fn();
    const h = makeHarness({ onResync, onAborted });
    const id = await h.svc.createFromRoom(makeRoom(5, [0, 1, 2, 3, 4]));
    const oldRoom = h.svc.get(id)!;
    const { stored, firstMover } = await advanceStoreBehindRoomsBack(h, id);

    const r = await oldRoom.submit(firstMover, {
      move: 'completeSetup',
      args: [],
      intentId: 'x',
    });
    expect(r).toEqual({ ok: false, code: 'internal_error' });
    await vi.waitFor(() => expect(onResync).toHaveBeenCalledWith(id));

    const fresh = h.svc.get(id)!;
    expect(fresh).not.toBe(oldRoom);
    expect(fresh.current().stateID).toBe(stored.stateID);
    expect(onAborted).not.toHaveBeenCalled();
    expect(await h.store.listActive()).toEqual([id]);
    // 新房间可以继续接收提交
    const next = await fresh.submit(fresh.current().ctx.currentPlayer, {
      move: 'endActionPhase',
      args: [],
      intentId: 'y',
    });
    expect(next.ok === false && next.code === 'match_over').toBe(false);
  });

  it('重新加载失败：房间移除、Bot 登记释放、通知中断，对局留在活跃集合里', async () => {
    const onResync = vi.fn();
    const onAborted = vi.fn();
    const store = new FlakyStore();
    const h = makeHarness({ onResync, onAborted }, { store });
    const dispose = vi.spyOn(h.bot, 'disposeMatch');
    const finish = vi.spyOn(h.store, 'finish');
    const id = await h.svc.createFromRoom(makeRoom(5, [0, 1, 2, 3, 4]));
    const oldRoom = h.svc.get(id)!;
    const { firstMover } = await advanceStoreBehindRoomsBack(h, id);
    store.failLoad = true;

    await oldRoom.submit(firstMover, { move: 'completeSetup', args: [], intentId: 'x' });
    await vi.waitFor(() => expect(onAborted).toHaveBeenCalledWith(id));

    expect(h.svc.get(id)).toBeNull();
    expect(dispose).toHaveBeenCalledWith(id);
    expect(finish).not.toHaveBeenCalled();
    expect(onResync).not.toHaveBeenCalled();
    expect(await h.store.listActive()).toEqual([id]);
    expect(log.error).toHaveBeenCalled();
  });

  it('写快照抛错：房间保留，存储恢复后自动步重新推进，健康状态各通知一次', async () => {
    const onStorageHealth = vi.fn();
    const store = new FlakyStore();
    const h = makeHarness({ onStorageHealth }, { store });
    const id = await h.svc.createFromRoom(makeRoom(4));
    const room = h.svc.get(id)!;
    store.failSave = true;

    // 失败轮次：自动步到点、两次快速重试
    for (let i = 0; i < 3; i++) {
      h.timers.fireNext();
      await pump();
    }
    expect(h.svc.get(id)).toBe(room);
    expect(onStorageHealth.mock.calls).toEqual([[id, false]]);
    expect(room.current().stateID).toBe(0);

    store.failSave = false;
    h.timers.fireNext(); // 退避到点
    await pump();
    expect(room.current().stateID).toBe(1);
    expect(onStorageHealth.mock.calls).toEqual([
      [id, false],
      [id, true],
    ]);
    expect((await store.load(id))!.state.stateID).toBe(1);
  });

  it('persist 用计时器的 now 作为更新时间', async () => {
    const h = makeHarness();
    const save = vi.spyOn(h.store, 'save');
    const id = await h.svc.createFromRoom(makeRoom(4));
    await fireSteps(h, id, 1);
    expect(save).toHaveBeenCalled();
    expect(save.mock.calls[0]![0]).toBe(id);
    expect(save.mock.calls[0]![2]).toBe(0);
    expect(save.mock.calls[0]![3]).toBe(h.timers.now());
  });
});

describe('MatchService.restoreAll', () => {
  it('新进程从同一个存储恢复：版本号一致、能继续打完', async () => {
    const first = makeHarness();
    const id = await first.svc.createFromRoom(makeRoom(5, [2]));
    await fireSteps(first, id, 12);
    const stateID = first.svc.get(id)!.current().stateID;
    expect(stateID).toBeGreaterThan(0);
    first.svc.shutdown();

    const second = makeHarness({}, { store: first.store, archive: first.archive });
    const result = await second.svc.restoreAll();
    expect(result).toEqual({ restored: 1, failed: [] });
    const room = second.svc.get(id)!;
    expect(room.current().stateID).toBe(stateID);
    expect(second.svc.seatOf(id, 'acct-2')).toBe('2');

    // 全是 Bot 的座位会自己继续，真人座位到截止时间由服务端代发
    await drain(second, id, () => second.onGameOver.mock.calls.length > 0);
    expect(second.onGameOver).toHaveBeenCalledTimes(1);
    expect(room.current().ctx.gameover).toBeDefined();
  });

  it('坏快照被跳过并计入 failed，且不从活跃集合里移除', async () => {
    const h = makeHarness();
    const good = await h.svc.createFromRoom(makeRoom(4, [], 'good'));
    h.svc.shutdown();

    const base = (await h.store.load(good))!;
    const put = async (id: string, patch: Partial<MatchSnapshot> | unknown): Promise<void> => {
      await h.store.create({ ...base, matchID: id, ...(patch as object) });
    };
    await put('bad-state', { state: { G: 1 } });
    await put('empty-seats', { seats: [] });
    await put('no-seats', { seats: undefined });
    const listActive = h.store.listActive.bind(h.store);
    vi.spyOn(h.store, 'listActive').mockImplementation(async () => [
      ...(await listActive()),
      'ghost',
    ]);

    const second = makeHarness({}, { store: h.store, archive: h.archive });
    const result = await second.svc.restoreAll();
    expect(result.restored).toBe(1);
    expect([...result.failed].sort()).toEqual(['bad-state', 'empty-seats', 'ghost', 'no-seats']);
    expect(second.svc.get('good')).not.toBeNull();
    expect(second.svc.get('bad-state')).toBeNull();
    expect(await listActive()).toContain('bad-state');
    expect(log.error).toHaveBeenCalled();
  });

  it('已在注册表里的对局跳过', async () => {
    const h = makeHarness();
    await h.svc.createFromRoom(makeRoom(4, [0]));
    expect(await h.svc.restoreAll()).toEqual({ restored: 0, failed: [] });
  });

  it('快照里已是结束状态：走结束流程，不建房间', async () => {
    const first = makeHarness();
    const stubbed = vi.spyOn(first.store, 'finish').mockResolvedValue(undefined);
    const id = await first.svc.createFromRoom(makeRoom(4));
    await drain(first, id, () => first.onGameOver.mock.calls.length > 0);
    first.svc.shutdown();
    stubbed.mockRestore();
    expect(await first.store.listActive()).toEqual([id]);

    const second = makeHarness({}, { store: first.store, archive: new InMemoryMatchArchive() });
    const recordFinish = vi.spyOn(second.archive, 'recordFinish');
    const finish = vi.spyOn(second.store, 'finish');
    const dispose = vi.spyOn(second.bot, 'disposeMatch');
    const result = await second.svc.restoreAll();
    expect(result.failed).toEqual([]);
    expect(second.svc.get(id)).toBeNull();
    expect(recordFinish).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledWith(id);
    expect(second.onGameOver).toHaveBeenCalledTimes(1);
  });
});

describe('MatchService.shutdown', () => {
  it('关闭所有房间、清掉全部计时器、清空注册表，不动存储', async () => {
    const h = makeHarness();
    const id = await h.svc.createFromRoom(makeRoom(4));
    const other = await h.svc.createFromRoom(makeRoom(4, [], 'other'));
    const room = h.svc.get(id)!;
    const close = vi.spyOn(room, 'close');
    h.svc.shutdown();
    expect(close).toHaveBeenCalled();
    expect(h.svc.get(id)).toBeNull();
    expect(h.svc.get(other)).toBeNull();
    expect(h.timers.pending()).toHaveLength(0);
    expect(await h.store.listActive()).toEqual([id, other]);
    expect(await h.store.load(id)).not.toBeNull();
  });

  it('结束后等待移除期间 shutdown：延迟移除计时器也被清掉', async () => {
    const h = makeHarness();
    const id = await h.svc.createFromRoom(makeRoom(4));
    await drain(h, id, () => h.onGameOver.mock.calls.length > 0);
    expect(h.timers.pending().length).toBeGreaterThan(0);
    h.svc.shutdown();
    expect(h.timers.pending()).toHaveLength(0);
  });

  it('shutdown 之后不再响应接管事件', async () => {
    const h = makeHarness();
    const id = await h.svc.createFromRoom(makeRoom(4, [0]));
    h.svc.shutdown();
    h.onSeatsChanged.mockClear();
    h.bot.onDisconnect(id, '0');
    h.timers.t += 61_000;
    h.bot.tick();
    expect(h.onSeatsChanged).not.toHaveBeenCalled();
  });
});

describe('种子保密', () => {
  it('种子不出现在日志参数里，也不出现在公开方法的返回值里', async () => {
    const h = makeHarness();
    const id = await h.svc.createFromRoom(makeRoom(5, [1]));
    await fireSteps(h, id, 10);
    h.svc.seatsChanged(id);
    const restored = await makeHarness({}, { store: h.store, archive: h.archive }).svc.restoreAll();
    await drain(h, id, () => h.onGameOver.mock.calls.length > 0);

    const logged = [log.info, log.debug, log.warn, log.error]
      .flatMap((fn) => fn.mock.calls)
      .map((args) => JSON.stringify(args));
    expect(logged.length).toBeGreaterThan(0);
    expect(logged.some((s) => s.includes(SEED))).toBe(false);

    const returned = JSON.stringify([id, h.svc.seatOf(id, 'acct-1'), restored]);
    expect(returned.includes(SEED)).toBe(false);
    expect(JSON.stringify(h.onSeatsChanged.mock.calls).includes(SEED)).toBe(false);

    // 种子只在存储快照里
    expect((await h.store.load(id))!.setup.seed).toBe(SEED);
    expect(h.archive.started.get(id)!.setup.seed).toBe(SEED);
  });
});

describe('MatchService 归档完整性', () => {
  it('对局结束时 recordFinish 在本局步骤全部落库之后才调用', async () => {
    const events: string[] = [];
    class OrderedArchive extends InMemoryMatchArchive {
      override async appendStep(row: Parameters<InMemoryMatchArchive['appendStep']>[0]) {
        // 让写入慢一拍，才能看出 recordFinish 是不是在等
        await pump();
        await super.appendStep(row);
        events.push(`step:${row.stateID}`);
      }
      override async recordFinish(...args: Parameters<InMemoryMatchArchive['recordFinish']>) {
        events.push('finish');
        await super.recordFinish(...args);
      }
    }
    const archive = new OrderedArchive();
    const h = makeHarness({}, { archive });
    const id = await h.svc.createFromRoom(makeRoom(4));
    await drain(h, id, () => h.onGameOver.mock.calls.length > 0);
    const finishAt = events.indexOf('finish');
    expect(finishAt).toBeGreaterThan(0);
    expect(events.slice(finishAt + 1)).toEqual([]);
    const last = (await archive.listSteps(id)).length;
    expect(events.filter((e) => e.startsWith('step:'))).toHaveLength(last);
    expect(last).toBe(h.svc.get(id)!.current().stateID);
  });

  it('进程启动恢复时归档落后于快照：写入一条缺口，补上缺失的区间', async () => {
    const first = makeHarness();
    const id = await first.svc.createFromRoom(makeRoom(4));
    // 打几步之后，只留前 1 步在归档里，其余算作退出时丢失
    await fireSteps(first, id, 3);
    first.svc.shutdown();
    const snapshotVersion = (await first.store.load(id))!.state.stateID;

    const lost = new InMemoryMatchArchive();
    const kept = (await first.archive.listSteps(id)).slice(0, 1);
    await lost.recordStart(makeTestSnapshot(id));
    for (const row of kept) await lost.appendStep(row);
    const second = makeHarness({}, { store: first.store, archive: lost });
    await second.svc.restoreAll();
    await second.svc.get(id)?.idle();
    await pump();

    expect(snapshotVersion).toBeGreaterThan(1);
    expect(await lost.listGaps(id)).toEqual([{ from: 2, to: snapshotVersion }]);
  });

  it('归档与快照一致时恢复不写缺口', async () => {
    const first = makeHarness();
    const id = await first.svc.createFromRoom(makeRoom(4, [0]));
    await fireSteps(first, id, 2);
    await pump();
    first.svc.shutdown();
    const second = makeHarness({}, { store: first.store, archive: first.archive });
    await second.svc.restoreAll();
    await pump();
    expect(await first.archive.listGaps(id)).toEqual([]);
  });

  it('flushArchive 等队列写完并返回未写完条数', async () => {
    let failures = 1;
    class FlakyArchive extends InMemoryMatchArchive {
      override async appendStep(row: Parameters<InMemoryMatchArchive['appendStep']>[0]) {
        if (failures > 0) {
          failures -= 1;
          throw new Error('pg down');
        }
        await super.appendStep(row);
      }
    }
    const archive = new FlakyArchive();
    const h = makeHarness({}, { archive });
    const id = await h.svc.createFromRoom(makeRoom(4));
    await fireSteps(h, id, 2);
    h.svc.shutdown();
    expect(await h.svc.flushArchive(5_000)).toBe(0);
    const rows = await archive.listSteps(id);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.map((r) => r.stateID)).toEqual(rows.map((_, i) => i + 1));
  });
});
