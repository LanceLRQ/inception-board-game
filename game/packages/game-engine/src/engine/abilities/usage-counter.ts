// 技能使用计数器 — 4 种 scope（回合/阶段/对局/被动）
// 对照：plans/design/05-card-system.md §5.1 + 00-overview.md §0.4

import type { SetupState } from '../../setup.js';
import type { SkillScope } from './types.js';

/** 技能使用计数 key */
export interface UsageKey {
  playerID: string;
  abilityID: string;
  scope: SkillScope;
}

/** 获取当前 scope 下已使用次数 */
export function getUsageCount(
  state: SetupState,
  key: UsageKey,
  turnPhase: SetupState['turnPhase'],
): number {
  const player = state.players[key.playerID];
  if (!player) return 0;

  switch (key.scope) {
    case 'perTurn':
      return player.skillUsedThisTurn[key.abilityID] ?? 0;
    case 'perPhase':
      // perPhase 用 "abilityID:phase" key 存储在 skillUsedThisTurn 中
      return player.skillUsedThisTurn[`${key.abilityID}:${turnPhase}`] ?? 0;
    case 'perGame':
      return player.skillUsedThisGame[key.abilityID] ?? 0;
    case 'passive':
      return 0;
  }
}

/** 检查技能是否还能使用（限制次数内） */
export function canUse(
  state: SetupState,
  key: UsageKey,
  limit: number | undefined,
  turnPhase: SetupState['turnPhase'],
): boolean {
  if (key.scope === 'passive') return true;
  if (limit === undefined) return true;

  const used = getUsageCount(state, key, turnPhase);
  return used < limit;
}

/** 递增使用计数，返回新 state */
export function incrementUsage(
  state: SetupState,
  key: UsageKey,
  turnPhase: SetupState['turnPhase'],
): SetupState {
  const player = state.players[key.playerID];
  if (!player || key.scope === 'passive') return state;

  switch (key.scope) {
    case 'perTurn': {
      const count = (player.skillUsedThisTurn[key.abilityID] ?? 0) + 1;
      return {
        ...state,
        players: {
          ...state.players,
          [key.playerID]: {
            ...player,
            skillUsedThisTurn: { ...player.skillUsedThisTurn, [key.abilityID]: count },
            skillUsedThisGame: {
              ...player.skillUsedThisGame,
              [key.abilityID]: (player.skillUsedThisGame[key.abilityID] ?? 0) + 1,
            },
          },
        },
      };
    }
    case 'perPhase': {
      const phaseKey = `${key.abilityID}:${turnPhase}`;
      const phaseCount = (player.skillUsedThisTurn[phaseKey] ?? 0) + 1;
      return {
        ...state,
        players: {
          ...state.players,
          [key.playerID]: {
            ...player,
            skillUsedThisTurn: { ...player.skillUsedThisTurn, [phaseKey]: phaseCount },
            skillUsedThisGame: {
              ...player.skillUsedThisGame,
              [key.abilityID]: (player.skillUsedThisGame[key.abilityID] ?? 0) + 1,
            },
          },
        },
      };
    }
    case 'perGame': {
      return {
        ...state,
        players: {
          ...state.players,
          [key.playerID]: {
            ...player,
            skillUsedThisGame: {
              ...player.skillUsedThisGame,
              [key.abilityID]: (player.skillUsedThisGame[key.abilityID] ?? 0) + 1,
            },
          },
        },
      };
    }
  }
}

/** 回合开始时重置 perTurn / perPhase 计数 */
export function resetTurnUsage(state: SetupState, playerID: string): SetupState {
  const player = state.players[playerID];
  if (!player) return state;
  return {
    ...state,
    players: {
      ...state.players,
      [playerID]: { ...player, skillUsedThisTurn: {} },
    },
  };
}
