// 行动权表：回答「某个玩家此刻能不能发某个 move」
//
// 对局里大多数时候只有回合主人在行动，但打出【嫁接】【解封】、被 SHOOT 命中等情形下，
// 需要由别的玩家（被选中的目标、响应者、梦主……）来结算。这里把「谁 + 哪些 move」
// 集中成一张数据表，供引擎守卫与对局运行器共同判定，避免各处各写一套。
//
// 本模块只回答「谁能发」；move 发出之后的阶段、手牌等检查仍由各 move 自己负责。
// 对照：docs/manual/04-action-cards.md 嫁接、万有引力、解封；docs/manual/05-dream-thieves.md 白羊、天秤、处女

import type { SetupState } from '../setup.js';

/** 一条「正在等谁做什么」 */
export interface Awaiting {
  /** 触发它的待结算字段 */
  field: keyof SetupState;
  /** 可以行动的玩家 */
  actors: readonly string[];
  /** 这些玩家此刻可以发的 move */
  moves: readonly string[];
  /** 是否挡住其他所有行动 */
  blocking: boolean;
}

export type ActionDenial =
  | 'unknown_player'
  | 'awaiting_other'
  | 'not_turn_owner'
  | 'nothing_to_settle';

/** 表里的一行：待结算字段 → 此刻谁可以行动（不适用时返回 null）+ 可发的 move */
interface RightsRule {
  field: keyof SetupState;
  blocking: boolean;
  moves: readonly string[];
  actors: (G: SetupState) => readonly string[] | null;
}

/** 非回合主人在没有待结算时唯一可以发的 move */
const OFF_TURN_MOVES: readonly string[] = ['useAthenaWit'];

const RIGHTS_RULES: readonly RightsRule[] = [
  {
    field: 'pendingGraft',
    blocking: true,
    moves: ['resolveGraft'],
    actors: (G) => (G.pendingGraft ? [G.pendingGraft.playerID] : null),
  },
  {
    // 挑牌轮转仍由发动者代选，数据模型不变
    field: 'pendingGravity',
    blocking: true,
    moves: ['resolveGravityPick'],
    actors: (G) => (G.pendingGravity ? [G.pendingGravity.bonderPlayerID] : null),
  },
  {
    field: 'pendingShootMove',
    blocking: true,
    moves: ['resolveShootMove'],
    actors: (G) => (G.pendingShootMove ? [G.pendingShootMove.shooterID] : null),
  },
  {
    field: 'pendingSudgerRolls',
    blocking: true,
    moves: ['resolveSudgerPick'],
    actors: (G) => (G.pendingSudgerRolls ? [G.currentPlayerID] : null),
  },
  {
    // 天秤·平衡：目标先分牌
    field: 'pendingLibra',
    blocking: true,
    moves: ['resolveLibraSplit'],
    actors: (G) =>
      G.pendingLibra && !G.pendingLibra.split ? [G.pendingLibra.targetPlayerID] : null,
  },
  {
    // 天秤·平衡：分牌后由发动者选一份
    field: 'pendingLibra',
    blocking: true,
    moves: ['resolveLibraPick'],
    actors: (G) => (G.pendingLibra?.split ? [G.pendingLibra.bonderPlayerID] : null),
  },
  {
    // 还没响应的响应者；最后一个人放弃时引擎自己结算
    field: 'pendingResponseWindow',
    blocking: true,
    moves: ['passResponse', 'respondCancelUnlock'],
    actors: (G) => {
      const w = G.pendingResponseWindow;
      return w ? w.responders.filter((id) => !w.responded.includes(id)) : null;
    },
  },
  {
    // 解封与响应窗口成对出现；有窗口时谁都不能直接发 resolveUnlock
    field: 'pendingUnlock',
    blocking: true,
    moves: ['resolveUnlock'],
    actors: (G) =>
      G.pendingUnlock && !G.pendingResponseWindow ? [G.pendingUnlock.playerID] : null,
  },
  {
    field: 'pendingPeekDecision',
    blocking: true,
    moves: ['masterPeekBribeDecision'],
    actors: (G) => (G.pendingPeekDecision ? [G.dreamMasterID] : null),
  },
  {
    field: 'peekReveal',
    blocking: true,
    moves: ['peekerAcknowledge'],
    actors: (G) => (G.peekReveal ? [G.peekReveal.peekerID] : null),
  },
  {
    field: 'pendingVirgoChoice',
    blocking: true,
    moves: ['respondVirgoPerfect'],
    actors: (G) => (G.pendingVirgoChoice ? [G.pendingVirgoChoice.virgoID] : null),
  },
  {
    field: 'pendingShootResponse',
    blocking: true,
    moves: [
      'respondShootEvade',
      'respondShootPass',
      'respondTerroristDiscard',
      'respondTerroristAccept',
    ],
    actors: (G) => (G.pendingShootResponse ? [G.pendingShootResponse.targetPlayerID] : null),
  },
  {
    // 白羊·星尘：白羊在别人的回合也能发动 / 放弃，但不挡住回合主人
    field: 'pendingAriesChoice',
    blocking: false,
    moves: ['playAriesStardustActivate', 'playAriesStardustDiscard'],
    actors: (G) => (G.pendingAriesChoice ? [G.pendingAriesChoice.ariesID] : null),
  },
];

/** 「仅限待结算时」的 move：没有对应的待结算，任何人发它们都应被拒绝 */
export const RESTRICTED_MOVES: ReadonlySet<string> = new Set(
  RIGHTS_RULES.flatMap((rule) => rule.moves),
);

/** 当前所有的等待事项；没有待结算时返回空数组 */
export function listAwaiting(G: SetupState): Awaiting[] {
  const result: Awaiting[] = [];
  for (const rule of RIGHTS_RULES) {
    const actors = rule.actors(G);
    if (actors === null) continue;
    result.push({ field: rule.field, actors, moves: rule.moves, blocking: rule.blocking });
  }
  return result;
}

/** playerID 此刻能不能发 move。可以返回 null，否则返回拒绝的原因 */
export function denyAction(G: SetupState, playerID: string, move: string): ActionDenial | null {
  if (!G.playerOrder.includes(playerID)) return 'unknown_player';

  const awaiting = listAwaiting(G);
  const matches = (entry: Awaiting): boolean =>
    entry.actors.includes(playerID) && entry.moves.includes(move);

  // 有阻塞型待结算：只有匹配其中任意一条的「谁 + move」才放行
  if (awaiting.some((entry) => entry.blocking)) {
    return awaiting.some((entry) => entry.blocking && matches(entry)) ? null : 'awaiting_other';
  }

  // 不阻塞的待结算（白羊）：对应的人可以发它的 move
  if (awaiting.some(matches)) return null;

  if (playerID !== G.currentPlayerID) {
    return OFF_TURN_MOVES.includes(move) ? null : 'not_turn_owner';
  }
  return RESTRICTED_MOVES.has(move) ? 'nothing_to_settle' : null;
}
