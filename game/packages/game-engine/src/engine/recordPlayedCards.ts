// 出牌记录包装层
//
// 「本回合打出过的牌」（playedCardsThisTurn / lastPlayedCardThisTurn）只在这里写入：
// 出牌 move 表（playCardKinds.ts 的 PLAY_MOVE_CARD_IDS）里的每个 move，被接受的那一步，
// 把实参里属于该 move 的那张牌记进去。各出牌 move 本体不再自己记，新增出牌 move 只要登记进表就自动被记录。
//
// 不经过出牌 move 的路径各自记录，不走这里：
//   意念判官·定罪、格林射线·缉捕 —— 它们不在出牌 move 表里，在自己的 move 里调用 recordCardPlayed；
//   金星·镜界的复制、哈雷·冲击 —— 不算打出牌，不记录。
// 记录时机是「出牌 move 被接受」：即使这一步只是挂起等待应答 / 选择（嫁接、解封的响应窗口、被双鱼闪避窗口挂起的 SHOOT），也已经算打出。
// 对照：docs/manual/05-dream-thieves.md 水瓶（本回合打出的牌）

import { recordCardPlayed } from '../stateOps.js';
import type { SetupState } from '../setup.js';
import { INVALID_MOVE } from './invalidMove.js';
import { PLAY_MOVE_CARD_IDS } from './playCardKinds.js';

interface RecordableMove {
  move: (...args: never[]) => unknown;
}

/**
 * 给出牌 move 套上出牌记录：调用原 move，结果不是非法时，从实参里找出属于该 move 的那张牌并记录。
 * 表里没有的 move 原样保留；包装后的函数保持原函数的参数个数（对局定义的结构测试按它钉住每个 move），
 * 原函数挂在 unwrapped 属性上（供行动权闸门与测试工具读取形参）。
 * 应套在行动权闸门之内：withSettleGate(recordPlayedCards({...}))，这样被闸门拒绝的出牌不会被记录。
 */
export function recordPlayedCards<M extends Record<string, RecordableMove>>(
  moves: M,
  cardTable: Readonly<Record<string, readonly string[]>> = PLAY_MOVE_CARD_IDS,
): M {
  const out: Record<string, RecordableMove> = {};
  for (const [name, def] of Object.entries(moves)) {
    const allowed = cardTable[name];
    if (!allowed) {
      out[name] = def;
      continue;
    }
    const original = def.move as (context: unknown, ...rest: unknown[]) => unknown;
    const recorded = (context: unknown, ...rest: unknown[]): unknown => {
      const result = original(context, ...rest);
      if (result === INVALID_MOVE || typeof result !== 'object' || result === null) return result;
      const cardId = rest.find(
        (arg): arg is string => typeof arg === 'string' && allowed.includes(arg),
      );
      if (cardId === undefined) return result;
      return recordCardPlayed(result as SetupState, cardId);
    };
    Object.defineProperty(recorded, 'length', { value: original.length });
    Object.defineProperty(recorded, 'unwrapped', { value: original });
    out[name] = { ...def, move: recorded as never };
  }
  return out as M;
}
