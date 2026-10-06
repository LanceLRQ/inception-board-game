import { describe, it, expect } from 'vitest';
import type { MatchView } from '@icgame/game-engine';
import { buildFixtureScenario } from '../../../match/fixtures/buildScenario';
import { GENERIC_BACK_IMAGES } from '../../../lib/cardImages';
import { adaptViewToStage } from '../viewAdapter';
import { buildRailSlots } from './railModel';

function stageOf(id: 'thief' | 'master') {
  const sc = buildFixtureScenario(id);
  const state = adaptViewToStage({
    G: sc.view.G as MatchView,
    ctx: sc.view.ctx,
    humanPlayerID: sc.seat,
  })!;
  return state;
}

describe('buildRailSlots', () => {
  it('盗梦者视角：梦主排首位，每个玩家一格', () => {
    const state = stageOf('thief');
    const slots = buildRailSlots(state, undefined);
    expect(slots).toHaveLength(Object.keys(state.players).length);
    expect(slots[0]!.isMaster).toBe(true);
  });

  it('本人与当前行动者各有标记且唯一', () => {
    const state = stageOf('thief');
    const slots = buildRailSlots(state, undefined);
    expect(slots.filter((s) => s.isViewer)).toHaveLength(1);
    expect(slots.filter((s) => s.isCurrent)).toHaveLength(1);
    expect(slots.find((s) => s.isViewer)!.id).toBe(state.viewerID);
  });

  it('未翻开的他人显示阵营背面，且没有可看详情的角色', () => {
    const state = stageOf('thief');
    const slots = buildRailSlots(state, undefined);
    const hidden = slots.filter(
      (s) => !s.isViewer && !s.isMaster && !state.players[s.id]!.isRevealed,
    );
    expect(hidden.length).toBeGreaterThan(0);
    for (const s of hidden) {
      expect(s.characterId).toBeNull();
      expect(s.imageUrl).toBe(GENERIC_BACK_IMAGES.thief);
    }
  });

  it('本人与梦主的角色始终可见', () => {
    const state = stageOf('thief');
    const slots = buildRailSlots(state, undefined);
    expect(slots.find((s) => s.isViewer)!.characterId).toBeTruthy();
    expect(slots.find((s) => s.isMaster)!.characterId).toBeTruthy();
  });

  it('已迷失（所在层 0 或阵亡）标 isLost', () => {
    const state = stageOf('thief');
    const id = state.playerOrder.find((p) => p !== state.viewerID && p !== state.dreamMasterID)!;
    const lost = {
      ...state,
      players: { ...state.players, [id]: { ...state.players[id]!, currentLayer: 0 } },
    };
    const slots = buildRailSlots(lost, undefined);
    expect(slots.find((s) => s.id === id)!.isLost).toBe(true);
    expect(slots.find((s) => s.isViewer)!.isLost).toBe(false);
  });

  it('座位标识按座位带上', () => {
    const state = stageOf('master');
    const other = state.playerOrder.find((p) => p !== state.viewerID)!;
    const slots = buildRailSlots(state, { [other]: ['bot'] });
    expect(slots.find((s) => s.id === other)!.markers).toEqual(['bot']);
    expect(slots.find((s) => s.isViewer)!.markers).toEqual([]);
  });

  it('梦主视角：本人是梦主时不重复放梦主格', () => {
    const state = stageOf('master');
    const slots = buildRailSlots(state, undefined);
    expect(slots.filter((s) => s.isMaster)).toHaveLength(1);
    expect(slots.find((s) => s.isViewer)!.isMaster).toBe(true);
  });
});
