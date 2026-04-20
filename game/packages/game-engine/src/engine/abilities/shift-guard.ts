// 移形换影强校验 — 回合末还原 + 一致性检查
// 对照：docs/manual/04-action-cards.md 移形换影 + game.ts turn.onEnd

import type { SetupState } from '../../setup.js';

/**
 * 还原移形换影快照
 * 从 shiftSnapshot 恢复所有玩家的原始 characterId
 */
export function restoreShiftSnapshot(state: SetupState): SetupState {
  if (!state.shiftSnapshot) return state;

  const snap = state.shiftSnapshot;
  const nextPlayers = { ...state.players };

  for (const pid of Object.keys(snap)) {
    const original = snap[pid];
    if (nextPlayers[pid] && original !== undefined) {
      nextPlayers[pid] = { ...nextPlayers[pid]!, characterId: original };
    }
  }

  return { ...state, players: nextPlayers, shiftSnapshot: null };
}

/**
 * 校验 shiftSnapshot 一致性
 * 检查 snapshot 中记录的所有玩家都存在且快照值合理
 * 返回校验结果（不修改 state）
 */
export function validateShiftSnapshot(state: SetupState): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!state.shiftSnapshot) {
    return { valid: true, errors: [] };
  }

  for (const [pid, charId] of Object.entries(state.shiftSnapshot)) {
    const player = state.players[pid];
    if (!player) {
      errors.push(`shiftSnapshot references non-existent player ${pid}`);
      continue;
    }
    if (!charId) {
      errors.push(`shiftSnapshot[${pid}] is empty`);
    }
  }

  // 检查 snapshot 中的玩家都是 playerOrder 内的
  for (const pid of Object.keys(state.shiftSnapshot)) {
    if (!state.playerOrder.includes(pid)) {
      errors.push(`shiftSnapshot player ${pid} not in playerOrder`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 强校验 + 还原（回合末调用）
 * 先校验，若通过则正常还原；否则记录异常但仍然还原（防卡死）
 */
export function shiftGuardAndRestore(state: SetupState): SetupState {
  const { valid } = validateShiftSnapshot(state);
  // 即使校验失败也执行还原（保证游戏不卡死）
  const restored = restoreShiftSnapshot(state);

  // 可在此处添加日志记录 errors（暂不引入副作用）
  if (!valid) {
    // 未来可接入 logger.warn('game/shift', 'shiftSnapshot validation errors', { errors });
  }

  return restored;
}
