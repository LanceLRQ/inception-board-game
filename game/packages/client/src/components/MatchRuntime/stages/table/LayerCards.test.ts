import { describe, it, expect } from 'vitest';
import type { MatchView } from '@icgame/game-engine';
import { buildFixtureScenario } from '../../../../match/fixtures/buildScenario';
import { buildBoardLayers } from '../../model/boardModel';
import { adaptViewToStage } from '../../model/viewAdapter';
import { tableLayerOrder } from './LayerCards';

describe('tableLayerOrder', () => {
  it('梦境层从一层排到四层，迷失层单独拿出来', () => {
    const sc = buildFixtureScenario('thief');
    const G = sc.view.G as MatchView;
    const state = adaptViewToStage({ G, ctx: sc.view.ctx, humanPlayerID: sc.seat })!;
    const { dreams, lost } = tableLayerOrder(buildBoardLayers(state, G.layers, null, (id) => id));
    expect(dreams.map((l) => l.layer)).toEqual([1, 2, 3, 4]);
    expect(lost?.layer).toBe(0);
  });
});
