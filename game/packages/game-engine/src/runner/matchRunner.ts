// 对局运行器
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

import { INVALID_MOVE } from '../engine/invalidMove.js';
import { createStream, deriveKey, labelNonce, shuffleWith } from '../prng.js';

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
  /** 随机数流的状态「64 位十六进制密钥:块计数器」，随状态一起保存，重启后可以接着掷；绝不对外 */
  rngState: string;
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
  /**
   * 行动权：发起者 playerID 此刻能不能发 move。
   * 没有提供时只有回合主人（ctx.currentPlayer）可以行动。
   * 发起者不在 ctx.playOrder 里时运行器直接拒绝，不会问这个钩子。
   */
  actionRights?(args: { G: G; ctx: RunnerCtx; playerID: string; move: string }): boolean;
  /**
   * 状态迁移：把快照里保存的旧版本 G 升到当前版本，版本过高时应抛错。
   * 没有提供时快照里的 G 原样使用。
   */
  migrate?(G: unknown): G;
  /**
   * 状态形状校验：快照迁移之后调用，返回问题描述表示状态不可用，返回 null 表示通过。
   * 只检查运行器和行动权判定依赖的基本形状，不检查规则层面的不变量。
   */
  validate?(G: G): string | null;
  /**
   * 视图：把 G 裁剪成某个观察者（玩家 id，或 null 表示旁观者）能看到的样子，用于发给客户端。
   * 返回值由钩子自己定义形状，运行器原样转交；没有提供时视图就是完整的 G。
   * 钩子必须逐字段显式构造返回值，不能把 G 原样带出去。
   */
  view?(args: { G: G; ctx: RunnerCtx; viewer: string | null }): unknown;
  /**
   * 事件描述：对比一步之前与之后的状态，给出这一步产生的领域事件（不含 stateID 与 index，由运行器补上）。
   * 必须是纯函数；抛异常说明实现有缺陷，运行器不吞。
   */
  describe?(args: {
    before: G;
    after: G;
    ctxBefore: RunnerCtx;
    ctxAfter: RunnerCtx;
    request: MoveRequest;
  }): Array<Omit<MatchEvent, 'stateID' | 'index'>>;
}

/** 一步 move 产生的事件 */
export interface MatchEvent {
  /** 产生它的那一步之后的状态版本号 */
  stateID: number;
  /** 同一步里的第几条，从 0 起 */
  index: number;
  kind: string;
  /** 触发者；系统产生的为 null */
  actor: string | null;
  /** 所有人都能看到的内容 */
  data: Record<string, unknown>;
  /** 只给点名玩家看的内容 */
  secret?: { to: readonly string[]; data: Record<string, unknown> };
}

/** 把事件裁成某个观察者能看到的样子：不在 secret.to 里的人拿不到 secret */
export function eventsFor(events: readonly MatchEvent[], viewer: string | null): MatchEvent[] {
  return events.map((ev) => {
    // data 与 secret 各拷贝一层，返回值不与入参共享引用
    const visible: MatchEvent = { ...ev, data: { ...ev.data } };
    if (ev.secret === undefined) {
      delete visible.secret;
      return visible;
    }
    if (typeof viewer === 'string' && ev.secret.to.includes(viewer)) {
      visible.secret = { to: [...ev.secret.to], data: { ...ev.secret.data } };
    } else {
      delete visible.secret;
    }
    return visible;
  });
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
  | { ok: true; state: MatchState<G>; events: MatchEvent[] }
  | { ok: false; reason: RejectReason; state: MatchState<G>; error?: unknown };

export interface ApplyMoveOptions {
  /** 覆盖随机源（测试用）。提供后不读也不写 state.rngState */
  random?: RandomSource;
}

// ---------------------------------------------------------------------------
// 随机数：ChaCha20 流。状态是「密钥:计数器」，密钥 256 位且从不对外，
// 每次取数用一个块，计数器随之前进；公开的骰值推不出密钥。
// ---------------------------------------------------------------------------

const RUNNER_STREAM_LABEL = 'runner';
const RNG_STATE_PATTERN = /^([0-9a-f]{64}):(\d{1,10})$/;

function keyToHex(key: Uint32Array): string {
  return Array.from(key, (w) => w.toString(16).padStart(8, '0')).join('');
}

function hexToKey(hex: string): Uint32Array {
  const key = new Uint32Array(8);
  for (let i = 0; i < 8; i++) key[i] = parseInt(hex.slice(i * 8, i * 8 + 8), 16);
  return key;
}

function formatRngState(key: Uint32Array, counter: number): string {
  return `${keyToHex(key)}:${counter}`;
}

/** 解析随机数状态；格式不对返回 null */
function parseRngState(value: unknown): { key: Uint32Array; counter: number } | null {
  if (typeof value !== 'string') return null;
  const m = RNG_STATE_PATTERN.exec(value);
  if (!m) return null;
  const counter = Number(m[2]);
  if (counter > 0xffffffff) return null;
  return { key: hexToKey(m[1]!), counter };
}

function seededRandom(rngState: string): { source: RandomSource; state(): string } {
  const parsed = parseRngState(rngState);
  if (!parsed) invalidSnapshot('rngState');
  const stream = createStream(parsed.key, labelNonce(RUNNER_STREAM_LABEL), parsed.counter);
  const next = stream.next;
  const Die = (sides: number): number => Math.floor(next() * sides) + 1;
  return {
    source: {
      Die,
      D6: () => Die(6),
      Shuffle: <T>(arr: T[]): T[] => shuffleWith(arr, next),
    },
    state: () => formatRngState(parsed.key, stream.counter()),
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
  return phase !== null && Object.hasOwn(game.phases, phase) ? game.phases[phase]! : EMPTY_PHASE;
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
        if (!Object.hasOwn(game.phases, arg.next)) return state;
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

const GAME_KEYS = new Set([
  'name',
  'minPlayers',
  'maxPlayers',
  'disableUndo',
  'setup',
  'phases',
  'endIf',
  'actionRights',
  'migrate',
  'validate',
  'view',
  'describe',
]);
const PHASE_KEYS = new Set(['start', 'next', 'endIf', 'onBegin', 'onEnd', 'turn', 'moves']);
const TURN_KEYS = new Set(['order', 'onBegin', 'onEnd']);
const ORDER_KEYS = new Set(['first', 'next']);
const MOVE_KEYS = new Set(['move', 'client']);

/**
 * 检查 Game 定义里有没有运行器不支持的配置，有就抛错并列出位置。
 * 运行器只实现了一部分流程特性；遇到不认识的配置必须报错，不能悄悄忽略。
 */
export function assertSupportedGame<G>(game: GameDef<G>): void {
  const problems: string[] = [];
  const check = (obj: object, allowed: Set<string>, where: string): void => {
    for (const key of Object.keys(obj)) {
      if (!allowed.has(key)) problems.push(`${where}.${key}`);
    }
  };

  check(game, GAME_KEYS, 'game');
  for (const [phaseName, phase] of Object.entries(game.phases)) {
    const at = `phases.${phaseName}`;
    check(phase, PHASE_KEYS, at);
    if (typeof phase.next === 'function') problems.push(`${at}.next`);
    if (phase.turn) {
      check(phase.turn, TURN_KEYS, `${at}.turn`);
      if (phase.turn.order) check(phase.turn.order, ORDER_KEYS, `${at}.turn.order`);
    }
    for (const [moveName, def] of Object.entries(phase.moves ?? {})) {
      if (typeof def !== 'object' || def === null) {
        problems.push(`${at}.moves.${moveName}`);
        continue;
      }
      check(def, MOVE_KEYS, `${at}.moves.${moveName}`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`对局运行器不支持以下配置：${problems.join('、')}`);
  }
}

export interface CreateMatchOptions {
  numPlayers: number;
  setupData?: Record<string, unknown>;
  /** 掷骰与洗牌的种子 */
  seed: string;
}

export function createMatch<G>(game: GameDef<G>, options: CreateMatchOptions): MatchState<G> {
  assertSupportedGame(game);
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
  return process(game, { G, ctx, rngState: formatRngState(deriveKey(seed), 0), stateID: 0 }, [
    { kind: 'startPhase' },
  ]);
}

function invalidSnapshot(what: string): never {
  throw new Error(`对局快照无效：${what}`);
}

/**
 * 从已保存的快照恢复。状态本身就是普通对象，这里只校验运行器自己依赖的字段，
 * 对局状态 G 的内部结构由引擎负责；传入的 Game 定义有 migrate 时，用它迁移 G，
 * 有 validate 时再用它检查迁移后的 G 的基本形状。
 */
export function matchFromSnapshot<G>(raw: unknown, game?: GameDef<G>): MatchState<G> {
  if (typeof raw !== 'object' || raw === null) invalidSnapshot('不是对象');
  const s = raw as Partial<MatchState<G>>;
  if (typeof s.G !== 'object' || s.G === null) invalidSnapshot('缺少 G');

  const ctx = s.ctx;
  if (typeof ctx !== 'object' || ctx === null) invalidSnapshot('缺少 ctx');
  if (!Number.isInteger(ctx.numPlayers) || ctx.numPlayers <= 0) invalidSnapshot('ctx.numPlayers');
  if (!Array.isArray(ctx.playOrder) || ctx.playOrder.some((p) => typeof p !== 'string')) {
    invalidSnapshot('ctx.playOrder');
  }
  if (
    !Number.isInteger(ctx.playOrderPos) ||
    ctx.playOrderPos < 0 ||
    ctx.playOrderPos >= ctx.playOrder.length
  ) {
    invalidSnapshot('ctx.playOrderPos');
  }
  if (typeof ctx.currentPlayer !== 'string' || !ctx.playOrder.includes(ctx.currentPlayer)) {
    invalidSnapshot('ctx.currentPlayer');
  }
  if (ctx.phase !== null && typeof ctx.phase !== 'string') invalidSnapshot('ctx.phase');
  if (!Number.isInteger(ctx.turn) || ctx.turn < 0) invalidSnapshot('ctx.turn');

  // 旧的本地快照里 rngState 是 32 位整数：转成新格式（以整数派生密钥、计数器 0）。
  // 这只为兼容旧快照，联机对局不会产生这种状态。
  let rngState: string;
  if (typeof s.rngState === 'number' && Number.isInteger(s.rngState)) {
    rngState = formatRngState(deriveKey(`legacy:${s.rngState}`), 0);
  } else if (parseRngState(s.rngState) !== null) {
    rngState = s.rngState as string;
  } else {
    invalidSnapshot('rngState');
  }
  if (!Number.isInteger(s.stateID) || (s.stateID as number) < 0) invalidSnapshot('stateID');
  const match = { ...s, rngState } as MatchState<G>;
  // 传入 Game 定义且它带迁移钩子时，把旧版本的 G 升到当前版本；迁移失败的错误原样抛出
  const migrated: MatchState<G> = game?.migrate ? { ...match, G: game.migrate(match.G) } : match;
  const problem = game?.validate?.(migrated.G);
  if (problem) invalidSnapshot(problem);
  return migrated;
}

export function applyMove<G>(
  game: GameDef<G>,
  state: MatchState<G>,
  request: MoveRequest,
  options: ApplyMoveOptions = {},
): MoveOutcome<G> {
  const { playerID, move, args } = request;
  const moves = phaseOf(game, state.ctx.phase).moves;
  // 按名字查表只认自有属性，避免 constructor、__proto__ 之类的名字命中原型链
  const def = moves !== undefined && Object.hasOwn(moves, move) ? moves[move] : undefined;
  if (!def) return { ok: false, reason: 'unknown_move', state };
  if (state.ctx.gameover !== undefined) return { ok: false, reason: 'game_over', state };

  if (!state.ctx.playOrder.includes(playerID)) return { ok: false, reason: 'not_active', state };
  let allowed: boolean;
  try {
    allowed = game.actionRights
      ? game.actionRights({ G: state.G, ctx: state.ctx, playerID, move })
      : playerID === state.ctx.currentPlayer;
  } catch (error) {
    // 状态形状不对时行动权判定也可能抛异常，与 move 本体抛异常同样处理
    return { ok: false, reason: 'move_error', state, error };
  }
  if (!allowed) return { ok: false, reason: 'not_active', state };

  const seeded = options.random ? null : seededRandom(state.rngState);
  const random = options.random ?? seeded!.source;

  const pendingEvents: { turn: number; arg?: { next?: string } }[] = [];
  const fn = def.move as (a: MoveArgs<G>, ...rest: unknown[]) => G | typeof INVALID_MOVE | void;
  let result: G | typeof INVALID_MOVE | void;
  try {
    result = fn(
      {
        G: state.G,
        ctx: state.ctx,
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

  const finalState: MatchState<G> = {
    ...nextState,
    rngState: seeded ? seeded.state() : state.rngState,
    stateID: state.stateID + 1,
  };
  const described =
    game.describe?.({
      before: state.G,
      after: finalState.G,
      ctxBefore: state.ctx,
      ctxAfter: finalState.ctx,
      request,
    }) ?? [];
  const events: MatchEvent[] = [
    {
      stateID: finalState.stateID,
      index: 0,
      kind: 'move',
      actor: playerID,
      data: { move },
      // 参数里可能有手牌之类的私密内容，只给发起者
      secret: { to: [playerID], data: { args: [...args] } },
    },
    ...described.map((ev, i) => ({ ...ev, stateID: finalState.stateID, index: i + 1 })),
  ];
  return { ok: true, state: finalState, events };
}

/** 发给某个观察者的对局状态：视图化后的 G，加上公开的 ctx 与版本号；永远不带随机数状态 */
export interface MatchViewState {
  G: unknown;
  ctx: RunnerCtx;
  stateID: number;
}

/**
 * 取某个观察者看到的对局状态。viewer 是玩家 id，或 null（旁观者）；
 * 其他取值（例如 undefined）一律按旁观者处理，宁可少给，不会因为传错参数而给出完整状态。
 * 没有视图钩子时 G 原样返回，所以只有带钩子的 Game 定义才适合对外发送。
 */
export function viewMatch<G>(
  game: GameDef<G>,
  state: MatchState<G>,
  viewer: string | null,
): MatchViewState {
  const who = typeof viewer === 'string' ? viewer : null;
  const ctx: RunnerCtx = {
    numPlayers: state.ctx.numPlayers,
    playOrder: state.ctx.playOrder.slice(),
    playOrderPos: state.ctx.playOrderPos,
    currentPlayer: state.ctx.currentPlayer,
    phase: state.ctx.phase,
    turn: state.ctx.turn,
  };
  if (state.ctx.gameover !== undefined) ctx.gameover = state.ctx.gameover;
  const G = game.view ? game.view({ G: state.G, ctx: state.ctx, viewer: who }) : state.G;
  return { G, ctx, stateID: state.stateID };
}

/** 一局对局的完整记录：起始参数加上每个被接受的请求，足以重放出同一个终局 */
export interface MatchRecord {
  numPlayers: number;
  setupData?: Record<string, unknown>;
  seed: string;
  moves: MoveRequest[];
}

/** 从头建局并依次执行记录里的请求；任何一步被拒绝就抛错，信息里带上第几步和原因 */
export function replayMatch<G>(game: GameDef<G>, record: MatchRecord): MatchState<G> {
  let state = createMatch(game, {
    numPlayers: record.numPlayers,
    setupData: record.setupData,
    seed: record.seed,
  });
  for (let i = 0; i < record.moves.length; i++) {
    const request = record.moves[i]!;
    const res = applyMove(game, state, request);
    if (!res.ok) {
      throw new Error(
        `重放失败：第 ${i + 1} 步 ${request.move}（玩家 ${request.playerID}）被拒绝：${res.reason}`,
      );
    }
    state = res.state;
  }
  return state;
}
