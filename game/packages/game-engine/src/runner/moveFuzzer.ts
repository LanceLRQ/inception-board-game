// 随机 move 生成器（测试辅助）
// 用途：给运行器的差分测试和压力测试提供「大概率合法」的 move 序列。
// 做法：从 move 函数源码里读出形参名，按名字猜参数类型；再在运行器上逐个试跑，
//       留下被接受的候选。试跑用独立的随机源，不影响正式对局的随机序列。

import type { SetupState } from '../setup.js';
import { listAwaiting, OFF_TURN_MOVES } from '../engine/actionRights.js';
import { applyMove, type GameDef, type MatchState, type RandomSource } from './matchRunner.js';

export interface MoveCandidate {
  playerID: string;
  move: string;
  args: unknown[];
}

/** 小型确定性随机数发生器（mulberry32），只给测试用 */
export function makeTestRng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 由 0..1 随机函数构造一个引擎可用的随机源 */
export function makeRandomSource(next: () => number): RandomSource {
  const Die = (sides: number): number => Math.floor(next() * sides) + 1;
  return {
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
  };
}

const paramNameCache = new WeakMap<object, string[]>();

/** 读出 move 函数第一个解构参数之后的形参名 */
export function moveParamNames(fn: (...args: never[]) => unknown): string[] {
  // 套过待结算闸门的 move，形参要从原函数上读
  const target = (fn as { unwrapped?: (...args: never[]) => unknown }).unwrapped ?? fn;
  const cached = paramNameCache.get(target);
  if (cached) return cached;
  const src = Function.prototype.toString.call(target);
  const open = src.indexOf('(');
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const inside = src.slice(open + 1, end);
  const closeBrace = inside.indexOf('}');
  const rest = closeBrace >= 0 ? inside.slice(closeBrace + 1) : '';
  const names = rest
    .split(',')
    .map((s) => s.trim().split(/[\s=:]/)[0] ?? '')
    .filter((s) => /^[A-Za-z_]\w*$/.test(s));
  paramNameCache.set(target, names);
  return names;
}

function pick<T>(rnd: () => number, arr: readonly T[]): T | undefined {
  return arr.length === 0 ? undefined : arr[Math.floor(rnd() * arr.length)];
}

function subset<T>(rnd: () => number, arr: readonly T[], max: number): T[] {
  const n = Math.min(arr.length, Math.floor(rnd() * (max + 1)));
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!);
  }
  return out;
}

function sample<T>(rnd: () => number, arr: readonly T[], count: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!);
  }
  return out;
}

/** 收集所有「等待结算」字段里出现过的字符串，结算类 move 的参数多半取自这里 */
function pendingStrings(G: SetupState): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  for (const [key, value] of Object.entries(G)) {
    if (key.startsWith('pending') && value) walk(value);
  }
  return out;
}

/** 按形参名猜一个参数值 */
function fuzzArg(name: string, G: SetupState, actor: string, rnd: () => number): unknown {
  const hand = G.players[actor]?.hand ?? [];
  const players = G.playerOrder;
  const pending = pendingStrings(G);
  const pendingPlayers = pending.filter((v) => players.includes(v));
  const n = name.toLowerCase();

  // 万有引力挑选：牌必须来自待挑选的牌池
  if (n === 'cardid' && G.pendingGravity && G.pendingGravity.pool.length > 0 && rnd() < 0.8) {
    return pick(rnd, G.pendingGravity.pool);
  }
  // 天秤分牌：两堆合起来必须正好是被要求分牌那名玩家的手牌，这里按前后两半切开
  const libra = G.pendingLibra;
  if (libra && libra.split === null && /^pile[12]$/.test(n)) {
    const targetHand = G.players[libra.targetPlayerID]?.hand ?? [];
    const cut = Math.ceil(targetHand.length / 2);
    return n === 'pile1' ? targetHand.slice(0, cut) : targetHand.slice(cut);
  }
  // 嫁接结算要求恰好退回 2 张
  if (n === 'cardstoreturn' && rnd() < 0.7) return sample(rnd, hand, 2);
  if (/(cardids|handids|discardids|returncards|cardstoreturn|^pile\d$)/.test(n)) {
    return subset(rnd, hand, hand.length);
  }
  if (/(targetids|reviveids)/.test(n)) return subset(rnd, players, 2);
  if (n === 'targetorlayer') return rnd() < 0.5 ? pick(rnd, players) : Math.floor(rnd() * 5);
  if (/(card|decree|pickfromdiscard)/.test(n)) {
    if (n === 'decreeid' && rnd() < 0.7) return undefined;
    const r = rnd();
    if (r < 0.6) return pick(rnd, hand);
    if (r < 0.85 && pending.length > 0) return pick(rnd, pending);
    return pick(rnd, G.deck.discardPile) ?? pick(rnd, hand);
  }
  // 注意 targetPlayerID 这类名字里也含有 layer，玩家 ID 必须留给下面的分支
  if (/layer/.test(n) && !/playerid/.test(n)) return Math.floor(rnd() * 6);
  if (/(idx|index)/.test(n)) return Math.floor(rnd() * 6);
  if (/(playerid|targetid|reviveid|thiefid)/.test(n)) {
    if (n === 'reviveid' && rnd() < 0.3) return null;
    if (rnd() < 0.3 && pendingPlayers.length > 0) return pick(rnd, pendingPlayers);
    return pick(rnd, players);
  }
  if (n === 'delta') return rnd() < 0.5 ? -1 : 1;
  if (n === 'direction') return rnd() < 0.5 ? 'increase' : 'decrease';
  if (n === 'mode') return rnd() < 0.5 ? 'shoot' : 'transit';
  if (n === 'pick') return pick(rnd, ['A', 'B', 'pile1', 'pile2']);
  if (n === 'choice') return 'skip';
  if (n === 'deal' || n === 'preventmove') return rnd() < 0.5;
  return undefined;
}

/** 当前阶段可用的 move 名 */
function currentMoves(
  game: GameDef<SetupState>,
  phase: string | null,
): Record<string, { move: (...args: never[]) => unknown }> {
  if (phase === null) return {};
  return (game.phases[phase]?.moves ?? {}) as Record<
    string,
    { move: (...args: never[]) => unknown }
  >;
}

/** 给指定 move 生成一组猜测参数 */
export function fuzzCandidate(
  game: GameDef<SetupState>,
  state: MatchState<SetupState>,
  move: string,
  playerID: string,
  rnd: () => number,
): MoveCandidate {
  const def = currentMoves(game, state.ctx.phase)[move];
  const names = def ? moveParamNames(def.move) : [];
  const args = names.map((name) => fuzzArg(name, state.G, playerID, rnd));
  while (args.length > 0 && args[args.length - 1] === undefined) args.pop();
  return { playerID, move, args };
}

/** 推进回合用的 move，挑选时降低权重，让行动牌和技能有机会被打出 */
const PROGRESS_MOVES = new Set(['endActionPhase', 'skipDiscard', 'doDiscard', 'skipDraw']);

/** 结算 / 响应类 move 的参数更难猜中，多试几次 */
const SETTLE_MOVE = /^(resolve|respond|pass|peeker|masterPeek)/;

export interface PickLegalMoveOptions {
  attemptsPerMove?: number;
  /** 有可结算事项时是否优先结算。关掉它可以模拟不守规矩的客户端 */
  preferSettle?: boolean;
  /**
   * 只替回合主人试 move。对照用的 boardgame.io 归约器只接受回合主人，差分测试要开这个。
   * 默认 false：替此刻所有有行动权的玩家（回合主人加上各待结算事项的行动者）试。
   */
  ownerOnly?: boolean;
  /** 只替名单里的玩家试 move（与上面的候选取交集） */
  actors?: readonly string[];
}

/** 此刻值得试 move 的玩家，分成两类 */
interface ActorSet {
  /** 回合主人，加上对局阶段各待结算事项的行动者：什么 move 都值得试 */
  holders: string[];
  /** 其余玩家：只值得试回合外可发的 move（没有阻塞型待结算时才有） */
  bystanders: string[];
}

function candidateActors(
  state: MatchState<SetupState>,
  ownerOnly: boolean,
  only?: readonly string[],
): ActorSet {
  const holders = new Set<string>([state.ctx.currentPlayer]);
  const bystanders = new Set<string>();
  if (!ownerOnly && state.ctx.phase === 'playing') {
    const awaiting = listAwaiting(state.G);
    for (const entry of awaiting) entry.actors.forEach((id) => holders.add(id));
    if (!awaiting.some((entry) => entry.blocking)) {
      for (const id of state.G.playerOrder) if (!holders.has(id)) bystanders.add(id);
    }
  }
  const keep = (id: string): boolean => only === undefined || only.includes(id);
  return { holders: [...holders].filter(keep), bystanders: [...bystanders].filter(keep) };
}

/**
 * 在运行器上试跑，返回一个会被接受的 move；找不到返回 null。
 * 试跑是纯函数调用，不改动传入的 state。
 */
export function pickLegalMove(
  game: GameDef<SetupState>,
  state: MatchState<SetupState>,
  rnd: () => number,
  options: PickLegalMoveOptions = {},
): MoveCandidate | null {
  const { attemptsPerMove = 2, preferSettle = true, ownerOnly = false, actors } = options;
  const probeRandom = makeRandomSource(makeTestRng(Math.floor(rnd() * 2 ** 31)));
  const names = Object.keys(currentMoves(game, state.ctx.phase));
  const accepted: MoveCandidate[] = [];
  const { holders, bystanders } = candidateActors(state, ownerOnly, actors);
  for (const actor of [...holders, ...bystanders]) {
    const isBystander = !holders.includes(actor);
    for (const move of names) {
      if (isBystander && !OFF_TURN_MOVES.includes(move)) continue;
      // 没有行动权的组合不必试，试了也是被拒
      if (game.actionRights?.({ G: state.G, ctx: state.ctx, playerID: actor, move }) === false) {
        continue;
      }
      const hard = SETTLE_MOVE.test(move) || move === 'doDiscard';
      const attempts = hard ? attemptsPerMove * 8 : attemptsPerMove;
      for (let i = 0; i < attempts; i++) {
        const cand = fuzzCandidate(game, state, move, actor, rnd);
        const res = applyMove(game, state, cand, { random: probeRandom });
        if (res.ok) {
          accepted.push(cand);
          break;
        }
      }
    }
  }
  if (accepted.length === 0) return null;
  // 有待结算的事项就先结算，和界面强制弹窗的行为一致；否则继续出牌会把对局卡死
  const settle = accepted.filter((c) => SETTLE_MOVE.test(c.move));
  if (preferSettle && settle.length > 0) return pick(rnd, settle)!;
  const actions = accepted.filter((c) => !PROGRESS_MOVES.has(c.move));
  const progress = accepted.filter((c) => PROGRESS_MOVES.has(c.move));
  if (actions.length > 0 && (progress.length === 0 || rnd() < 0.6)) return pick(rnd, actions)!;
  return pick(rnd, progress.length > 0 ? progress : accepted)!;
}

/** 生成一个大概率非法的 move（随机玩家、随机 move、随机参数），用来比较拒绝行为 */
export function pickNoiseMove(
  game: GameDef<SetupState>,
  state: MatchState<SetupState>,
  rnd: () => number,
): MoveCandidate {
  const allNames = Object.values(game.phases).flatMap((p) => Object.keys(p.moves ?? {}));
  const move = rnd() < 0.05 ? 'noSuchMove' : (pick(rnd, allNames) ?? 'noSuchMove');
  const playerID = rnd() < 0.5 ? state.ctx.currentPlayer : (pick(rnd, state.ctx.playOrder) ?? '0');
  return fuzzCandidate(game, state, move, playerID, rnd);
}
