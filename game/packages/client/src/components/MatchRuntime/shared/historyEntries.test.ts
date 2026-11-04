import { describe, expect, it } from 'vitest';
import type { MatchEvent } from '@icgame/game-engine';
import { mergePublicHistory, describeHistoryEvent } from './historyEntries';

const event = (kind: string, data: Record<string, unknown>, stateID = 1): MatchEvent => ({
  stateID,
  index: 0,
  kind,
  actor: '1',
  data,
  secret: { to: ['1'], data: { cards: ['secret-card'], kind: 'deal', args: ['private'] } },
});
const describeEvent = (e: MatchEvent) =>
  describeHistoryEvent(
    e,
    (id) => `玩家${id}`,
    (key) => key,
  );

describe('整局公开历史', () => {
  it('普通抽牌不误报共用 doDraw 的角色技能，阶段变化不误归属上一位行动者', () => {
    expect(describeEvent(event('move', { move: 'doDraw' })).text).toBe('玩家1 · 抽牌');
    expect(describeEvent(event('phase_changed', { phase: 'draw' })).text).toBe('进入抽牌阶段');
  });
  it('实时推送与补读去重、排序，彻底去掉私密数据', () => {
    const batch = (id: number) => ({
      stateID: id,
      events: [event('cards_drawn', { player: '1', count: 2 }, id)],
    });
    const merged = mergePublicHistory([batch(3)], [batch(1), batch(3), batch(2)]);
    expect(merged.map((b) => b.stateID)).toEqual([1, 2, 3]);
    expect(JSON.stringify(merged)).not.toMatch(/secret-card|private|"secret"|"deal"/);
  });
  it('本人抽到的牌、贿赂结果也不进入公开文案', () => {
    for (const e of [
      event('cards_drawn', { player: '1', count: 2 }),
      event('bribe_dealt', { to: '1' }),
    ]) {
      const row = describeEvent(e);
      expect(row.cards).toEqual([]);
      expect(JSON.stringify(row)).not.toMatch(/secret-card|private|deal|背叛/);
    }
  });
  it('记录公开出牌、已开金库和骰子结果', () => {
    expect(
      describeEvent(event('card_played', { player: '1', card: 'action_shoot' })).cards,
    ).toEqual(['action_shoot']);
    expect(
      describeEvent(event('vault_opened', { openedBy: '1', layer: 3, content: 'secret' })).cards,
    ).toEqual(['vault_secret']);
    const row = describeEvent(
      event('dice_rolled', {
        purpose: 'shoot',
        by: '1',
        target: '2',
        rolls: [{ player: '2', dice: [3, 6] }],
      }),
    );
    expect(row.dice).toEqual([{ player: '2', dice: [3, 6] }]);
    expect(row.text).toContain('玩家1 → 玩家2');
  });
  it('记录心锁、解封结果和移层等公开效果', () => {
    expect(describeEvent(event('heart_lock_changed', { layer: 2, from: 4, to: 3 })).text).toContain(
      '4 → 3',
    );
    expect(
      describeEvent(event('unlock_resolved', { player: '1', layer: 2, success: false })).text,
    ).toContain('被抵消');
    expect(describeEvent(event('player_moved', { player: '1', from: 2, to: 0 })).text).toContain(
      '迷失层',
    );
  });
});
