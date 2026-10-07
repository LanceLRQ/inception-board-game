// 对局阶段的回合配置：回合顺序（从梦主起顺时针）、回合开始与结束时的状态同步和清理。

import type { Layer } from '@icgame/shared';
import { shiftGuardAndRestore } from './engine/abilities/shift-guard.js';
import { applyPlutoHellLostCheck } from './engine/skills.js';
import type { BGIOCtx } from './moves/common.js';
import type { SetupState } from './setup.js';
import { beginTurn, movePlayerToLayer } from './stateOps.js';

export const playingTurn = {
  order: {
    first: ({ G }: { G: SetupState; ctx: BGIOCtx }) => {
      const masterID = G.dreamMasterID;
      if (!masterID) return 0;
      const idx = G.playerOrder.indexOf(masterID);
      return idx >= 0 ? idx : 0;
    },
    next: ({ ctx }: { G: SetupState; ctx: BGIOCtx }) => (ctx.playOrderPos + 1) % ctx.numPlayers,
  },
  // 回合开始时同步 G 的 turn 状态
  onBegin: ({ G, ctx }: { G: SetupState; ctx: BGIOCtx }) => {
    let s = beginTurn(G, ctx.currentPlayer);
    // 梦主 M4-3：若梦主回合开始时处于迷失层（layer 0），自动复活
    //   —— 规则：梦主无需弃手牌，落在进入迷失层之前所在的那一层
    //   —— 对照：docs/manual/03-game-flow.md 复活；docs/manual/08-appendix.md M4 梦主优势第 3 条
    //   记录缺失（旧状态）时回落第 1 层
    if (ctx.currentPlayer === s.dreamMasterID) {
      const master = s.players[s.dreamMasterID];
      if (master && (master.currentLayer === 0 || !master.isAlive)) {
        const returnLayer = (master.layerBeforeLimbo ?? 1) as Layer;
        s = {
          ...s,
          players: {
            ...s.players,
            [s.dreamMasterID]: {
              ...master,
              isAlive: true,
              deathTurn: null,
              layerBeforeLimbo: null,
            },
          },
        };
        s = movePlayerToLayer(s, s.dreamMasterID, returnLayer);
      }
    }
    return s;
  },
  // 回合末：还原移形换影快照（对照 docs/manual/04-action-cards.md 移形换影 解析）
  // + 检查筑梦师·迷宫是否到期（mazeState.untilTurnNumber 已被超过）
  onEnd: ({ G, ctx }: { G: SetupState; ctx: BGIOCtx }) => {
    let s = shiftGuardAndRestore(G);
    if (s.mazeState && G.turnNumber >= s.mazeState.untilTurnNumber) {
      s = { ...s, mazeState: null };
    }
    // 白羊·星尘：回合末未消费的 pending 强制清空，防卡死
    if (s.pendingAriesChoice) {
      s = { ...s, pendingAriesChoice: null };
    }
    // 处女·完美：回合末未决定强制清空（视为放弃技能，防卡死）
    if (s.pendingVirgoChoice) {
      s = { ...s, pendingVirgoChoice: null };
    }
    // 双鱼·闪避：回合末未决定强制清空（视为放弃响应，防卡死）
    //   注：理想情况是回合末不应有该 pending（应在打 SHOOT 当下消费完）；保险兜底
    if (s.pendingShootResponse) {
      s = { ...s, pendingShootResponse: null };
    }
    // 冥王星地狱世界观：抽牌阶段结束时手牌≥6 打下的标记，在该盗梦者回合结束时兑现 → 入迷失层
    // 对照：docs/manual/06-dream-master.md 冥王星·地狱
    s = applyPlutoHellLostCheck(s, ctx.currentPlayer);
    return s;
  },
};
