// 技能的使用次数：能否再用、记一次使用

import type { SetupState, PlayerSetup } from '../../setup.js';

// === 技能使用前检查 ===

/** 检查技能本回合是否可用（含 limitN） */
export function canUseSkill(
  player: PlayerSetup,
  skillId: string,
  usageScope: string,
  limitN?: number,
): boolean {
  if (usageScope === 'unlimited') return true;

  const usedThisTurn = player.skillUsedThisTurn[skillId] ?? 0;
  if (usageScope === 'ownTurnOncePerTurn' && usedThisTurn >= 1) return false;
  if (usageScope === 'ownTurnLimitN' && limitN !== undefined && usedThisTurn >= limitN)
    return false;

  const usedThisGame = player.skillUsedThisGame[skillId] ?? 0;
  if (usageScope === 'perGameLimitN' && limitN !== undefined && usedThisGame >= limitN)
    return false;

  return true;
}

/** 标记技能已使用 */
export function markSkillUsed(state: SetupState, playerID: string, skillId: string): SetupState {
  const player = state.players[playerID];
  if (!player) return state;

  return {
    ...state,
    players: {
      ...state.players,
      [playerID]: {
        ...player,
        skillUsedThisTurn: {
          ...player.skillUsedThisTurn,
          [skillId]: (player.skillUsedThisTurn[skillId] ?? 0) + 1,
        },
        skillUsedThisGame: {
          ...player.skillUsedThisGame,
          [skillId]: (player.skillUsedThisGame[skillId] ?? 0) + 1,
        },
      },
    },
  };
}
