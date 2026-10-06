import { describe, expect, it } from 'vitest';
import type { MatchView } from '@icgame/game-engine';
import { buildFixtureScenario } from '../../match/fixtures/buildScenario';
import { visibleCardIds } from './assetIds';

describe('visibleCardIds', () => {
  const sc = buildFixtureScenario('thief');
  const view = sc.view.G as MatchView;

  it('包含本人的手牌与本人角色', () => {
    const ids = visibleCardIds(view, sc.seat);
    const me = view.players[sc.seat]!;
    for (const card of me.hand as string[]) expect(ids).toContain(card);
    expect(ids).toContain(me.characterId);
  });

  it('不含任何他人的手牌，也不含视图里没有给出的未翻开角色', () => {
    const ids = new Set(visibleCardIds(view, sc.seat));
    const hidden = Object.entries(view.players).filter(
      ([id, p]) => id !== sc.seat && (p.characterId === null || p.characterId === ''),
    );
    expect(hidden.length).toBeGreaterThan(0);
    for (const [, p] of Object.entries(view.players)) {
      if (p.characterId) expect(ids.has(p.characterId)).toBe(true);
    }
    // 他人的手牌在视图里是 null，不会被读到
    for (const [id, p] of Object.entries(view.players)) {
      if (id !== sc.seat) expect(p.hand).toBeNull();
    }
  });

  it('去重；没有视图或座位时是空表（座位未知时不取任何人的手牌）', () => {
    const ids = visibleCardIds(view, sc.seat);
    expect(new Set(ids).size).toBe(ids.length);
    expect(visibleCardIds(undefined, '0')).toEqual([]);
    const noSeat = visibleCardIds(view, null);
    for (const card of view.players[sc.seat]!.hand as string[]) {
      if (!view.deck?.discardPile?.includes(card as never)) {
        expect(noSeat).not.toContain(card);
      }
    }
  });
});
