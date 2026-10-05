import { describe, it, expect, vi } from 'vitest';
import { InceptionCityGame } from '@icgame/game-engine';
import type { SetupState } from '@icgame/game-engine/setup';
import { applyMove, createMatch, type GameDef, type MatchState } from '@icgame/game-engine/runner';
import { nextAutoAction } from '@icgame/bot';
import { MatchRoom, type RoomDeps, type RoomSeat, type StepOutput } from './MatchRoom.js';
import type { TimingConfig } from './scheduling.js';
import { FakeTimers } from '../testing/fakeTimers.js';

const game: GameDef<SetupState> = InceptionCityGame;
const timing: TimingConfig = { botStepDelayMs: 10, pendingTimeoutMs: 5_000, turnTimeoutMs: 20_000 };

function makeSeats(n: number, humans: readonly string[] = []): RoomSeat[] {
  return Array.from({ length: n }, (_, i) => {
    const seat = String(i);
    const human = humans.includes(seat);
    return {
      seat,
      playerId: human ? `acct-${seat}` : null,
      nickname: human ? `P${seat}` : `Bot${seat}`,
      isBot: !human,
    };
  });
}

function newMatch(n: number, seed = 'room-seed'): MatchState<SetupState> {
  return createMatch(game, { numPlayers: n, setupData: { rngSeed: seed }, seed });
}

interface Harness {
  room: MatchRoom;
  timers: FakeTimers;
  steps: StepOutput[];
  persisted: number[];
  gameOver: ReturnType<typeof vi.fn>;
  takenOver: Set<string>;
  deps: RoomDeps;
}

function makeHarness(
  n: number,
  humans: readonly string[] = [],
  patch: Partial<RoomDeps> = {},
  initial: MatchState<SetupState> = newMatch(n),
): Harness {
  const timers = new FakeTimers();
  const steps: StepOutput[] = [];
  const persisted: number[] = [];
  const takenOver = new Set<string>();
  const gameOver = vi.fn();
  const deps: RoomDeps = {
    game,
    persist: async (state) => {
      persisted.push(state.stateID);
      return 'ok';
    },
    onStep: (o) => {
      steps.push(o);
    },
    onGameOver: gameOver,
    isTakenOver: (seat) => takenOver.has(seat),
    timing,
    timers,
    ...patch,
  };
  const room = new MatchRoom('m1', makeSeats(n, humans), initial, deps);
  return { room, timers, steps, persisted, gameOver, takenOver, deps };
}

/** 一直触发计时器直到没有计时器或步数用尽 */
async function drain(h: Harness, maxFires = 5000): Promise<void> {
  for (let i = 0; i < maxFires; i++) {
    await h.room.idle();
    if (!h.timers.fireNext()) break;
  }
  await h.room.idle();
}

/** 走完布置阶段，把房间推进到回合主人的正常行动 */
function stateAfterSetup(n: number): MatchState<SetupState> {
  const s = newMatch(n);
  const out = applyMove(game, s, {
    playerID: s.ctx.currentPlayer,
    move: 'completeSetup',
    args: [],
  });
  if (!out.ok) throw new Error('setup failed');
  return out.state;
}

describe('MatchRoom 整局自动对局', () => {
  for (const n of [4, 7]) {
    it(`${n} 人全 Bot 座位自己打完一局`, async () => {
      const h = makeHarness(n);
      h.room.start();
      await drain(h);

      expect(h.gameOver).toHaveBeenCalledTimes(1);
      expect(h.room.current().ctx.gameover).toBeDefined();
      expect(h.steps.length).toBeGreaterThan(0);
      h.steps.forEach((s, i) => {
        expect(s.state.stateID).toBe(i + 1);
        expect(s.source).toBe('bot');
      });
      expect(h.persisted).toEqual(h.steps.map((s) => s.state.stateID));
      expect(h.timers.pending()).toHaveLength(0);
      expect(h.room.deadlineAt()).toBeNull();

      const late = await h.room.submit('0', { move: 'endActionPhase', args: [], intentId: 'late' });
      expect(late).toEqual({ ok: false, code: 'match_over' });
    }, 120_000);
  }
});

describe('MatchRoom 排程', () => {
  it('构造时不启动计时器，start 才开始，重复 start 无害', () => {
    const h = makeHarness(5);
    expect(h.timers.pending()).toHaveLength(0);
    h.room.start();
    h.room.start();
    expect(h.timers.pending()).toHaveLength(1);
  });

  it('自动行动挂短延迟，deadlineAt 为 null', () => {
    const h = makeHarness(5);
    h.room.start();
    expect(h.timers.pending()[0]!.at).toBe(h.timers.now() + timing.botStepDelayMs);
    expect(h.room.deadlineAt()).toBeNull();
  });

  it('轮到真人时不自动行动，挂的是截止计时', () => {
    const initial = stateAfterSetup(5);
    const h = makeHarness(5, ['0', '1', '2', '3', '4'], {}, initial);
    h.room.start();
    expect(h.timers.pending()).toHaveLength(1);
    expect(h.room.deadlineAt()).toBe(h.timers.now() + timing.turnTimeoutMs);
    expect(h.timers.pending()[0]!.at).toBe(h.room.deadlineAt());
    expect(h.steps).toHaveLength(0);
  });

  it('截止到点后代发一步，source 为 timeout，并重新排程', async () => {
    const initial = stateAfterSetup(5);
    const h = makeHarness(5, ['0', '1', '2', '3', '4'], {}, initial);
    h.room.start();
    h.timers.fireNext();
    await h.room.idle();
    expect(h.steps).toHaveLength(1);
    expect(h.steps[0]!.source).toBe('timeout');
    expect(h.room.current().stateID).toBe(initial.stateID + 1);
    expect(h.timers.pending().length).toBeGreaterThan(0);
  });

  it('响应窗口用窗口自己的时长', () => {
    const base = stateAfterSetup(5);
    const initial = {
      ...base,
      G: {
        ...base.G,
        pendingResponseWindow: { responders: ['1'], responded: [], timeoutMs: 7_777 },
      },
    } as unknown as MatchState<SetupState>;
    const h = makeHarness(5, ['0', '1', '2', '3', '4'], {}, initial);
    h.room.start();
    expect(h.room.deadlineAt()).toBe(h.timers.now() + 7_777);
  });

  it('onStep 收到的 deadlineAt 是这一步之后的截止时间', async () => {
    const initial = stateAfterSetup(5);
    const h = makeHarness(5, ['0', '1', '2', '3', '4'], {}, initial);
    h.room.start();
    h.timers.fireNext();
    await h.room.idle();
    expect(h.steps[0]!.deadlineAt).toBe(h.room.deadlineAt());
  });

  it('isTakenOver 变真并 reschedule 后开始自动行动，变回假后停止', async () => {
    const initial = stateAfterSetup(5);
    const humans = ['0', '1', '2', '3', '4'];
    const h = makeHarness(5, humans, {}, initial);
    h.room.start();
    expect(h.room.deadlineAt()).not.toBeNull();

    for (const s of humans) h.takenOver.add(s);
    h.room.reschedule();
    expect(h.room.deadlineAt()).toBeNull();
    expect(h.timers.pending()).toHaveLength(1);
    h.timers.fireNext();
    await h.room.idle();
    expect(h.steps[0]!.source).toBe('bot');

    h.takenOver.clear();
    h.room.reschedule();
    expect(h.room.deadlineAt()).not.toBeNull();
    expect(h.timers.pending()).toHaveLength(1);
  });

  it('close 之后计时器不再触发，submit 回 match_over', async () => {
    const h = makeHarness(5);
    h.room.start();
    h.room.close();
    expect(h.timers.pending()).toHaveLength(0);
    expect(h.timers.fireNext()).toBe(false);
    const r = await h.room.submit('0', { move: 'completeSetup', args: [], intentId: 'x' });
    expect(r).toEqual({ ok: false, code: 'match_over' });
    expect(h.steps).toHaveLength(0);
  });

  it('已入队的计时任务在 close 后被丢弃', async () => {
    const h = makeHarness(5);
    h.room.start();
    h.timers.fireNext();
    h.room.close();
    await h.room.idle();
    expect(h.steps).toHaveLength(0);
  });
});

describe('MatchRoom 提交', () => {
  function humanRoom(): Harness {
    const initial = stateAfterSetup(5);
    return makeHarness(5, ['0', '1', '2', '3', '4'], {}, initial);
  }

  it('接受一步后推进状态，返回新版本号，并走 persist 与 onStep', async () => {
    const h = humanRoom();
    h.room.start();
    const before = h.room.current();
    const action = nextAutoAction(before, { humanPlayerIDs: [] })!;
    const r = await h.room.submit(action.playerID, {
      move: action.move,
      args: action.args,
      intentId: 'a',
      stateID: before.stateID,
    });
    expect(r).toEqual({ ok: true, stateID: before.stateID + 1 });
    expect(h.persisted).toEqual([before.stateID + 1]);
    expect(h.steps).toHaveLength(1);
    expect(h.steps[0]!.source).toBe('player');
    expect(h.steps[0]!.request.playerID).toBe(action.playerID);
  });

  it('被拒的 move 不触发 persist 与 onStep，状态不变', async () => {
    const h = humanRoom();
    h.room.start();
    const before = h.room.current();
    const r = await h.room.submit('0', { move: 'noSuchMove', args: [], intentId: 'bad' });
    expect(r).toEqual({ ok: false, code: 'unknown_move' });
    expect(h.persisted).toHaveLength(0);
    expect(h.steps).toHaveLength(0);
    expect(h.room.current()).toBe(before);
  });

  it('过期 stateID 被拒，且不进幂等表', async () => {
    const h = humanRoom();
    h.room.start();
    const action = nextAutoAction(h.room.current(), { humanPlayerIDs: [] })!;
    const stale = await h.room.submit(action.playerID, {
      move: action.move,
      args: action.args,
      intentId: 'same',
      stateID: 999,
    });
    expect(stale).toEqual({ ok: false, code: 'stale_state' });
    const again = await h.room.submit(action.playerID, {
      move: action.move,
      args: action.args,
      intentId: 'same',
    });
    expect(again.ok).toBe(true);
  });

  it('重复 intentId 不重复执行，返回与第一次相同的结果', async () => {
    const h = humanRoom();
    h.room.start();
    const action = nextAutoAction(h.room.current(), { humanPlayerIDs: [] })!;
    const input = { move: action.move, args: action.args, intentId: 'dup' };
    const first = await h.room.submit(action.playerID, input);
    const second = await h.room.submit(action.playerID, input);
    expect(second).toEqual(first);
    expect(h.persisted).toHaveLength(1);
    expect(h.steps).toHaveLength(1);
  });

  it('被拒的结果也进幂等表，重复发送回同样的拒绝', async () => {
    const h = humanRoom();
    h.room.start();
    const input = { move: 'noSuchMove', args: [], intentId: 'rej' };
    const first = await h.room.submit('0', input);
    const second = await h.room.submit('0', input);
    expect(second).toEqual(first);
    expect(first).toEqual({ ok: false, code: 'unknown_move' });
  });

  it('幂等表容量 256，先进先出', async () => {
    const h = humanRoom();
    h.room.start();
    for (let i = 0; i < 257; i++) {
      await h.room.submit('0', { move: 'noSuchMove', args: [], intentId: `i${i}` });
    }
    // i0 已被挤出表：重新提交仍是被拒，但不再是「记忆结果」，用一个有效 move 区分
    const action = nextAutoAction(h.room.current(), { humanPlayerIDs: [] })!;
    const ok = await h.room.submit(action.playerID, {
      move: action.move,
      args: action.args,
      intentId: 'i0',
    });
    expect(ok.ok).toBe(true);
    // i256 仍在表里：即使换成有效 move 也回之前的拒绝
    const action2 = nextAutoAction(h.room.current(), { humanPlayerIDs: [] })!;
    const remembered = await h.room.submit(action2.playerID, {
      move: action2.move,
      args: action2.args,
      intentId: 'i256',
    });
    expect(remembered).toEqual({ ok: false, code: 'unknown_move' });
  });

  it('并发提交 20 个 move：执行顺序与提交顺序一致，persist 从不重入', async () => {
    let active = 0;
    let maxActive = 0;
    const order: number[] = [];
    const h = makeHarness(
      5,
      ['0', '1', '2', '3', '4'],
      {
        persist: async (state) => {
          active++;
          maxActive = Math.max(maxActive, active);
          await Promise.resolve();
          await Promise.resolve();
          active--;
          order.push(state.stateID);
          return 'ok';
        },
      },
      stateAfterSetup(5),
    );
    h.room.start();
    const action = nextAutoAction(h.room.current(), { humanPlayerIDs: [] })!;
    const done: number[] = [];
    const results = Array.from({ length: 20 }, (_, i) =>
      h.room
        .submit(action.playerID, { move: action.move, args: action.args, intentId: `c${i}` })
        .then((r) => {
          done.push(i);
          return r;
        }),
    );
    const all = await Promise.all(results);
    expect(done).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(maxActive).toBe(1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(all.some((r) => r.ok)).toBe(true);
    // 每个被接受的结果版本号严格递增
    const okIDs = all.flatMap((r) => (r.ok ? [r.stateID] : []));
    expect(okIDs).toEqual([...okIDs].sort((a, b) => a - b));
    expect(new Set(okIDs).size).toBe(okIDs.length);
  });

  it('persist 返回 conflict：状态不前进、回 internal_error、房间关闭', async () => {
    const h = makeHarness(
      5,
      ['0', '1', '2', '3', '4'],
      { persist: async () => 'conflict' },
      stateAfterSetup(5),
    );
    h.room.start();
    const before = h.room.current();
    const action = nextAutoAction(before, { humanPlayerIDs: [] })!;
    const r = await h.room.submit(action.playerID, {
      move: action.move,
      args: action.args,
      intentId: 'x',
    });
    expect(r).toEqual({ ok: false, code: 'internal_error' });
    expect(h.room.current()).toBe(before);
    expect(h.steps).toHaveLength(0);
    expect(h.timers.pending()).toHaveLength(0);
    const next = await h.room.submit(action.playerID, {
      move: action.move,
      args: action.args,
      intentId: 'y',
    });
    expect(next).toEqual({ ok: false, code: 'match_over' });
  });

  it('persist 抛错：同样不前进并关闭房间', async () => {
    const h = makeHarness(
      5,
      ['0', '1', '2', '3', '4'],
      {
        persist: async () => {
          throw new Error('redis down');
        },
      },
      stateAfterSetup(5),
    );
    h.room.start();
    const before = h.room.current();
    const action = nextAutoAction(before, { humanPlayerIDs: [] })!;
    const r = await h.room.submit(action.playerID, {
      move: action.move,
      args: action.args,
      intentId: 'x',
    });
    expect(r).toEqual({ ok: false, code: 'internal_error' });
    expect(h.room.current()).toBe(before);
    expect(h.timers.pending()).toHaveLength(0);
  });

  it('persist 冲突或抛错时各调用一次 onFatal，并带上原因', async () => {
    for (const [patch, reason] of [
      [{ persist: async () => 'conflict' as const }, 'persist_conflict'],
      [
        {
          persist: async () => {
            throw new Error('redis down');
          },
        },
        'persist_error',
      ],
    ] as const) {
      const onFatal = vi.fn();
      const h = makeHarness(
        5,
        ['0', '1', '2', '3', '4'],
        { ...patch, onFatal },
        stateAfterSetup(5),
      );
      h.room.start();
      const action = nextAutoAction(h.room.current(), { humanPlayerIDs: [] })!;
      const move = { move: action.move, args: action.args };
      await h.room.submit(action.playerID, { ...move, intentId: 'x' });
      await h.room.submit(action.playerID, { ...move, intentId: 'y' });
      expect(onFatal).toHaveBeenCalledTimes(1);
      expect(onFatal).toHaveBeenCalledWith(reason);
    }
  });

  it('onFatal 本身抛错不影响房间关闭', async () => {
    const h = makeHarness(
      5,
      ['0', '1', '2', '3', '4'],
      {
        persist: async () => 'conflict',
        onFatal: () => {
          throw new Error('boom');
        },
      },
      stateAfterSetup(5),
    );
    h.room.start();
    const action = nextAutoAction(h.room.current(), { humanPlayerIDs: [] })!;
    const r = await h.room.submit(action.playerID, {
      move: action.move,
      args: action.args,
      intentId: 'x',
    });
    expect(r).toEqual({ ok: false, code: 'internal_error' });
    expect(h.timers.pending()).toHaveLength(0);
  });

  it('onStep 抛错或返回 rejected Promise 不影响对局继续', async () => {
    let calls = 0;
    const h = makeHarness(5, [], {
      onStep: () => {
        calls++;
        if (calls % 2 === 0) return Promise.reject(new Error('archive down'));
        throw new Error('sync fail');
      },
    });
    h.room.start();
    await drain(h);
    expect(calls).toBeGreaterThan(2);
    expect(h.room.current().ctx.gameover).toBeDefined();
    expect(h.gameOver).toHaveBeenCalledTimes(1);
  }, 120_000);

  it('onGameOver 抛错只记日志', async () => {
    const h = makeHarness(4, [], {
      onGameOver: () => {
        throw new Error('boom');
      },
    });
    h.room.start();
    await drain(h);
    expect(h.room.current().ctx.gameover).toBeDefined();
  }, 120_000);
});

describe('MatchRoom 自动步被拒', () => {
  it('自动步连续被拒 3 次后停止排程，reschedule 后恢复排程', async () => {
    const h = makeHarness(5);
    // 用一个所有 move 都不存在的对局定义，让运行器永远拒绝
    const rejectingGame: GameDef<SetupState> = {
      ...game,
      phases: Object.fromEntries(
        Object.entries(game.phases).map(([k, v]) => [k, { ...v, moves: {} }]),
      ) as GameDef<SetupState>['phases'],
    };
    const room = new MatchRoom('m2', makeSeats(5), newMatch(5), { ...h.deps, game: rejectingGame });
    room.start();
    for (let i = 0; i < 3; i++) {
      expect(h.timers.pending()).toHaveLength(1);
      h.timers.fireNext();
      await room.idle();
    }
    expect(h.timers.pending()).toHaveLength(0);
    expect(room.current().stateID).toBe(0);

    room.reschedule();
    expect(h.timers.pending()).toHaveLength(1);
  });

  it('截止到点取不到动作：重新挂一次，连续 3 次后不再挂', async () => {
    const base = stateAfterSetup(5);
    // 回合主人指向不存在的座位：代发动作取不到或被拒，都受 3 次上限约束
    const broken = {
      ...base,
      ctx: { ...base.ctx, currentPlayer: 'ghost' },
    } as MatchState<SetupState>;
    const h = makeHarness(5, ['0', '1', '2', '3', '4'], {}, broken);
    h.room.start();
    let fires = 0;
    while (h.timers.fireNext()) {
      fires++;
      await h.room.idle();
      if (fires > 10) break;
    }
    expect(fires).toBeLessThanOrEqual(4);
    expect(h.timers.pending()).toHaveLength(0);
  });
});

describe('MatchRoom 访问器', () => {
  it('seats 与 matchID 原样返回', () => {
    const h = makeHarness(4, ['1']);
    expect(h.room.matchID).toBe('m1');
    expect(h.room.seats()).toHaveLength(4);
    expect(h.room.seats()[1]).toMatchObject({ seat: '1', playerId: 'acct-1', isBot: false });
    expect(h.room.seats()[0]).toMatchObject({ playerId: null, isBot: true });
  });
});
