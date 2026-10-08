// 雅典娜·急智：另一同层盗梦者对雅典娜使用行动牌时，在该牌结算前给雅典娜一个可放弃的应答
//
// 规则原文：「每当另一同层盗梦者对你使用行动牌时，你可以先从弃牌堆选取1张牌收入手牌。回合限1次」
//   详述：「在每个不同玩家的回合都能使用一次」「使用时机仅限同层的盗梦者，而且是在使用时候进行检定」
//        「玩家使用【念力牵引】，若不在同一层，则无法触发【急智】技能」
// 对照：docs/manual/05-dream-thieves.md:160-170 雅典娜
//
// 做法：给「以玩家为目标的出牌 move」套一层挂起（机制见 deferredPlay.ts）：满足触发条件就不结算，
// 只把 move 名与实参记进 pendingAthenaWit，等雅典娜应答；雅典娜选牌（或放弃）之后，用出牌者的名义、
// 原来的实参重放这次出牌。这样「先」收入手牌发生在该牌的任何效果之前。
// 与土星·律令同时在场时，律令窗口在前（土星·律令的包装层套在这一层之外）：梦主抵消了这张牌，就不再问雅典娜。
//
// 覆盖的出牌 move（都要打出一张真实的行动牌，并且目标是一名玩家）：
//   SHOOT 类：playShoot、playShootKing、playShootArmor、playShootBurst、playShootDreamTransit（选 SHOOT 方式时）、
//             playShootSudger（意念判官·定罪，打出的是一张真实的 SHOOT 类牌）
//   其他：    playKick、playTelekinesis、playShift、playResonance、playGravity（目标名单里有她）
// 不覆盖：不打出牌的「视为 SHOOT」（哈雷·冲击、要塞·冷酷、皇城世界观）、格林射线·缉捕（把牌当代价弃掉再执行效果）、
//         露娜·月蚀 / 雅典娜·惊叹等技能击杀、梦主的梦境窥视②（出牌者是梦主，本来就不满足「盗梦者」）。

import type { CardID } from '@icgame/shared';
import type { SetupState } from '../setup.js';
import {
  replayDeferredPlay,
  suspendPlays,
  type DeferContext,
  type DeferrableMove,
} from './deferredPlay.js';
import { INVALID_MOVE } from './invalidMove.js';
import { applyAthenaWitPick, athenaWitUsedInTurn } from './skills.js';

/** 一个出牌 move 里，被打出的牌与目标玩家分别取自第几个实参 */
interface TargetSpec {
  card: number;
  /** 目标玩家：实参取值函数，返回所有被指为目标的玩家 */
  targets: (args: readonly unknown[]) => string[];
}

const one =
  (index: number) =>
  (args: readonly unknown[]): string[] =>
    typeof args[index] === 'string' ? [args[index] as string] : [];

/** 以玩家为目标的出牌 move → 牌与目标在实参里的位置（与 engine/moveArgs.ts 的形状表一致） */
const TARGETED_PLAY_MOVES: Readonly<Record<string, TargetSpec>> = {
  playShoot: { card: 1, targets: one(0) },
  playShootKing: { card: 1, targets: one(0) },
  playShootArmor: { card: 1, targets: one(0) },
  playShootBurst: { card: 1, targets: one(0) },
  // 梦境穿梭剂 / SHOOT 二选一：选 SHOOT 方式时第三个实参是目标玩家，选穿梭方式时是目标层
  playShootDreamTransit: {
    card: 0,
    targets: (args) => (args[1] === 'shoot' ? one(2)(args) : []),
  },
  playShootSudger: { card: 1, targets: one(0) },
  playKick: { card: 0, targets: one(1) },
  playTelekinesis: { card: 0, targets: one(1) },
  playShift: { card: 0, targets: one(1) },
  playResonance: { card: 0, targets: one(1) },
  playGravity: {
    card: 0,
    targets: (args) =>
      Array.isArray(args[1]) ? args[1].filter((id): id is string => typeof id === 'string') : [],
  },
};

/** 套了急智判定的出牌 move 名单（供测试与文档核对覆盖范围） */
export const ATHENA_WIT_TRIGGER_MOVES: readonly string[] = Object.keys(TARGETED_PLAY_MOVES);

/**
 * 发这次出牌的人此刻能让哪位雅典娜应答：返回雅典娜的座位；不触发返回 null。
 * 条件（使用时检定）：出牌者是盗梦者（按公开信息：不是梦主）、存活、与雅典娜不是同一个人且同在梦境层（不是迷失层）；
 * 雅典娜存活、被指为目标；弃牌堆里有牌可选；雅典娜在这个回合里还没用过急智。
 */
export function findAthenaWitResponder(
  G: SetupState,
  userID: string,
  move: string,
  args: readonly unknown[],
): { athenaID: string; cardId: CardID } | null {
  const spec = TARGETED_PLAY_MOVES[move];
  if (!spec) return null;
  if (G.phase !== 'playing' || userID === G.dreamMasterID) return null;
  const user = G.players[userID];
  if (!user || !user.isAlive || user.currentLayer < 1) return null;
  if (G.deck.discardPile.length === 0) return null;
  const cardId = args[spec.card];
  if (typeof cardId !== 'string') return null;
  for (const targetID of spec.targets(args)) {
    if (targetID === userID) continue;
    const athena = G.players[targetID];
    if (!athena || !athena.isAlive || athena.characterId !== 'thief_athena') continue;
    if (athena.currentLayer !== user.currentLayer) continue;
    if (athenaWitUsedInTurn(athena, G.turnNumber)) continue;
    return { athenaID: targetID, cardId: cardId as CardID };
  }
  return null;
}

export type WitContext = DeferContext;

type AthenaWitRespond = (
  context: WitContext,
  cardId: CardID | null,
) => SetupState | typeof INVALID_MOVE;

/**
 * 给出牌 move 套上急智判定，并追加雅典娜的应答 move respondAthenaWit。
 * 应套在出牌记录包装层之外、行动权闸门之内：withSettleGate(withAthenaWit(recordPlayedCards({...})))，
 * 这样挂起时这张牌还没有被记录、没有离手，重放时才由里层的出牌记录统一记录。
 */
export function withAthenaWit<M extends Record<string, DeferrableMove>>(
  moves: M,
): M & { respondAthenaWit: { move: AthenaWitRespond; client: false } } {
  const out = suspendPlays(moves, new Set(ATHENA_WIT_TRIGGER_MOVES), {
    detect: (context, move, args) =>
      findAthenaWitResponder(context.G, context.ctx.currentPlayer, move, args),
    suspend: (found, play, G) => ({
      ...G,
      pendingAthenaWit: {
        athenaID: found.athenaID,
        userID: play.userID,
        cardId: found.cardId,
        move: play.move,
        args: play.args,
      },
    }),
  });

  // 雅典娜的应答：选弃牌堆里的 1 张收入手牌，或放弃（null）；随后以出牌者的名义重放被挂起的出牌。
  // 形参写成解构形式，测试工具按这个写法读取 cardId 这个形参名
  const respond = (
    { G, ctx, random, events }: WitContext,
    cardId: CardID | null,
  ): SetupState | typeof INVALID_MOVE => {
    const pending = G.pendingAthenaWit;
    if (G.phase !== 'playing' || !pending) return INVALID_MOVE;
    if (ctx.currentPlayer !== pending.athenaID) return INVALID_MOVE;
    let state: SetupState = { ...G, pendingAthenaWit: null };
    if (cardId !== null) {
      const picked = applyAthenaWitPick(state, pending.athenaID, cardId);
      if (picked === null) return INVALID_MOVE;
      state = picked;
    }
    // 重放走的是没有急智判定的里层 move，所以不会再次挂起
    return replayDeferredPlay(moves, state, ctx, pending, { random, events });
  };
  return { ...out, respondAthenaWit: { move: respond, client: false } } as unknown as M & {
    respondAthenaWit: { move: AthenaWitRespond; client: false };
  };
}
