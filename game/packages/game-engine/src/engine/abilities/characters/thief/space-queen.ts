// 空间女王 · 监察 + 放置（thief_space_queen.skill_0 / skill_1）
// 对照：docs/manual/05-dream-thieves.md 空间女王
// skill_0: 另一玩家成功解锁时，可抽 1（onUnlock 响应）
// skill_1: 任意玩家弃牌阶段时，可放 1 手牌到牌库顶（onDiscardPhase 响应）

import {
  applySpaceQueenObserve,
  applySpaceQueenStashTop,
  SPACE_QUEEN_OBSERVE_SKILL_ID,
  SPACE_QUEEN_TOP_SKILL_ID,
} from '../../../skills.js';
import type { CardID } from '@icgame/shared';
import type { AbilityContext, AbilityDefinition } from '../../types.js';
import type { SetupState } from '../../../../setup.js';

export {
  SPACE_QUEEN_OBSERVE_SKILL_ID,
  SPACE_QUEEN_TOP_SKILL_ID,
  applySpaceQueenObserve,
  applySpaceQueenStashTop,
};

export const spaceQueenObserve: AbilityDefinition = {
  id: SPACE_QUEEN_OBSERVE_SKILL_ID,
  name: 'character.thief_space_queen.skill_0.name',
  description: 'character.thief_space_queen.skill_0.desc',
  kind: 'skill',
  priorityBucket: 1,
  scope: 'passive',
  triggers: ['onUnlock'],

  canActivate(state: SetupState, ctx: AbilityContext) {
    const player = state.players[ctx.invokerID];
    if (!player) return { ok: false, reason: 'invalid_player' };
    if (player.characterId !== 'thief_space_queen') return { ok: false, reason: 'wrong_character' };
    if (!player.isAlive) return { ok: false, reason: 'dead' };
    return { ok: true };
  },

  getRequiredInputs() {
    return [];
  },

  apply(state: SetupState, ctx: AbilityContext) {
    const next = applySpaceQueenObserve(state, ctx.invokerID);
    if (!next) return { state, events: [] };
    return {
      state: next,
      events: [
        {
          type: 'space_queen_observe_resolved',
          playerID: ctx.invokerID,
          timestamp: 0,
        },
      ],
    };
  },
};

export const spaceQueenStashTop: AbilityDefinition = {
  id: SPACE_QUEEN_TOP_SKILL_ID,
  name: 'character.thief_space_queen.skill_1.name',
  description: 'character.thief_space_queen.skill_1.desc',
  kind: 'skill',
  priorityBucket: 1,
  scope: 'passive',
  triggers: ['onDiscardPhase'],

  canActivate(state: SetupState, ctx: AbilityContext) {
    const player = state.players[ctx.invokerID];
    if (!player) return { ok: false, reason: 'invalid_player' };
    if (player.characterId !== 'thief_space_queen') return { ok: false, reason: 'wrong_character' };
    if (!player.isAlive) return { ok: false, reason: 'dead' };
    if (player.hand.length === 0) return { ok: false, reason: 'no_hand' };
    return { ok: true };
  },

  getRequiredInputs() {
    return [{ name: 'cardId', kind: 'card', prompt: 'character.thief_space_queen.skill_1.card' }];
  },

  apply(state: SetupState, ctx: AbilityContext, inputs) {
    const cardId = inputs.cardId as CardID | undefined;
    if (!cardId) return { state, events: [] };
    const next = applySpaceQueenStashTop(state, ctx.invokerID, cardId);
    if (!next) return { state, events: [] };
    return {
      state: next,
      events: [
        {
          type: 'space_queen_stash_top_resolved',
          playerID: ctx.invokerID,
          timestamp: 0,
          data: { cardId },
        },
      ],
    };
  },
};
