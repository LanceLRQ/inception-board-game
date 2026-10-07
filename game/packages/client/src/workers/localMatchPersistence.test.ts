import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore, type KeyValueStore } from '../lib/idbStore';
import { createLocalMatchSaves, type LocalMatchSaves } from '../lib/localMatchSave';
import {
  createCoalescingWriter,
  createMatchPersistence,
  startLocalMatch,
  type PersistableSession,
} from './localMatchPersistence';
import { LocalMatchSession } from './localMatchSession';

const ENGINE = 9;
const log = { flow: vi.fn(), warn: vi.fn() };

function makeSaves(store: KeyValueStore = createMemoryStore()): LocalMatchSaves {
  return createLocalMatchSaves(store, { engineSchema: ENGINE });
}

/** 把会话推到真人的回合，再抽一张牌，作为一个有内容的局面 */
function playedSession(seed: string, playerCount = 4): LocalMatchSession {
  const session = new LocalMatchSession({ playerCount, seed });
  for (let i = 0; i < 5000; i++) {
    if (!session.step().continue) break;
  }
  session.humanMove('doDraw', []);
  return session;
}

async function saveSession(saves: LocalMatchSaves, session: LocalMatchSession, playerCount = 4) {
  const { G, stateID } = session.view();
  await saves.save({ playerCount, turn: G.turnNumber, stateID, state: session.snapshot() });
}

beforeEach(() => {
  vi.clearAllMocks();
});

/** 自动循环一直走到轮到真人，让角色分配等由种子决定的内容进入视图 */
function runToHuman(session: LocalMatchSession): void {
  for (let i = 0; i < 5000; i++) {
    if (!session.step().continue) return;
  }
}

describe('startLocalMatch', () => {
  it('不恢复也不存档：直接开新局，不碰存档', async () => {
    const store = createMemoryStore();
    const saves = makeSaves(store);
    await saveSession(saves, playedSession('a'));
    const result = await startLocalMatch(
      { playerCount: 5, persist: false, resume: false },
      saves,
      log,
    );
    expect(result).toMatchObject({ resumed: false, fellBack: false });
    expect(await saves.readMeta()).not.toBeNull();
  });

  it('不恢复但要存档：先清掉旧存档再开新局', async () => {
    const saves = makeSaves();
    await saveSession(saves, playedSession('a'));
    const result = await startLocalMatch(
      { playerCount: 5, persist: true, resume: false },
      saves,
      log,
    );
    expect(result.resumed).toBe(false);
    expect(await saves.readMeta()).toBeNull();
    expect(result.session.view().ctx.numPlayers).toBe(5);
  });

  it('给了固定种子：同样的种子与人数开出同一局，与建局时刻无关', async () => {
    const saves = makeSaves();
    const request = { playerCount: 4, persist: false, resume: false, seed: 'fixed-1' };
    const a = await startLocalMatch(request, saves, log, () => 1000);
    const b = await startLocalMatch(request, saves, log, () => 2000);
    expect(a.session.snapshot().G.rngSeed).toBe('fixed-1');
    runToHuman(a.session);
    runToHuman(b.session);
    expect(a.session.view()).toEqual(b.session.view());
  });

  it('固定种子不同：开出的局不同', async () => {
    const saves = makeSaves();
    const base = { playerCount: 4, persist: false, resume: false };
    const a = await startLocalMatch({ ...base, seed: 'fixed-1' }, saves, log);
    const b = await startLocalMatch({ ...base, seed: 'fixed-2' }, saves, log);
    runToHuman(a.session);
    runToHuman(b.session);
    expect(JSON.stringify(a.session.view().G)).not.toBe(JSON.stringify(b.session.view().G));
  });

  it('没给固定种子：种子由房间号与建局时刻生成', async () => {
    const result = await startLocalMatch(
      { playerCount: 4, matchID: 'room-1', persist: false, resume: false },
      makeSaves(),
      log,
      () => 1234,
    );
    expect(result.session.snapshot().G.rngSeed).toBe('room-1-1234');
  });

  it('恢复：得到与存档时一致的局面，人数取自存档', async () => {
    const saves = makeSaves();
    const original = playedSession('resume-me', 5);
    await saveSession(saves, original, 5);

    const result = await startLocalMatch(
      { playerCount: 4, persist: true, resume: true },
      saves,
      log,
    );
    expect(result).toMatchObject({ resumed: true, fellBack: false });
    expect(result.session.view()).toEqual(original.view());
    expect(result.session.view().ctx.numPlayers).toBe(5);
    expect(log.flow).toHaveBeenCalledWith('local match restored', expect.anything());
  });

  it('要求恢复但没有存档：开新局并标记 fellBack', async () => {
    const result = await startLocalMatch(
      { playerCount: 4, persist: true, resume: true },
      makeSaves(),
      log,
    );
    expect(result).toMatchObject({ resumed: false, fellBack: true });
  });

  it('存档里的状态不合法：丢弃存档、记警告、开新局', async () => {
    const store = createMemoryStore();
    const saves = makeSaves(store);
    await saves.save({ playerCount: 4, turn: 1, stateID: 1, state: { not: 'a match' } });
    const result = await startLocalMatch(
      { playerCount: 6, persist: true, resume: true },
      saves,
      log,
    );
    expect(result).toMatchObject({ resumed: false, fellBack: true });
    expect(result.session.view().ctx.numPlayers).toBe(6);
    expect(log.warn).toHaveBeenCalled();
    expect(await saves.readMeta()).toBeNull();
  });

  it('引擎状态版本对不上：丢弃存档并开新局', async () => {
    const store = createMemoryStore();
    await saveSession(makeSaves(store), playedSession('v'));
    const newer = createLocalMatchSaves(store, { engineSchema: ENGINE + 1 });
    const result = await startLocalMatch(
      { playerCount: 4, persist: true, resume: true },
      newer,
      log,
    );
    expect(result).toMatchObject({ resumed: false, fellBack: true });
    expect(await newer.readMeta()).toBeNull();
  });
});

describe('createCoalescingWriter', () => {
  it('写入期间的多次请求只保留最后一个', async () => {
    const writer = createCoalescingWriter();
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    writer.request(async () => {
      order.push('first:start');
      await gate;
      order.push('first:end');
    });
    writer.request(async () => void order.push('second'));
    writer.request(async () => void order.push('third'));
    release();
    await writer.idle();
    expect(order).toEqual(['first:start', 'first:end', 'third']);
  });

  it('某次写入抛错不会让队列停转', async () => {
    const writer = createCoalescingWriter();
    const done = vi.fn();
    writer.request(async () => {
      throw new Error('boom');
    });
    writer.request(async () => done());
    await writer.idle();
    expect(done).toHaveBeenCalledTimes(1);
    writer.request(async () => done());
    await writer.idle();
    expect(done).toHaveBeenCalledTimes(2);
  });
});

describe('createMatchPersistence', () => {
  it('状态变化时落盘当前状态，读回的摘要带回合数', async () => {
    const saves = makeSaves();
    const persistence = createMatchPersistence(saves, 4, log);
    const session = playedSession('p1');
    persistence.onChange(session, () => true);
    await persistence.idle();
    const meta = await saves.readMeta();
    expect(meta).toMatchObject({ playerCount: 4, turn: session.view().G.turnNumber });
    expect((await saves.load())?.state).toEqual(JSON.parse(JSON.stringify(session.snapshot())));
  });

  it('这局已被新局替换（isCurrent 为假）时放弃写入', async () => {
    const saves = makeSaves();
    const persistence = createMatchPersistence(saves, 4, log);
    persistence.onChange(playedSession('p2'), () => false);
    await persistence.idle();
    expect(await saves.readMeta()).toBeNull();
  });

  it('终局时清除存档而不是写入', async () => {
    const saves = makeSaves();
    await saveSession(saves, playedSession('p3'));
    const finished: PersistableSession = {
      view: () =>
        ({
          G: {},
          ctx: { gameover: { winner: 'thief' }, turn: 9 },
          stateID: 99,
        }) as unknown as ReturnType<LocalMatchSession['view']>,
      snapshot: () => ({}),
    };
    const persistence = createMatchPersistence(saves, 4, log);
    persistence.onChange(finished, () => true);
    await persistence.idle();
    expect(await saves.readMeta()).toBeNull();
    expect(log.flow).toHaveBeenCalledWith('local match finished, save cleared');
  });

  it('写入排队期间状态又前进了：落盘的是写入时刻的最新状态', async () => {
    const saves = makeSaves();
    const persistence = createMatchPersistence(saves, 4, log);
    const session = playedSession('p4');
    persistence.onChange(session, () => true);
    // 第一次写入还没开始跑，状态又前进一步并再次请求
    session.humanMove('endActionPhase', []);
    persistence.onChange(session, () => true);
    await persistence.idle();
    expect((await saves.readMeta())?.stateID).toBe(session.view().stateID);
  });
});
