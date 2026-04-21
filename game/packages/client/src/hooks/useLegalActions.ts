// useLegalActions - 派生当前视角下的合法操作集合
// 对照：plans/design/02-game-rules-spec.md §2.4 + plans/design/06-frontend-design.md §6.4.5
//
// 真实架构：服务端在每次状态变更后下发 legalActions；此 hook 消费它。
// 当前 B6 阶段：基于 MockMatchState 前端推导（临时规则镜像）。
// B7 WS 接入后，改成从 store 订阅 legalActions，移除本地推导分支。

import { useMemo } from 'react';
import type { MockMatchState } from './useMockMatch.js';
import type { CardID } from '@icgame/shared';

export interface LegalActions {
  /** 可打出的手牌 ID 集合（第一步选牌可用） */
  playableCardIds: Set<CardID>;
  /** 对每张牌 → 合法目标玩家 ID 集合 */
  legalTargetsByCard: Record<string, Set<string>>;
  /** 对每张牌 → 合法目标层 */
  legalLayersByCard: Record<string, Set<number>>;
  /** 是否允许结束行动阶段 */
  canEndAction: boolean;
  /** 梦主免费移动：可前往的相邻层 */
  masterMoveLayers: Set<number>;
}

const EMPTY_LEGAL: LegalActions = {
  playableCardIds: new Set(),
  legalTargetsByCard: {},
  legalLayersByCard: {},
  canEndAction: false,
  masterMoveLayers: new Set(),
};

/** 纯函数版本，便于测试与复用 */
export function computeLegalActions(state: MockMatchState | null): LegalActions {
  if (!state) return EMPTY_LEGAL;
  if (state.phase !== 'playing') return EMPTY_LEGAL;

  const viewer = state.players[state.viewerID];
  if (!viewer || !viewer.isAlive) return EMPTY_LEGAL;

  // 只有当前玩家可以打牌
  const isMyTurn = state.viewerID === state.currentPlayerID;
  // pendingUnlock 激活期仅响应窗口
  const inResponseWindow = state.pendingUnlock !== null;
  if (!isMyTurn || inResponseWindow || state.turnPhase !== 'action') return EMPTY_LEGAL;

  const hand = viewer.hand ?? [];
  const playable = new Set<CardID>();
  const legalTargets: Record<string, Set<string>> = {};
  const legalLayers: Record<string, Set<number>> = {};

  // 对每张手牌推导合法性
  for (const card of hand) {
    const cardStr = card as string;
    if (cardStr.startsWith('action_shoot')) {
      // SHOOT：默认目标 = 同层存活玩家；SHOOT·刺客之王（action_shoot_king）允许跨层
      // 对照：docs/manual/04-action-cards.md SHOOT / SHOOT·刺客之王 使用目标
      const sameLayerRequired = cardStr !== 'action_shoot_king';
      const targets = new Set<string>();
      for (const pid of state.playerOrder) {
        const p = state.players[pid];
        if (!p || pid === state.viewerID) continue;
        if (!p.isAlive) continue;
        if (sameLayerRequired && p.currentLayer !== viewer.currentLayer) continue;
        targets.add(pid);
      }
      if (targets.size > 0) {
        playable.add(card);
        legalTargets[cardStr] = targets;
      }
    } else if (cardStr === 'action_unlock') {
      // 解封：盗梦者 + 当前层有心锁
      const layer = state.layers[viewer.currentLayer];
      if (viewer.faction === 'thief' && layer && layer.heartLockValue > 0) {
        playable.add(card);
      }
    } else if (cardStr === 'action_dream_transit') {
      // 梦境穿梭剂：相邻层
      const layers = new Set<number>();
      const here = viewer.currentLayer;
      if (here > 1) layers.add(here - 1);
      if (here < 4) layers.add(here + 1);
      if (layers.size > 0) {
        playable.add(card);
        legalLayers[cardStr] = layers;
      }
    } else if (cardStr === 'action_creation') {
      // 凭空造物：无目标
      playable.add(card);
    } else if (cardStr === 'action_kick') {
      // 梦主 KICK：同层盗梦者
      if (viewer.faction === 'master') {
        const targets = new Set<string>();
        for (const pid of state.playerOrder) {
          const p = state.players[pid];
          if (!p || !p.isAlive || p.faction === 'master') continue;
          if (p.currentLayer === viewer.currentLayer) targets.add(pid);
        }
        if (targets.size > 0) {
          playable.add(card);
          legalTargets[cardStr] = targets;
        }
      }
    }
  }

  // 梦主免费移动：相邻层
  const masterMoveLayers = new Set<number>();
  if (viewer.faction === 'master') {
    const here = viewer.currentLayer;
    if (here > 1) masterMoveLayers.add(here - 1);
    if (here < 4) masterMoveLayers.add(here + 1);
  }

  return {
    playableCardIds: playable,
    legalTargetsByCard: legalTargets,
    legalLayersByCard: legalLayers,
    canEndAction: true,
    masterMoveLayers,
  };
}

export function useLegalActions(state: MockMatchState | null): LegalActions {
  return useMemo(() => computeLegalActions(state), [state]);
}
