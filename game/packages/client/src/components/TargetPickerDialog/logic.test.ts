// orderCandidates 纯函数测试
// 对照：plans/design/06c-match-table-layout.md §5.3

import { describe, it, expect } from 'vitest';
import { orderCandidates } from './logic.js';
import type { MockMatchState, MockPlayer } from '../../hooks/useMockMatch.js';

function mkPlayer(id: string, overrides: Partial<MockPlayer> = {}): MockPlayer {
  return {
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
    ...overrides,
  };
}

function mkState(
  playerOrder: string[],
  viewerID: string,
  playerOverrides: Record<string, Partial<MockPlayer>> = {},
): MockMatchState {
  const players: Record<string, MockPlayer> = {};
  for (const id of playerOrder) {
    players[id] = mkPlayer(id, playerOverrides[id] ?? {});
  }
  return {
    matchId: 'test',
    viewerID,
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 1,
    currentPlayerID: viewerID,
    dreamMasterID: 'M',
    players,
    playerOrder,
    layers: {},
    vaults: [],
    deckCount: 0,
    discardPile: [],
    pendingUnlock: null,
  };
}

describe('orderCandidates', () => {
  it('按 playerOrder 顺序输出，剔除 viewer 自己', () => {
    const state = mkState(['T1', 'T2', 'M', 'T3'], 'T2');
    const r = orderCandidates({
      state,
      viewerID: 'T2',
      legalTargetIds: new Set(['T1', 'T3']),
    });
    expect(r.map((c) => c.playerID)).toEqual(['T1', 'M', 'T3']);
  });

  it('legalTargetIds 中的玩家 isLegal=true，其余 isLegal=false 且有 illegalReason', () => {
    const state = mkState(['T1', 'T2', 'M'], 'T1');
    const r = orderCandidates({
      state,
      viewerID: 'T1',
      legalTargetIds: new Set(['M']),
    });
    expect(r.find((c) => c.playerID === 'M')!.isLegal).toBe(true);
    const t2 = r.find((c) => c.playerID === 'T2')!;
    expect(t2.isLegal).toBe(false);
    expect(t2.illegalReason).toBe('非合法目标');
  });

  it('已死亡玩家 isLegal=false，illegalReason=已死亡', () => {
    const state = mkState(['T1', 'T2'], 'T1', {
      T2: { isAlive: false },
    });
    const r = orderCandidates({
      state,
      viewerID: 'T1',
      legalTargetIds: new Set(['T2']), // 即便 engine 误判为合法，isAlive=false 也必须视为非法
    });
    expect(r[0]!.isLegal).toBe(false);
    expect(r[0]!.illegalReason).toBe('已死亡');
  });

  it('盗梦者未翻露 → characterCardId=null（显示背面）', () => {
    const state = mkState(['T1', 'T2'], 'T1', {
      T2: { characterId: 'thief_pointman', isRevealed: false },
    });
    const r = orderCandidates({
      state,
      viewerID: 'T1',
      legalTargetIds: new Set(['T2']),
    });
    expect(r[0]!.characterCardId).toBeNull();
  });

  it('盗梦者已翻露 → characterCardId=真实 id', () => {
    const state = mkState(['T1', 'T2'], 'T1', {
      T2: { characterId: 'thief_pointman', isRevealed: true },
    });
    const r = orderCandidates({
      state,
      viewerID: 'T1',
      legalTargetIds: new Set(['T2']),
    });
    expect(r[0]!.characterCardId).toBe('thief_pointman');
  });

  it('梦主永远显示真实 characterId（不受 isRevealed 限制）', () => {
    const state = mkState(['T1', 'M'], 'T1', {
      M: { faction: 'master', characterId: 'dm_jupiter', isRevealed: false },
    });
    const r = orderCandidates({
      state,
      viewerID: 'T1',
      legalTargetIds: new Set(['M']),
    });
    expect(r.find((c) => c.playerID === 'M')!.characterCardId).toBe('dm_jupiter');
  });

  it('空候选：playerOrder 中只有 viewer', () => {
    const state = mkState(['T1'], 'T1');
    const r = orderCandidates({
      state,
      viewerID: 'T1',
      legalTargetIds: new Set(),
    });
    expect(r).toHaveLength(0);
  });
});
