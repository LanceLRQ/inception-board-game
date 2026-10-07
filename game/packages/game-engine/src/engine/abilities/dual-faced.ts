// 双面角色翻面机制
// 规则：进入迷失层**不**触发翻面；翻面由特定技能/条件触发

import type { CardID, Faction } from '@icgame/shared';
import type { SetupState } from '../../setup.js';

/** 双面角色配置 */
export interface DualFacedConfig {
  /** 角色牌 id，也是正面朝上时玩家的 characterId（如 'thief_gemini'） */
  frontId: CardID;
  /** 翻面后玩家的 characterId（如 'thief_gemini_back'）；它只是运行时的「背面朝上」状态，不是另一张牌 */
  backId: CardID;
  /** 正面阵营 */
  frontFaction: Faction;
  /** 背面阵营（多数与正面相同，但某些角色可能不同） */
  backFaction: Faction;
}

/** 双面角色的牌 id；与卡牌配置里 doubleSided 的角色一一对应（由测试对账） */
export const DUAL_FACED_CARD_IDS: readonly CardID[] = [
  'thief_gemini',
  'thief_pisces',
  'thief_luna',
];

/** 翻面后玩家的 characterId：牌 id 加 `_back` */
export function backFaceId(cardId: CardID): CardID {
  return `${cardId}_back`;
}

/** 已知的双面角色配置表 */
export const DUAL_FACED_CHARS: DualFacedConfig[] = DUAL_FACED_CARD_IDS.map((id) => ({
  frontId: id,
  backId: backFaceId(id),
  frontFaction: 'thief',
  backFaction: 'thief',
}));

/** 查找角色的双面配置 */
export function getDualFacedConfig(characterId: CardID): DualFacedConfig | undefined {
  return DUAL_FACED_CHARS.find((c) => c.frontId === characterId || c.backId === characterId);
}

/** 判断是否为双面角色 */
export function isDualFaced(characterId: CardID): boolean {
  return getDualFacedConfig(characterId) !== undefined;
}

/** 双面角色当前朝上的一面 */
export type CharacterFace = 'front' | 'back';

/** 当前是哪一面；非双面角色返回 null */
export function getCharacterFace(characterId: CardID): CharacterFace | null {
  const config = getDualFacedConfig(characterId);
  if (!config) return null;
  return characterId === config.backId ? 'back' : 'front';
}

/** 取角色的基础（正面）id：双面角色的背面 id 归到正面，其余原样返回 */
export function getBaseCharacterId(characterId: CardID): CardID {
  return getDualFacedConfig(characterId)?.frontId ?? characterId;
}

/**
 * 判断「当前角色是 baseId 这个角色，并且朝上的是 face 这一面」。
 * 技能按面区分：正面技能传 'front'，背面技能传 'back'。
 */
export function isCharacterFace(characterId: CardID, baseId: CardID, face: CharacterFace): boolean {
  return getBaseCharacterId(characterId) === baseId && getCharacterFace(characterId) === face;
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
