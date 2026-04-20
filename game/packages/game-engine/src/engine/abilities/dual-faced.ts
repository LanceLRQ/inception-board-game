// 双面角色翻面机制
// 对照：plans/design/02-game-rules-spec.md §2.6.3 / 05-card-system.md
// 规则：进入迷失层**不**触发翻面；翻面由特定技能/条件触发

import type { CardID, Faction } from '@icgame/shared';
import type { SetupState } from '../../setup.js';

/** 双面角色配置 */
export interface DualFacedConfig {
  /** 角色正面 ID（如 'thief_gemini_front'） */
  frontId: CardID;
  /** 角色背面 ID（如 'thief_gemini_back'） */
  backId: CardID;
  /** 正面阵营 */
  frontFaction: Faction;
  /** 背面阵营（多数与正面相同，但某些角色可能不同） */
  backFaction: Faction;
}

/** 已知的双面角色配置表 */
export const DUAL_FACED_CHARS: DualFacedConfig[] = [
  // 双子（Gemini）
  {
    frontId: 'thief_gemini',
    backId: 'thief_gemini_back',
    frontFaction: 'thief',
    backFaction: 'thief',
  },
  // 双鱼（Pisces）
  {
    frontId: 'thief_pisces',
    backId: 'thief_pisces_back',
    frontFaction: 'thief',
    backFaction: 'thief',
  },
  // 露娜（Luna）
  {
    frontId: 'thief_luna',
    backId: 'thief_luna_back',
    frontFaction: 'thief',
    backFaction: 'thief',
  },
];

/** 查找角色的双面配置 */
export function getDualFacedConfig(characterId: CardID): DualFacedConfig | undefined {
  return DUAL_FACED_CHARS.find((c) => c.frontId === characterId || c.backId === characterId);
}

/** 判断是否为双面角色 */
export function isDualFaced(characterId: CardID): boolean {
  return getDualFacedConfig(characterId) !== undefined;
}

/** 获取翻面后的角色 ID */
export function getFlippedId(characterId: CardID): CardID | null {
  const config = getDualFacedConfig(characterId);
  if (!config) return null;
  if (characterId === config.frontId) return config.backId;
  if (characterId === config.backId) return config.frontId;
  return null;
}

/**
 * 翻面操作
 * - 双面角色：交换 front ↔ back
 * - 非双面角色：无变化
 * - 返回新 state（不修改原 state）
 */
export function flipCharacter(state: SetupState, playerID: string): SetupState {
  const player = state.players[playerID];
  if (!player) return state;

  const flippedId = getFlippedId(player.characterId);
  if (!flippedId) return state;

  return {
    ...state,
    players: {
      ...state.players,
      [playerID]: {
        ...player,
        characterId: flippedId,
      },
    },
  };
}

/**
 * 批量翻面（用于多个角色同时翻面的场景）
 */
export function flipCharacters(state: SetupState, playerIDs: string[]): SetupState {
  let s = state;
  for (const pid of playerIDs) {
    s = flipCharacter(s, pid);
  }
  return s;
}
