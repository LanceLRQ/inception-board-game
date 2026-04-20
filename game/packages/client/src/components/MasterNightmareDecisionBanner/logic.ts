// 梦主梦魇决策提示 · 纯逻辑层
// 对照：docs/manual/03-game-flow.md 第 94-102 行 + 07-nightmare-cards.md
// 触发条件：盗梦者打开金币金库 → 同层有未翻开梦魇 → 梦主回合+action 阶段决策 3 选 1
//
// 决策三选一：
//   1. masterRevealNightmare(layer)  → 翻开梦魇并展示
//   2. masterActivateNightmare(layer) → 发动已翻开梦魇效果（需先翻开）
//   3. masterDiscardHiddenNightmare(layer) → 弃掉未翻开梦魇（不发动）
//   附：masterDealBribe(...)  → 派发贿赂（配套使用）

import { findCoinVaultsWithHiddenNightmare } from '@icgame/game-engine';
import type { SetupState } from '@icgame/game-engine';

/** 梦主决策提示状态（纯函数 · 便于测试） */
export interface NightmareDecisionState {
  /** 是否显示决策提示 */
  visible: boolean;
  /** 待决策的层列表 */
  pendingLayers: number[];
}

/**
 * 计算决策状态
 * @param G 游戏状态快照
 * @param currentPlayerID boardgame.io ctx.currentPlayer
 * @param dreamMasterID G.dreamMasterID
 */
export function computeNightmareDecisionState(
  G: SetupState | null | undefined,
  currentPlayerID: string,
  dreamMasterID: string,
): NightmareDecisionState {
  if (!G) return { visible: false, pendingLayers: [] };
  // 非梦主回合不提示
  if (!dreamMasterID || currentPlayerID !== dreamMasterID) {
    return { visible: false, pendingLayers: [] };
  }
  // 非 action 阶段不提示（避免误触）
  if ((G as unknown as { turnPhase?: string }).turnPhase !== 'action') {
    return { visible: false, pendingLayers: [] };
  }
  const pending = findCoinVaultsWithHiddenNightmare(G);
  return {
    visible: pending.length > 0,
    pendingLayers: pending,
  };
}
