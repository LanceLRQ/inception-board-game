import { describe, expect, it } from 'vitest';
import { checkInvariants, InceptionCityGame, viewMatch, type MatchView } from '@icgame/game-engine';
import { buildFixtureMatch } from './buildScenario';
import { resolveFixtureScenario } from './scenarios';

describe('tabletop demo 对照场景', () => {
  it('固定六人、角色、手牌和锁数，并经过真实视图过滤', () => {
    const spec = resolveFixtureScenario(new URLSearchParams('tabletop=normal'));
    expect(spec.id).toBe('tabletop-normal');
    const { state, viewer } = buildFixtureMatch(spec.id);
    expect(checkInvariants(state.G)).toEqual([]);
    const G = viewMatch(InceptionCityGame, state, viewer).G as MatchView;
    expect(G.players[viewer]!.hand).toEqual([
      'action_shoot',
      'action_unlock',
      'action_dream_transit',
      'action_kick',
      'action_dream_peek',
    ]);
    expect(state.G.playerOrder.map((id) => state.G.players[id]!.nickname)).toEqual([
      '你',
      '暮雨',
      '林间',
      '北辰',
      '南山',
      '星河',
    ]);
    expect([1, 2, 3, 4].map((n) => G.layers[n]!.heartLockValue)).toEqual([5, 4, 3, 2]);
    expect(G.vaults.every((v) => v.contentType === null)).toBe(true);
  });
  it.each(['discard', 'peeked', 'dice', 'outcome'])('%s 场景满足引擎不变量', (scene) => {
    const spec = resolveFixtureScenario(new URLSearchParams(`tabletop=${scene}`));
    expect(spec.id).toBe(`tabletop-${scene}`);
    const { state, viewer } = buildFixtureMatch(spec.id);
    expect(checkInvariants(state.G)).toEqual([]);
    if (scene === 'discard') expect(state.G.players[viewer]!.hand).toHaveLength(7);
    if (scene === 'dice') expect(state.G.pendingDiceRoll?.rollers).toContain(viewer);
    if (scene === 'outcome') expect(state.ctx.gameover).toBeTruthy();
    if (scene === 'peeked') {
      const own = viewMatch(InceptionCityGame, state, viewer).G as MatchView;
      const other = viewMatch(InceptionCityGame, state, state.G.playerOrder[2]!).G as MatchView;
      expect(own.vaults.find((v) => v.layer === 3)?.contentType).toBe('secret');
      expect(other.vaults.find((v) => v.layer === 3)?.contentType).toBeNull();
    }
  });
});
