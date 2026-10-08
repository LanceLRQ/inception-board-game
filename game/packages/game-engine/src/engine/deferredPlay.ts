// 出牌的「挂起与重放」：雅典娜·急智、土星·律令这类「牌打出之后、结算之前，先问某个人」的应答共用的机制。
//
// 做法：给一批出牌 move 套一层。出牌 move 到达时先照常试跑一遍确认它合法（不合法直接拒绝，不会先挂起再卡住），
// 满足触发条件就不结算，只把 move 名与实参记进某个待应答状态，等被问的人应答；
// 应答之后用出牌者的名义、原来的实参重放这次出牌（replayDeferredPlay）。
// 被挂起期间这张牌还没有被记录、没有离手，重放时才由里层的出牌记录统一记录。

import type { SetupState } from '../setup.js';
import { INVALID_MOVE } from './invalidMove.js';

/** 包装层看到的 move 上下文 */
export interface DeferContext {
  G: SetupState;
  ctx: { currentPlayer: string };
  playerID?: string;
  random?: unknown;
  events?: unknown;
}

export interface DeferrableMove {
  move: (...args: never[]) => unknown;
  client?: boolean;
}

type PlayFn = (context: DeferContext, ...rest: unknown[]) => unknown;

/** 试跑用的随机源：合法性不取决于骰值，试跑的结果只用来判断「会不会被拒绝」 */
const PROBE_RANDOM = {
  Die: () => 1,
  D6: () => 1,
  Shuffle: <T>(items: T[]): T[] => [...items],
};

/** 一次被挂起的出牌：谁、用哪个 move、什么实参 */
export interface SuspendedPlay {
  userID: string;
  move: string;
  args: unknown[];
}

/**
 * 给名单里的出牌 move 套上挂起包装，其余 move 原样保留。
 * detect 判断这次出牌是否要挂起（返回要带进待应答状态的信息，不挂起返回 null）；
 * suspend 在试跑确认出牌合法之后，返回挂起后的状态。
 * 包装后的函数保持原函数的参数个数；原函数挂在 unwrapped 属性上（供行动权闸门与测试工具读取形参）。
 */
export function suspendPlays<M extends Record<string, DeferrableMove>, T>(
  moves: M,
  names: ReadonlySet<string>,
  spec: {
    detect: (context: DeferContext, move: string, args: readonly unknown[]) => T | null;
    suspend: (found: T, play: SuspendedPlay, G: SetupState) => SetupState;
  },
): M {
  const out: Record<string, DeferrableMove> = {};
  for (const [name, def] of Object.entries(moves)) {
    if (!names.has(name)) {
      out[name] = def;
      continue;
    }
    const inner = def.move as unknown as PlayFn;
    const wrapped = (context: DeferContext, ...rest: unknown[]): unknown => {
      const found = spec.detect(context, name, rest);
      if (found === null) return inner(context, ...rest);
      // 试跑：出牌本身不合法就直接拒绝，不让被问的人白白应答一次
      const probe = inner({ ...context, random: PROBE_RANDOM }, ...rest);
      if (probe === INVALID_MOVE) return INVALID_MOVE;
      const suspended = spec.suspend(
        found,
        { userID: context.ctx.currentPlayer, move: name, args: rest },
        context.G,
      );
      return { ...suspended, moveCounter: context.G.moveCounter + 1 } satisfies SetupState;
    };
    Object.defineProperty(wrapped, 'length', { value: inner.length });
    Object.defineProperty(wrapped, 'unwrapped', {
      value: (inner as { unwrapped?: unknown }).unwrapped ?? inner,
    });
    out[name] = { ...def, move: wrapped as never };
  }
  return out as M;
}

/**
 * 以出牌者的名义、原来的实参重放被挂起的出牌。table 是「没有这一层挂起判定」的 move 表，
 * 所以重放不会再次挂起。重放不成立（例如出牌者的局面已经变了）：这次出牌作废、其余状态保留，
 * 对局继续，不会卡在挂起上。
 */
export function replayDeferredPlay(
  table: Record<string, DeferrableMove>,
  state: SetupState,
  ctx: { currentPlayer: string },
  play: SuspendedPlay,
  rest: { random?: unknown; events?: unknown },
): SetupState {
  const raw = table[play.move]?.move as unknown as PlayFn | undefined;
  const result = raw
    ? raw(
        {
          G: state,
          ctx: { ...ctx, currentPlayer: play.userID },
          playerID: play.userID,
          random: rest.random,
          events: rest.events,
        },
        ...play.args,
      )
    : INVALID_MOVE;
  if (result === INVALID_MOVE) return { ...state, moveCounter: state.moveCounter + 1 };
  return result as SetupState;
}
