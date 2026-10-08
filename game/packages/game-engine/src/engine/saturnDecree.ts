// 土星·领地 · 律令：别人打出行动牌后、结算之前，给梦主一个可放过的应答——弃 1 张同名手牌抵消它
//
// 规则原文：「律令 - 你可以弃掉1张手牌抵消1张同名牌的效果，并从牌库顶抽1张牌。」
//   详述：「【律令】是先抵消了同名牌效果，然后再抽牌。」
// 对照：docs/manual/06-dream-master.md:168-173 土星·领地；同名牌见 docs/manual/04-action-cards.md:165
//
// 口径：
//   - 梦主是土星（且存活）时，其他玩家在出牌阶段打出的每一张行动牌都先问梦主，不论梦主手里有没有同名牌：
//     窗口的有无不能泄露梦主的手牌。没有同名牌时梦主只能放过。
//   - 只覆盖出牌 move 表（playCardKinds.ts 的 PLAY_MOVE_CARD_IDS）里、由回合主人在自己的出牌阶段发起的出牌；
//     梦主自己的牌不问；技能「视为」使用的牌（哈雷·冲击、要塞·冷酷、皇城世界观等）没有实体牌，不问；
//     回合外打出的牌（例如别人解封时用来抵消的另一张解封）不问。
//   - 不限次数。被抵消的牌作废（进弃牌堆、效果不结算），但算本回合打出过；每回合次数类的限制（如解封）只在效果真正结算时才消耗。
//
// 做法同雅典娜·急智（机制见 deferredPlay.ts）：出牌 move 到达时先试跑确认合法，再把 move 名与实参记进 pendingSaturnDecree 挂起；
// 梦主放过则以出牌者的名义重放这次出牌，抵消则这张牌作废。
// 与雅典娜·急智的先后：律令窗口在前，被抵消的牌不再问雅典娜；本层套在雅典娜那一层之外，所以放过之后重放时才会轮到雅典娜。
// 与【解封】响应窗口的先后：律令窗口在前，放过之后才进入原来的解封响应窗口。

import type { CardID } from '@icgame/shared';
import type { SetupState } from '../setup.js';
import {
  replayDeferredPlay,
  suspendPlays,
  type DeferContext,
  type DeferrableMove,
} from './deferredPlay.js';
import { INVALID_MOVE } from './invalidMove.js';
import { PLAY_MOVE_CARD_IDS, playedCardOf } from './playCardKinds.js';
import { applySaturnDecree } from './skills.js';

/** 土星·领地的梦主角色 id */
const SATURN_MASTER_CHARACTER = 'dm_saturn_territory';

/** 会开律令窗口的出牌 move：就是出牌记录表里的全部出牌 move（出牌者是梦主时不会触发） */
export const SATURN_DECREE_TRIGGER_MOVES: readonly string[] = Object.keys(PLAY_MOVE_CARD_IDS);

/**
 * 此刻这次出牌要不要问梦主：要则返回梦主的座位与被打出的牌，不要返回 null。
 * 条件：对局阶段；梦主是存活的土星；出牌者是回合主人且不是梦主（背叛者对外仍是盗梦者，照样要问）；
 * 出牌 move 在表里，且实参里认得出被打出的牌。出牌是否合法由包装层试跑判定。
 */
export function findSaturnDecreeMaster(
  G: SetupState,
  userID: string,
  move: string,
  args: readonly unknown[],
): { masterID: string; cardId: CardID } | null {
  if (G.phase !== 'playing') return null;
  const master = G.players[G.dreamMasterID];
  if (!master || !master.isAlive || master.characterId !== SATURN_MASTER_CHARACTER) return null;
  if (userID === G.dreamMasterID || userID !== G.currentPlayerID) return null;
  const cardId = playedCardOf(move, args);
  if (cardId === undefined) return null;
  return { masterID: G.dreamMasterID, cardId };
}

type SaturnDecreeRespond = (
  context: DeferContext,
  cardId: CardID | null,
) => SetupState | typeof INVALID_MOVE;

/**
 * 给出牌 move 套上律令窗口，并追加梦主的应答 move respondSaturnDecree。
 * 应套在雅典娜那一层之外、行动权闸门之内：
 * withSettleGate(withSaturnDecree(withAthenaWit(recordPlayedCards({...}))))。
 */
export function withSaturnDecree<M extends Record<string, DeferrableMove>>(
  moves: M,
): M & { respondSaturnDecree: { move: SaturnDecreeRespond; client: false } } {
  const out = suspendPlays(moves, new Set(SATURN_DECREE_TRIGGER_MOVES), {
    detect: (context, move, args) =>
      findSaturnDecreeMaster(context.G, context.ctx.currentPlayer, move, args),
    suspend: (found, play, G) => ({
      ...G,
      pendingSaturnDecree: {
        masterID: found.masterID,
        userID: play.userID,
        cardId: found.cardId,
        move: play.move,
        args: play.args,
      },
    }),
  });

  // 梦主的应答：弃 1 张同名手牌抵消（传那张牌的 id），或放过（null）。
  // 形参写成解构形式，测试工具按这个写法读取 cardId 这个形参名
  const respond = (
    { G, ctx, random, events }: DeferContext,
    cardId: CardID | null,
  ): SetupState | typeof INVALID_MOVE => {
    const pending = G.pendingSaturnDecree;
    if (G.phase !== 'playing' || !pending) return INVALID_MOVE;
    if (ctx.currentPlayer !== pending.masterID) return INVALID_MOVE;
    const cleared: SetupState = { ...G, pendingSaturnDecree: null };
    if (cardId === null) {
      // 放过：以出牌者的名义重放；重放走里层 move，不会再次问梦主
      return replayDeferredPlay(moves, cleared, ctx, pending, { random, events });
    }
    const countered = applySaturnDecree(cleared, pending.masterID, cardId, {
      userID: pending.userID,
      cardId: pending.cardId,
    });
    if (countered === null) return INVALID_MOVE;
    return { ...countered, moveCounter: countered.moveCounter + 1 };
  };
  return { ...out, respondSaturnDecree: { move: respond, client: false } } as unknown as M & {
    respondSaturnDecree: { move: SaturnDecreeRespond; client: false };
  };
}
