// 复活：常规复活与带复活效果的技能
// 对照：docs/manual/03-game-flow.md 复活 / docs/manual/05-dream-thieves.md

import type { SetupState } from '../../setup.js';
import { movePlayerToLayer, discardCard, discardCards } from '../../stateOps.js';
import { flipCharacter, isCharacterFace } from '../abilities/dual-faced.js';
import type { CardID, Layer } from '@icgame/shared';
import { canUseSkill, markSkillUsed } from './usage.js';
import { isShootClassCard, LUNA_FRONT_ID } from './thiefMovement.js';

// === 灵魂牧师 · 拯救 ===
// 对照：docs/manual/05-dream-thieves.md 灵魂牧师
// 出牌阶段：弃 1 手牌 → 复活迷失层（layer 0）一名玩家到自己所在层 + 取该玩家所有手牌。回合限 2 次。

export const PAPRIK_SKILL_ID = 'thief_paprik.skill_0';
const PAPRIK_LIMIT_PER_TURN = 2;

/** 灵魂牧师技能 */
export function applyPaprikSalvation(
  state: SetupState,
  selfID: string,
  discardCardId: CardID,
  targetID: string,
): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_paprik') return null;
  if (!player.isAlive) return null;
  if (!canUseSkill(player, PAPRIK_SKILL_ID, 'ownTurnLimitN', PAPRIK_LIMIT_PER_TURN)) return null;

  const target = state.players[targetID];
  if (!target) return null;
  // target 必须是死亡玩家（layer 0 / isAlive=false）
  if (target.isAlive) return null;
  if (selfID === targetID) return null;

  // 弃牌必须在手中
  if (!player.hand.includes(discardCardId)) return null;

  let s = markSkillUsed(state, selfID, PAPRIK_SKILL_ID);
  // 弃手牌（弃的是时间风暴则触发效果）
  s = discardCard(s, selfID, discardCardId);
  // 复活 target：isAlive=true、deathTurn=null、迁移到 self.currentLayer
  // target 的所有手牌转给 self（先收手牌，再清 target.hand）
  const targetHand = [...target.hand];
  s = {
    ...s,
    players: {
      ...s.players,
      [selfID]: { ...s.players[selfID]!, hand: [...s.players[selfID]!.hand, ...targetHand] },
      [targetID]: {
        ...s.players[targetID]!,
        isAlive: true,
        deathTurn: null,
        layerBeforeLimbo: null,
        hand: [],
      },
    },
  };
  // 移动 target 到 self 所在层
  s = movePlayerToLayer(s, targetID, player.currentLayer);
  return s;
}

// === 露娜 · 满月（skill_1）===
// 出牌阶段：弃 2 张"非 SHOOT 类"手牌 → 复活任意数量（含 0）玩家到自己所在层 → 翻面
// 对照：docs/manual/05-dream-thieves.md 露娜 21-25 行
// 规则：复活数量可为 0，仅用来触发翻面（manual 明允）
export const LUNA_FULL_MOON_SKILL_ID = 'thief_luna.skill_1';

export function applyLunaFullMoon(
  state: SetupState,
  selfID: string,
  discardCardIds: readonly CardID[],
  reviveIDs: readonly string[],
): SetupState | null {
  const player = state.players[selfID];
  if (!player || !isCharacterFace(player.characterId, LUNA_FRONT_ID, 'back')) return null;
  if (!player.isAlive) return null;
  if (player.currentLayer < 1) return null;
  if (!canUseSkill(player, LUNA_FULL_MOON_SKILL_ID, 'ownTurnOncePerTurn')) return null;
  if (discardCardIds.length !== 2) return null;
  // 两张都必须是非 SHOOT 类牌
  for (const cid of discardCardIds) {
    if (isShootClassCard(cid)) return null;
  }
  // multiset 校验手牌持有
  const handCopy = [...player.hand];
  for (const cid of discardCardIds) {
    const idx = handCopy.indexOf(cid);
    if (idx === -1) return null;
    handCopy.splice(idx, 1);
  }
  // 校验 reviveIDs：必须死亡、非自己、互不重复
  const seen = new Set<string>();
  for (const rid of reviveIDs) {
    if (rid === selfID) return null;
    if (seen.has(rid)) return null;
    seen.add(rid);
    const target = state.players[rid];
    if (!target || target.isAlive) return null;
  }

  let s = markSkillUsed(state, selfID, LUNA_FULL_MOON_SKILL_ID);
  // 弃 2 张非 SHOOT（弃的是时间风暴则触发效果）
  s = discardCards(s, selfID, discardCardIds);
  // 逐个复活到自己所在层
  for (const rid of reviveIDs) {
    const rp = s.players[rid]!;
    s = {
      ...s,
      players: {
        ...s.players,
        [rid]: { ...rp, isAlive: true, deathTurn: null, layerBeforeLimbo: null },
      },
    };
    s = movePlayerToLayer(s, rid, player.currentLayer as Layer);
  }
  // 翻面
  s = flipCharacter(s, selfID);
  return s;
}

// === 复活机制 ===
// 对照：docs/manual/03-game-flow.md 复活

/** 判断是否为密道世界观（只能弃 1 张穿梭剂复活） */
export function isSecretPassageWorldActive(state: SetupState): boolean {
  const master = state.players[state.dreamMasterID];
  return master?.characterId === 'dm_secret_passage';
}

/**
 * 基础复活：弃 2 张手牌复活自己或他人
 * 密道世界观变体：弃 1 张【梦境穿梭剂】复活
 */
/**
 * 本回合自己复活过自己的标记，记在每回合自动清零的 skillUsedThisTurn 里。
 * 带标记的玩家当回合不能用【解封】的效果①，效果②（抵消别人的解封）不受影响。
 * 对照：docs/manual/04-action-cards.md 解封（效果①「复活后不能在当回合使用此效果」）
 */
export const REVIVED_SELF_THIS_TURN_KEY = 'revive.self';

export function applyRevive(
  state: SetupState,
  selfID: string,
  targetID: string | null,
  discardedCardIds: CardID[],
): SetupState | null {
  const self = state.players[selfID];
  if (!self) return null;
  const effectiveTarget = targetID ?? selfID;
  const isSelfRevive = effectiveTarget === selfID;

  // 复活自己时允许已死亡（在迷失层复活自己）；复活他人时自己必须存活
  if (!isSelfRevive && !self.isAlive) return null;
  // 复活自己时自己必须在迷失层
  if (isSelfRevive && self.isAlive) return null;

  const target = state.players[effectiveTarget];
  if (!target) return null;
  // 目标必须已死亡
  if (target.isAlive) return null;
  // 复活他人时自己不能在迷失层
  if (!isSelfRevive && self.currentLayer === 0) return null;

  const secretPassage = isSecretPassageWorldActive(state);

  if (secretPassage) {
    // 密道世界观：只能弃 1 张穿梭剂
    if (discardedCardIds.length !== 1) return null;
    if (discardedCardIds[0] !== 'action_dream_transit') return null;
  } else {
    // 基础规则：弃 2 张手牌
    if (discardedCardIds.length !== 2) return null;
  }

  // 校验手牌包含所有弃牌
  for (const cid of discardedCardIds) {
    if (!self.hand.includes(cid)) return null;
  }

  // 弃牌：代价从复活者手里扣掉（弃的是时间风暴则触发效果）。
  // 复活自己时必须先弃牌再改写自己的状态，否则弃牌后的手牌会被旧快照覆盖
  let s = discardCards(state, selfID, discardedCardIds);

  // 复活目标：isAlive=true, deathTurn=null
  const reviveLayer = effectiveTarget === selfID ? 1 : self.currentLayer;
  s = {
    ...s,
    players: {
      ...s.players,
      [effectiveTarget]: {
        ...s.players[effectiveTarget]!,
        isAlive: true,
        deathTurn: null,
        layerBeforeLimbo: null,
      },
    },
  };
  s = movePlayerToLayer(s, effectiveTarget, reviveLayer as Layer);
  if (isSelfRevive) {
    const revived = s.players[selfID]!;
    s = {
      ...s,
      players: {
        ...s.players,
        [selfID]: {
          ...revived,
          skillUsedThisTurn: { ...revived.skillUsedThisTurn, [REVIVED_SELF_THIS_TURN_KEY]: 1 },
        },
      },
    };
  }
  return s;
}
