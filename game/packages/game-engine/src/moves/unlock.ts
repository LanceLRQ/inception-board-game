// 解封与响应窗口：打出解封、响应者抵消或放行、兜底结算。

import type { CardID } from '@icgame/shared';
import {
  openResponseWindow,
  passOnResponse,
  respondToWindow,
} from '../engine/abilities/response-chain.js';
import { RESPONSE_WINDOW_TIMEOUT_MS } from '../config.js';
import { INVALID_MOVE } from '../engine/invalidMove.js';
import { isCardForPlayMove } from '../engine/playCardKinds.js';
import {
  REVIVED_SELF_THIS_TURN_KEY,
  canMakeSuccessfulUnlock,
  isDreamMaster,
} from '../engine/skills.js';
import type { SetupState } from '../setup.js';
import { applyUnlockCancel, discardCard } from '../stateOps.js';
import { type MoveCtx, guardTurnPhase } from './common.js';
import { resolveUnlockFull } from './settlement.js';

export const unlockMoves = {
  // 打出解封 - 盗梦者解锁同层心锁（效果①）
  // 对照：docs/manual/04-action-cards.md 解封
  // playUnlock 成功后即刻打开响应窗口（对照：§解封 使用时机②
  //   "任意玩家使用【解封】的效果①时"），允许其他玩家出效果②抵消
  playUnlock: {
    move: ({ G, ctx, random }: MoveCtx, cardId: CardID) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (!isCardForPlayMove('playUnlock', cardId)) return INVALID_MOVE;
      const player = G.players[ctx.currentPlayer];
      if (!player || !player.isAlive) return INVALID_MOVE;
      // 梦主不能使用效果①；背叛者对外是盗梦者，可以使用
      if (isDreamMaster(G, ctx.currentPlayer)) return INVALID_MOVE;
      if (!player.hand.includes(cardId)) return INVALID_MOVE;
      // 自己复活自己的当回合不能用效果①（效果②走 respondCancelUnlock，不受限）
      // 对照：docs/manual/04-action-cards.md 解封 效果①
      if ((player.skillUsedThisTurn[REVIVED_SELF_THIS_TURN_KEY] ?? 0) > 0) return INVALID_MOVE;
      // 摩羯·节奏 / 水瓶·同流：被动豁免解封次数限制
      // 黑洞·DM 世界观：上限提升至 2
      // 技能减少心锁也占用同一份次数（R-23）
      if (!canMakeSuccessfulUnlock(G, player)) return INVALID_MOVE;

      const currentLayer = player.currentLayer;
      const layerState = G.layers[currentLayer];
      if (!layerState || layerState.heartLockValue <= 0) return INVALID_MOVE;

      let s = discardCard(G, ctx.currentPlayer, cardId);
      s = {
        ...s,
        pendingUnlock: {
          playerID: ctx.currentPlayer,
          layer: currentLayer,
          cardId,
        },
      };
      // 打开响应窗口：responders = 其他存活玩家（含梦主）
      const responders = s.playerOrder.filter((id) => {
        const p = s.players[id];
        return !!p && p.isAlive && id !== ctx.currentPlayer;
      });
      if (responders.length > 0) {
        s = openResponseWindow(s, {
          sourceAbilityID: 'action_unlock_effect_1',
          sourceType: 'unlock',
          responders,
          timeoutMs: RESPONSE_WINDOW_TIMEOUT_MS,
          validResponseAbilityIDs: ['action_unlock_effect_2'],
          onTimeout: 'resolve',
        });
        return s;
      }
      // 没有可响应者：不开窗口，直接结算，避免 pendingUnlock 悬空卡住对局
      return resolveUnlockFull(s, random);
    },
    client: false,
  },

  // resolveUnlock：兜底入口 - 在响应窗口未接入或 bot 直接推进时可用。
  // 正常流程下由 passResponse 在"全员 pass"时自动触发 resolveUnlockFull。
  //   该 move 仍保留：供 bot/无响应窗口场景 fallback；会强制关闭可能残留的窗口。
  resolveUnlock: {
    move: ({ G, random }: MoveCtx) => {
      if (!G.pendingUnlock) return INVALID_MOVE;
      // 强制退栈：若仍挂着响应窗口（兜底路径），回退到父窗口或 null
      let s: SetupState = G.pendingResponseWindow
        ? { ...G, pendingResponseWindow: G.pendingResponseWindow.parentWindow ?? null }
        : G;
      s = resolveUnlockFull(s, random);
      return s;
    },
    client: false,
  },

  // 响应解封效果②：抵消一张正在结算的【解封】。
  // 对照：docs/manual/04-action-cards.md §解封 效果②
  // 补齐 responder 校验 + 持卡校验 + 弃牌 + 关闭响应窗口。
  //   无参数：响应者就是发起者（包装层已按行动权表校验并把 ctx.currentPlayer 设为发起者）。
  respondCancelUnlock: {
    move: ({ G, ctx }: MoveCtx) => {
      const rid = ctx.currentPlayer;
      if (!G.pendingUnlock) return INVALID_MOVE;
      const w = G.pendingResponseWindow;
      if (!w) return INVALID_MOVE;
      if (w.sourceAbilityID !== 'action_unlock_effect_1') return INVALID_MOVE;
      if (!w.responders.includes(rid)) return INVALID_MOVE;
      if (w.responded.includes(rid)) return INVALID_MOVE;
      const responder = G.players[rid];
      if (!responder || !responder.isAlive) return INVALID_MOVE;
      const unlockCard = 'action_unlock' as CardID;
      if (!responder.hand.includes(unlockCard)) return INVALID_MOVE;
      // 弃响应者 1 张【解封】
      let s = discardCard(G, rid, unlockCard);
      // 关闭响应窗口（栈式回退到 parentWindow / null）
      const close = respondToWindow(s, rid, 'action_unlock_effect_2');
      s = close.state;
      // 撤销解封：pendingUnlock → null（不减心锁，不加 successfulUnlocksThisTurn）
      s = applyUnlockCancel(s);
      return s;
    },
    client: false,
  },

  // pass 响应：表示自己不出效果②抵消。
  // 校验 responder 合法 & 未重复 pass；全员 pass 时自动进入 resolveUnlockFull。
  //   无参数：响应者就是发起者（同 respondCancelUnlock）。
  passResponse: {
    move: ({ G, ctx, random }: MoveCtx) => {
      const rid = ctx.currentPlayer;
      const w = G.pendingResponseWindow;
      if (!w) return INVALID_MOVE;
      if (!w.responders.includes(rid)) return INVALID_MOVE;
      if (w.responded.includes(rid)) return INVALID_MOVE;
      // 本次 pass 后是否所有 responder 都已响应
      const isLastPass = w.responded.length + 1 >= w.responders.length;
      let s = passOnResponse(G, rid);
      // 全员 pass 且源是解封效果① → 自动结算为"解封成功"（含译梦师/M4-4 等副作用）
      if (isLastPass && w.sourceAbilityID === 'action_unlock_effect_1' && s.pendingUnlock) {
        s = resolveUnlockFull(s, random);
      }
      return s;
    },
    client: false,
  },
};
