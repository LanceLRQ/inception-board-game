// 差分测试：同一串 move 分别交给 boardgame.io 的服务端归约器和自建运行器，
// 要求每一步的接受 / 拒绝、对局状态、回合归属都完全一致。
// 目的：验证不经过 boardgame.io 也能按原有语义驱动现有引擎。

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { CreateGameReducer, InitializeGame } from 'boardgame.io/internal';
import { InceptionCityGame } from '../game.js';
import { denyAction } from '../engine/actionRights.js';
import type { SetupState } from '../setup.js';
import {
  applyMove,
  createMatch,
  type GameDef,
  type MatchState,
  type RandomSource,
} from './matchRunner.js';
import {
  makeRandomSource,
  makeTestRng,
  pickLegalMove,
  pickNoiseMove,
  type MoveCandidate,
} from './moveFuzzer.js';

const game: GameDef<SetupState> = InceptionCityGame;

/**
 * 把 Game 定义里每个 move 的随机源换成指定的那一个，其余不变。
 * 传了 actingAs 时，move 看到的发起者改成它返回的玩家（返回 undefined 则不改）：
 * boardgame.io 只接受回合主人，回合外响应者的请求要借回合主人的名义送进去，
 * 而 move 本体仍按真正的发起者校验行动权。
 */
function withRandom(
  base: GameDef<SetupState>,
  random: RandomSource,
  actingAs: () => string | undefined = () => undefined,
): GameDef<SetupState> {
  const phases: GameDef<SetupState>['phases'] = {};
  for (const [name, phase] of Object.entries(base.phases)) {
    const moves: NonNullable<typeof phase.moves> = {};
    for (const [moveName, def] of Object.entries(phase.moves ?? {})) {
      const original = def.move as (c: object, ...a: unknown[]) => unknown;
      moves[moveName] = {
        ...def,
        move: ((c: object, ...a: unknown[]) => {
          const actor = actingAs();
          return original(
            actor === undefined ? { ...c, random } : { ...c, random, playerID: actor },
            ...a,
          );
        }) as never,
      };
    }
    // boardgame.io 初始化时会原地改写 phase.turn，这里拷一份，避免污染共享的引擎定义
    phases[name] = { ...phase, ...(phase.turn ? { turn: { ...phase.turn } } : {}), moves };
  }
  return { ...base, phases };
}

interface RefState {
  G: SetupState;
  ctx: {
    currentPlayer: string;
    phase: string | null;
    turn: number;
    playOrderPos: number;
    gameover?: unknown;
  };
}

/** boardgame.io 一侧：服务端语义的归约器（isClient 不开），每个 move 只执行一次 */
function makeReference(numPlayers: number, setupData: Record<string, unknown>, seed: number) {
  let actingAs: string | undefined;
  const refGame = withRandom(game, makeRandomSource(makeTestRng(seed)), () => actingAs);
  const reducer = CreateGameReducer({ game: refGame as never });
  let state = InitializeGame({ game: refGame as never, numPlayers, setupData });
  return {
    get state(): RefState {
      return state as unknown as RefState;
    },
    apply(c: MoveCandidate, borrowOwner = false): boolean {
      let next: { transients?: { error?: unknown } };
      // 回合外的发起者：以回合主人的名义送给 boardgame.io，move 内部再换回真正的发起者
      const owner = (state as unknown as RefState).ctx.currentPlayer;
      const impersonate = borrowOwner && c.playerID !== owner;
      if (impersonate) actingAs = c.playerID;
      try {
        next = reducer(
          state as never,
          {
            type: 'MAKE_MOVE',
            payload: {
              type: c.move,
              args: c.args,
              playerID: impersonate ? owner : c.playerID,
              credentials: undefined,
            },
          } as never,
        ) as unknown as { transients?: { error?: unknown } };
      } catch {
        // 畸形参数让 move 抛异常时，boardgame.io 不拦截；这里按「拒绝」处理
        return false;
      } finally {
        actingAs = undefined;
      }
      if (next.transients?.error) return false;
      const rest = { ...next };
      delete rest.transients;
      state = rest as never;
      return true;
    },
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

function expectSame(run: MatchState<SetupState>, ref: RefState, label: string): void {
  const a = JSON.stringify(run.G);
  const b = JSON.stringify(ref.G);
  if (a !== b) {
    // 只在不一致时做深比较，拿到可读的差异
    expect(run.G, label).toEqual(ref.G);
  }
  expect(
    {
      currentPlayer: run.ctx.currentPlayer,
      phase: run.ctx.phase,
      turn: run.ctx.turn,
      playOrderPos: run.ctx.playOrderPos,
      gameover: run.ctx.gameover,
    },
    label,
  ).toEqual({
    currentPlayer: ref.ctx.currentPlayer,
    phase: ref.ctx.phase,
    turn: ref.ctx.turn,
    playOrderPos: ref.ctx.playOrderPos,
    gameover: ref.ctx.gameover,
  });
}

interface PlayoutStats {
  steps: number;
  accepted: number;
  rejectedNoise: number;
  turns: number;
  finished: boolean;
  moveNames: Set<string>;
}

function playout(numPlayers: number, seed: number, maxSteps: number): PlayoutStats {
  const setupData = { rngSeed: `diff-${seed}` };
  const ref = makeReference(numPlayers, setupData, seed);
  const runRandom = makeRandomSource(makeTestRng(seed));
  let run = createMatch(game, { numPlayers, setupData, seed: `diff-${seed}` });
  const fuzz = makeTestRng(seed * 7919 + numPlayers);
  const stats: PlayoutStats = {
    steps: 0,
    accepted: 0,
    rejectedNoise: 0,
    turns: 0,
    finished: false,
    moveNames: new Set(),
  };

  expectSame(run, ref.state, `初始状态 n=${numPlayers} seed=${seed}`);

  for (let step = 0; step < maxSteps; step++) {
    deepFreeze(run);
    const label = `n=${numPlayers} seed=${seed} step=${step}`;

    // 先发一个大概率非法的 move，比较两边的拒绝行为。
    // 回合外的人发的请求，运行器按行动权表可能接受，而对照的 boardgame.io 一律拒绝，
    // 这是有意的分叉：只有行动权表也判定拒绝的请求才发给两边比较。
    const noise = pickNoiseMove(game, run, fuzz);
    const offTurn = noise.playerID !== run.ctx.currentPlayer;
    const comparable =
      !offTurn ||
      run.ctx.phase !== 'playing' ||
      denyAction(run.G, noise.playerID, noise.move) !== null;
    if (comparable) {
      const noiseRef = ref.apply(noise);
      const noiseRun = applyMove(game, run, noise, { random: runRandom });
      expect(noiseRun.ok, `${label} 干扰 move ${noise.move} by ${noise.playerID}`).toBe(noiseRef);
      if (noiseRun.ok) {
        run = noiseRun.state;
        stats.accepted++;
        stats.moveNames.add(noise.move);
      } else {
        stats.rejectedNoise++;
      }
      expectSame(run, ref.state, `${label} 干扰 move ${noise.move} 之后`);
    }
    if (run.ctx.gameover !== undefined) {
      stats.finished = true;
      break;
    }

    deepFreeze(run);
    // 回合外的响应者也出招，否则遇到需要他们结算的局面就停滞了
    const cand = pickLegalMove(game, run, fuzz);
    if (!cand) break;
    const okRef = ref.apply(cand, true);
    const res = applyMove(game, run, cand, { random: runRandom });
    expect(res.ok, `${label} move ${cand.move}`).toBe(okRef);
    if (res.ok) {
      run = res.state;
      stats.accepted++;
      stats.moveNames.add(cand.move);
    }
    expectSame(run, ref.state, `${label} move ${cand.move} 之后`);
    stats.steps = step + 1;
    if (run.ctx.gameover !== undefined) {
      stats.finished = true;
      break;
    }
  }
  stats.turns = run.ctx.turn;
  return stats;
}

describe('对局运行器 · 与 boardgame.io 归约器的差分', () => {
  // boardgame.io 对每个被拒绝的 move 都会打一条 console.error，测试里静音
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(() => {
    errorSpy.mockRestore();
  });

  it('初始化之后两边状态一致（4–10 人）', () => {
    for (let n = 4; n <= 10; n++) {
      const setupData = { rngSeed: `init-${n}` };
      const ref = makeReference(n, setupData, n);
      const run = createMatch(game, { numPlayers: n, setupData, seed: 'x' });
      expectSame(run, ref.state, `n=${n}`);
    }
  });

  const totals = { games: 0, finished: 0, accepted: 0, moveNames: new Set<string>() };

  it.each([4, 5, 6, 7, 8, 9, 10])('%i 人局：随机对局逐步一致', (numPlayers) => {
    let accepted = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const stats = playout(numPlayers, seed * 100 + numPlayers, 400);
      stats.moveNames.forEach((m) => totals.moveNames.add(m));
      totals.games++;
      if (stats.finished) totals.finished++;
      accepted += stats.accepted;
    }
    totals.accepted += accepted;
    // 生成器要真的在推进对局，否则「一致」没有意义
    expect(accepted).toBeGreaterThan(200);
  });

  it('随机对局的覆盖面足够：打到终局的局数、接受的 move 数、涉及的 move 种类', () => {
    expect(totals.games).toBe(42);
    expect(totals.finished).toBeGreaterThanOrEqual(10);
    expect(totals.accepted).toBeGreaterThan(4000);
    expect(totals.moveNames.size).toBeGreaterThanOrEqual(40);
  });
});
