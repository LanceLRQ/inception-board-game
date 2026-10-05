// 对局运行器（原型）
//
// 不依赖 boardgame.io，直接驱动 Game 定义对象：建局、执行 move、推进阶段与回合、判定终局。
// 全部是纯函数，状态是可以直接 JSON 序列化的普通对象，服务端和浏览器 Worker 都能用。
//
// 回合与阶段的推进顺序照搬 boardgame.io 0.50 的流程控制（core/flow.ts 的处理循环），
// 由同目录的差分测试保证两者逐步一致。只实现了本项目用到的部分：
//   - 阶段：start / next / endIf / onBegin / onEnd
//   - 回合：order.first / order.next / onBegin / onEnd
//   - 事件：move 里调用 events.endTurn()
//   - 全局：endIf
// 没有实现：分阶段行动（stages / activePlayers）、回合的 endIf 与步数上限、撤销重做、插件。

const INVALID_MOVE = 'INVALID_MOVE';

export interface RandomSource {
  D6(): number;
  Die(sides: number): number;
  Shuffle<T>(arr: T[]): T[];
}

export interface RunnerCtx {
  numPlayers: number;
  playOrder: string[];
  playOrderPos: number;
  /** 回合主人。回合外响应时，move 的发起者由 playerID 给出，二者可以不同 */
  currentPlayer: string;
  phase: string | null;
  turn: number;
  gameover?: unknown;
}

/** 一局对局的完整运行状态，可直接序列化 */
export interface MatchState<G> {
  G: G;
  ctx: RunnerCtx;
  /** 随机数发生器的内部状态，随状态一起保存，重启后可以接着掷 */
  rngState: number;
  /** 每接受一个 move 加 1，用作乐观锁版本号 */
  stateID: number;
}

export interface HookArgs<G> {
  G: G;
  ctx: RunnerCtx;
}

export interface MoveArgs<G> extends HookArgs<G> {
  playerID: string;
  random: RandomSource;
  events: {
    endTurn(arg?: { next?: string }): void;
    endPhase(): void;
  };
}

type Hook<G> = (args: HookArgs<G>) => G | void;

export interface MoveDef<G> {
  /** 沿用自 boardgame.io 的标记：为 false 表示只在权威端执行。运行器本身不读它 */
  client?: boolean;
  move: (args: MoveArgs<G>, ...rest: never[]) => G | typeof INVALID_MOVE | void;
}

export interface TurnDef<G> {
  order?: {
    first(args: HookArgs<G>): number;
    next(args: HookArgs<G>): number | undefined;
  };
  onBegin?: Hook<G>;
  onEnd?: Hook<G>;
}

export interface PhaseDef<G> {
  start?: boolean;
  next?: string | null;
  endIf?(args: HookArgs<G>): unknown;
  onBegin?: Hook<G>;
  onEnd?: Hook<G>;
  turn?: TurnDef<G>;
  moves?: Record<string, MoveDef<G>>;
}

export interface GameDef<G> {
  name?: string;
  minPlayers?: number;
  maxPlayers?: number;
  disableUndo?: boolean;
  setup(args: { ctx: { numPlayers: number } }, setupData?: Record<string, unknown>): G;
  phases: Record<string, PhaseDef<G>>;
  endIf?(args: HookArgs<G>): unknown;
}

export interface MoveRequest {
  playerID: string;
  move: string;
  args: readonly unknown[];
}

export type RejectReason =
  | 'unknown_move'
  | 'game_over'
  | 'not_active'
  | 'invalid_move'
  /** move 函数抛了异常（多半是参数形状不对）。状态不变，异常放在 error 里供调用方记录 */
  | 'move_error';

export type MoveOutcome<G> =
  | { ok: true; state: MatchState<G> }
  | { ok: false; reason: RejectReason; state: MatchState<G>; error?: unknown };

export interface ApplyMoveOptions {
  /** 覆盖随机源（测试用）。提供后不读也不写 state.rngState */
  random?: RandomSource;
  /**
   * 响应类 move：允许非回合主人发起。
   * 现有引擎的响应类守卫写的是「ctx.currentPlayer 必须是响应者」，
   * 所以对这些 move，运行器把发起者作为 ctx.currentPlayer 传进去；回合归属本身不变。
   */
  responseMoves?: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// 随机数：mulberry32，内部状态是一个 32 位整数
// ---------------------------------------------------------------------------

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

function seededRandom(initial: number): { source: RandomSource; state(): number } {
  let a = initial | 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const Die = (sides: number): number => Math.floor(next() * sides) + 1;
  return {
    source: {
      Die,
      D6: () => Die(6),
      Shuffle: <T>(arr: T[]): T[] => {
        const out = [...arr];
        for (let i = out.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          [out[i], out[j]] = [out[j]!, out[i]!];
        }
        return out;
      },
    },
    state: () => a,
  };
}

// ---------------------------------------------------------------------------
// 流程控制
// ---------------------------------------------------------------------------

type Step =
  | { kind: 'startPhase' }
  | { kind: 'startTurn'; currentPlayer?: string }
  | { kind: 'updatePhase'; from: string | null; arg?: unknown }
  | { kind: 'updateTurn'; currentPlayer: string; arg?: unknown }
  | { kind: 'endTurn'; turn: number | undefined; arg?: unknown }
  | { kind: 'endPhase'; turn: number | undefined; arg?: unknown }
  | { kind: 'endGame'; arg: unknown }
  | { kind: 'onMove' };

const EMPTY_PHASE = {};

function phaseOf<G>(game: GameDef<G>, phase: string | null): PhaseDef<G> {
  return (phase !== null ? game.phases[phase] : undefined) ?? EMPTY_PHASE;
}

function defaultPlayOrder(numPlayers: number): string[] {
  return Array.from({ length: numPlayers }, (_, i) => String(i));
}

function firstPos<G>(turn: TurnDef<G> | undefined, args: HookArgs<G>): number {
  if (turn?.order) return turn.order.first(args);
  const { ctx } = args;
  return ctx.turn === 0 ? ctx.playOrderPos : (ctx.playOrderPos + 1) % ctx.playOrder.length;
}

function nextPos<G>(turn: TurnDef<G> | undefined, args: HookArgs<G>): number | undefined {
  if (turn?.order) return turn.order.next(args);
  return (args.ctx.playOrderPos + 1) % args.ctx.playOrder.length;
}

function runHook<G>(hook: Hook<G> | undefined, state: MatchState<G>): G {
  if (!hook) return state.G;
  return hook({ G: state.G, ctx: state.ctx }) ?? state.G;
}

function endTurnStep<G>(
  game: GameDef<G>,
  state: MatchState<G>,
  step: { turn: number | undefined; arg?: unknown },
  next: Step[] | null,
): MatchState<G> {
  // 回合已经换过了（例如同一个 move 里先触发了阶段切换），这次结束请求作废
  if (step.turn !== state.ctx.turn) return state;
  const G = runHook(phaseOf(game, state.ctx.phase).turn?.onEnd, state);
  next?.push({ kind: 'updateTurn', currentPlayer: state.ctx.currentPlayer, arg: step.arg });
  return { ...state, G };
}

function endPhaseStep<G>(
  game: GameDef<G>,
  state: MatchState<G>,
  step: { turn: number | undefined; arg?: unknown },
  next: Step[] | null,
): MatchState<G> {
  let s = endTurnStep(game, state, { turn: step.turn }, null);
  const phase = s.ctx.phase;
  next?.push({ kind: 'updatePhase', from: phase, arg: step.arg });
  if (phase === null) return s;
  s = { ...s, G: runHook(phaseOf(game, phase).onEnd, s) };
  return { ...s, ctx: { ...s.ctx, phase: null } };
}

function runStep<G>(
  game: GameDef<G>,
  state: MatchState<G>,
  step: Step,
  next: Step[],
): MatchState<G> {
  switch (step.kind) {
    case 'onMove':
      return state;

    case 'startPhase': {
      next.push({ kind: 'startTurn' });
      return { ...state, G: runHook(phaseOf(game, state.ctx.phase).onBegin, state) };
    }

    case 'startTurn': {
      const turnDef = phaseOf(game, state.ctx.phase).turn;
      let ctx = state.ctx;
      if (step.currentPlayer !== undefined) {
        ctx = { ...ctx, currentPlayer: step.currentPlayer };
      } else {
        // 阶段刚开始：重置出牌顺序，由 order.first 决定先手
        const playOrder = defaultPlayOrder(ctx.numPlayers);
        const playOrderPos = firstPos(turnDef, { G: state.G, ctx });
        ctx = { ...ctx, playOrder, playOrderPos, currentPlayer: String(playOrder[playOrderPos]) };
      }
      ctx = { ...ctx, turn: ctx.turn + 1 };
      const s = { ...state, ctx };
      return { ...s, G: runHook(turnDef?.onBegin, s) };
    }

    case 'updatePhase': {
      const arg = step.arg as { next?: string } | undefined;
      let phase: string | null;
      if (arg && typeof arg === 'object' && arg.next !== undefined) {
        if (!(arg.next in game.phases)) return state;
        phase = arg.next;
      } else {
        phase = phaseOf(game, step.from).next ?? null;
      }
      next.push({ kind: 'startPhase' });
      return { ...state, ctx: { ...state.ctx, phase } };
    }

    case 'updateTurn': {
      const turnDef = phaseOf(game, state.ctx.phase).turn;
      const arg = step.arg as { next?: string } | true | undefined;
      let { playOrderPos } = state.ctx;
      let currentPlayer = step.currentPlayer;
      let endPhase = false;
      if (arg && arg !== true && arg.next !== undefined) {
        playOrderPos = state.ctx.playOrder.indexOf(arg.next);
        currentPlayer = arg.next;
      } else {
        const t = nextPos(turnDef, { G: state.G, ctx: state.ctx });
        if (t === undefined) {
          endPhase = true;
        } else {
          playOrderPos = t;
          currentPlayer = String(state.ctx.playOrder[t]);
        }
      }
      const ctx = { ...state.ctx, playOrderPos, currentPlayer };
      if (endPhase) next.push({ kind: 'endPhase', turn: ctx.turn });
      else next.push({ kind: 'startTurn', currentPlayer });
      return { ...state, ctx };
    }

    case 'endTurn':
      return endTurnStep(game, state, step, next);

    case 'endPhase':
      return endPhaseStep(game, state, step, next);

    case 'endGame': {
      // 终局不触发回合结束钩子（turn 传 undefined），只收尾当前阶段
      const s = endPhaseStep(game, state, { turn: undefined }, null);
      return { ...s, ctx: { ...s.ctx, gameover: step.arg === undefined ? true : step.arg } };
    }
  }
}

function process<G>(game: GameDef<G>, initial: MatchState<G>, steps: Step[]): MatchState<G> {
  let state = initial;
  const phasesEnded = new Set<string | null>();
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    if (step.kind === 'endPhase') {
      // 同一个阶段在一次处理里结束两次，说明阶段配置成环，直接停在无阶段状态
      if (phasesEnded.has(state.ctx.phase)) {
        return { ...state, ctx: { ...state.ctx, phase: null } };
      }
      phasesEnded.add(state.ctx.phase);
    }

    const next: Step[] = [];
    state = runStep(game, state, step, next);
    if (step.kind === 'endGame') break;

    const hookArgs = { G: state.G, ctx: state.ctx };
    const gameover = game.endIf?.(hookArgs);
    if (gameover) {
      steps.push({ kind: 'endGame', arg: gameover });
      continue;
    }
    const phaseOver = phaseOf(game, state.ctx.phase).endIf?.(hookArgs);
    if (phaseOver) {
      steps.push({ kind: 'endPhase', turn: state.ctx.turn, arg: phaseOver });
      continue;
    }
    steps.push(...next);
  }
  return state;
}

// ---------------------------------------------------------------------------
// 对外接口
// ---------------------------------------------------------------------------

export interface CreateMatchOptions {
  numPlayers: number;
  setupData?: Record<string, unknown>;
  /** 掷骰与洗牌的种子 */
  seed: string;
}

export function createMatch<G>(game: GameDef<G>, options: CreateMatchOptions): MatchState<G> {
  const { numPlayers, setupData, seed } = options;
  const startingPhase =
    Object.entries(game.phases).find(([, def]) => def.start === true)?.[0] ?? null;
  const ctx: RunnerCtx = {
    numPlayers,
    playOrder: defaultPlayOrder(numPlayers),
    playOrderPos: 0,
    currentPlayer: '0',
    phase: startingPhase,
    turn: 0,
  };
  const G = game.setup({ ctx }, setupData);
  return process(game, { G, ctx, rngState: hashSeed(seed), stateID: 0 }, [{ kind: 'startPhase' }]);
}

/** 从已保存的快照恢复。状态本身就是普通对象，这里只做类型上的确认 */
export function matchFromSnapshot<G>(snapshot: MatchState<G>): MatchState<G> {
  return snapshot;
}

export function applyMove<G>(
  game: GameDef<G>,
  state: MatchState<G>,
  request: MoveRequest,
  options: ApplyMoveOptions = {},
): MoveOutcome<G> {
  const { playerID, move, args } = request;
  const def = phaseOf(game, state.ctx.phase).moves?.[move];
  if (!def) return { ok: false, reason: 'unknown_move', state };
  if (state.ctx.gameover !== undefined) return { ok: false, reason: 'game_over', state };

  const isResponse = options.responseMoves?.has(move) === true;
  if (!isResponse && playerID !== state.ctx.currentPlayer) {
    return { ok: false, reason: 'not_active', state };
  }

  const seeded = options.random ? null : seededRandom(state.rngState);
  const random = options.random ?? seeded!.source;

  const pendingEvents: { turn: number; arg?: { next?: string } }[] = [];
  const moveCtx = isResponse ? { ...state.ctx, currentPlayer: playerID } : state.ctx;
  const fn = def.move as (a: MoveArgs<G>, ...rest: unknown[]) => G | typeof INVALID_MOVE | void;
  let result: G | typeof INVALID_MOVE | void;
  try {
    result = fn(
      {
        G: state.G,
        ctx: moveCtx,
        playerID,
        random,
        events: {
          endTurn: (arg) => {
            pendingEvents.push({ turn: state.ctx.turn, arg });
          },
          endPhase: () => {
            throw new Error('对局运行器尚未支持 events.endPhase()');
          },
        },
      },
      ...args,
    );
  } catch (error) {
    // 引擎的 move 对畸形参数没有统一防护，一个坏请求不能拖垮整局
    return { ok: false, reason: 'move_error', state, error };
  }
  if (result === INVALID_MOVE) return { ok: false, reason: 'invalid_move', state };

  let nextState: MatchState<G> = { ...state, G: result ?? state.G };
  nextState = process(game, nextState, [{ kind: 'onMove' }]);
  for (const ev of pendingEvents) {
    if (ev.turn !== nextState.ctx.turn) continue;
    nextState = process(game, nextState, [{ kind: 'endTurn', turn: ev.turn, arg: ev.arg }]);
  }

  return {
    ok: true,
    state: {
      ...nextState,
      rngState: seeded ? seeded.state() : state.rngState,
      stateID: state.stateID + 1,
    },
  };
}
