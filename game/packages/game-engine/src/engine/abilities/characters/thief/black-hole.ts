// 黑洞 · 征收（thief_black_hole.skill_0）
// 对照：docs/manual/05-dream-thieves.md 黑洞
// 抽牌阶段：同层每个玩家给你 1 张牌
//
// abilities registry 接入：onDrawPhase trigger + 响应窗口（同层玩家挑 1 张）

import { applyBlackHoleLevy, BLACK_HOLE_LEVY_SKILL_ID } from '../../../skills.js';
import { openResponseWindow } from '../../response-chain.js';
import type { CardID } from '@icgame/shared';
import type { AbilityContext, AbilityDefinition } from '../../types.js';
import type { SetupState } from '../../../../setup.js';

export { BLACK_HOLE_LEVY_SKILL_ID, applyBlackHoleLevy };

export const blackHoleLevy: AbilityDefinition = {
  id: BLACK_HOLE_LEVY_SKILL_ID,
  name: 'character.thief_black_hole.skill_0.name',
  description: 'character.thief_black_hole.skill_0.desc',
  kind: 'skill',
  priorityBucket: 1,
  scope: 'perTurn',
  scopeLimit: 1,
  triggers: ['onDrawPhase'],

  canActivate(state: SetupState, ctx: AbilityContext) {
    const player = state.players[ctx.invokerID];
    if (!player) return { ok: false, reason: 'invalid_player' };
    if (player.characterId !== 'thief_black_hole') return { ok: false, reason: 'wrong_character' };
    if (!player.isAlive) return { ok: false, reason: 'dead' };
    if (ctx.turnPhase !== 'draw') return { ok: false, reason: 'wrong_phase' };
    const layerInfo = state.layers[player.currentLayer];
    const sameLayerOthers = layerInfo?.playersInLayer.filter((id) => id !== ctx.invokerID) ?? [];
    if (sameLayerOthers.length === 0) return { ok: false, reason: 'no_same_layer_others' };
    return { ok: true };
  },

  getRequiredInputs() {
    return [
      { name: 'giverPicks', kind: 'choice', prompt: 'character.thief_black_hole.skill_0.picks' },
    ];
  },

  apply(state: SetupState, ctx: AbilityContext, inputs) {
    const picks = (inputs.giverPicks as Record<string, CardID>) ?? {};
    // 若尚未收集各玩家 pick → 打开响应窗口
    const player = state.players[ctx.invokerID]!;
    const layerInfo = state.layers[player.currentLayer];
    const otherIds = layerInfo?.playersInLayer.filter((id) => id !== ctx.invokerID) ?? [];

    if (Object.keys(picks).length < otherIds.length) {
      const withWindow = openResponseWindow(state, {
        sourceAbilityID: this.id,
        sourceType: 'skill',
        responders: otherIds,
        timeoutMs: 30_000,
        validResponseAbilityIDs: ['generic_pick_card'],
        onTimeout: 'resolve',
      });
      return {
        state: withWindow,
        events: [
          {
            type: 'black_hole_levy_window_opened',
            playerID: ctx.invokerID,
            timestamp: 0,
            data: { responders: otherIds },
          },
        ],
      };
    }

    const next = applyBlackHoleLevy(state, ctx.invokerID, picks);
    if (!next) return { state, events: [] };
    return {
      state: next,
      events: [
        {
          type: 'black_hole_levy_resolved',
          playerID: ctx.invokerID,
          timestamp: 0,
          data: { picks },
        },
      ],
    };
  },
};
