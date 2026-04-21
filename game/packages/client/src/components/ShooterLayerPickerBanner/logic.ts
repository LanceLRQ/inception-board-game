// SHOOT 发动方选层 banner · 纯逻辑层
// 对照：docs/manual/04-action-cards.md SHOOT 解析 "由你来选择移动"
// 触发：G.pendingShootMove 挂起 + viewer 是发动方 → 弹出选层（choices 中的相邻层）
//
// 说明：L1/L4 目标被 engine 判为唯一相邻层时自动移动，不挂起，本 banner 不出现；
//   L2/L3 目标必须由发动方从 2 个相邻层中选一。

import type { SetupState } from '@icgame/game-engine';

export interface ShooterLayerPickerState {
  visible: boolean;
  targetPlayerID: string | null;
  cardId: string | null;
  /** 合法相邻层（1..4 且 ≠ 0 迷失层；必定 2 个元素） */
  choices: number[];
}

export function computeShooterLayerPickerState(
  G: SetupState | null | undefined,
  viewerPlayerID: string,
): ShooterLayerPickerState {
  const empty: ShooterLayerPickerState = {
    visible: false,
    targetPlayerID: null,
    cardId: null,
    choices: [],
  };
  if (!G) return empty;
  const pending = (G as unknown as { pendingShootMove?: SetupState['pendingShootMove'] })
    .pendingShootMove;
  if (!pending) return empty;
  // 仅发动方可见
  if (viewerPlayerID !== pending.shooterID) return empty;

  return {
    visible: true,
    targetPlayerID: pending.targetPlayerID,
    cardId: pending.cardId,
    choices: pending.choices,
  };
}
