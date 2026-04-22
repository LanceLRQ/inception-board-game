// computeRailSlots 纯函数测试
// 对照：plans/design/06c-match-table-layout.md §4

import { describe, it, expect } from 'vitest';
import { computeRailSlots } from './turnOrder.js';
import type { MockPlayer } from '../../../hooks/useMockMatch.js';

function makePlayers(ids: string[]): Record<string, MockPlayer> {
  return Object.fromEntries(
    ids.map((id) => [
      id,
      {
        id,
        nickname: id,
        avatarSeed: 0,
        faction: id === 'M' ? 'master' : 'thief',
        characterId: '',
        isRevealed: false,
        currentLayer: 1,
        hand: null,
        handCount: 0,
        isAlive: true,
      } satisfies MockPlayer,
    ]),
  );
}

describe('computeRailSlots', () => {
  it('viewer 是盗梦者：梦主在首位，其他盗梦者按 playerOrder', () => {
    const slots = computeRailSlots({
      playerOrder: ['T1', 'T2', 'M', 'T3'],
      players: makePlayers(['T1', 'T2', 'M', 'T3']),
      viewerID: 'T1',
      masterID: 'M',
      currentPlayerID: 'T2',
    });
    expect(slots.map((s) => s.id)).toEqual(['M', 'T2', 'T3']);
    expect(slots[0]!.isMaster).toBe(true);
    expect(slots.find((s) => s.id === 'T2')!.isCurrent).toBe(true);
  });

  it('viewer 是梦主：Rail 不含梦主 slot，直接从盗梦者开始', () => {
    const slots = computeRailSlots({
      playerOrder: ['T1', 'T2', 'M', 'T3'],
      players: makePlayers(['T1', 'T2', 'M', 'T3']),
      viewerID: 'M',
      masterID: 'M',
      currentPlayerID: 'M',
    });
    expect(slots.map((s) => s.id)).toEqual(['T1', 'T2', 'T3']);
    expect(slots.every((s) => !s.isMaster)).toBe(true);
  });

  it('viewer 永远不出现在 Rail', () => {
    const slots = computeRailSlots({
      playerOrder: ['T1', 'T2', 'T3', 'M'],
      players: makePlayers(['T1', 'T2', 'T3', 'M']),
      viewerID: 'T2',
      masterID: 'M',
      currentPlayerID: 'T1',
    });
    expect(slots.map((s) => s.id)).not.toContain('T2');
  });

  it('index 按 slot 顺序递增', () => {
    const slots = computeRailSlots({
      playerOrder: ['T1', 'T2', 'M', 'T3'],
      players: makePlayers(['T1', 'T2', 'M', 'T3']),
      viewerID: 'T1',
      masterID: 'M',
      currentPlayerID: 'T3',
    });
    expect(slots.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it('isCurrent 标志只标记当前玩家', () => {
    const slots = computeRailSlots({
      playerOrder: ['T1', 'T2', 'M'],
      players: makePlayers(['T1', 'T2', 'M']),
      viewerID: 'T1',
      masterID: 'M',
      currentPlayerID: 'M',
    });
    const current = slots.filter((s) => s.isCurrent);
    expect(current).toHaveLength(1);
    expect(current[0]!.id).toBe('M');
  });
});
