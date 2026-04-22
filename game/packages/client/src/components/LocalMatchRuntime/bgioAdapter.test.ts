// adaptBGIOtoMockState 纯函数测试
// 对照：plans/design/06c-match-table-layout.md

import { describe, it, expect } from 'vitest';
import { adaptBGIOtoMockState } from './bgioAdapter.js';

const sampleG = {
  turnPhase: 'action',
  turnNumber: 3,
  dreamMasterID: '4',
  players: {
    '0': {
      nickname: '我',
      faction: 'thief',
      characterId: 'thief_pointman',
      isRevealed: false,
      currentLayer: 2,
      hand: ['action_shoot', 'action_unlock'],
      isAlive: true,
    },
    '1': {
      nickname: 'AI 1',
      faction: 'thief',
      characterId: 'thief_space_queen',
      isRevealed: true,
      currentLayer: 1,
      hand: ['action_shoot'],
      isAlive: true,
    },
    '4': {
      nickname: '梦主',
      faction: 'master',
      characterId: 'dm_jupiter',
      isRevealed: true,
      currentLayer: 0,
      hand: ['action_kick'],
      isAlive: true,
    },
  },
  layers: {
    1: { layer: 1, heartLockValue: 3, playersInLayer: ['1'], nightmareRevealed: false },
    2: { layer: 2, heartLockValue: 2, playersInLayer: ['0'], nightmareRevealed: false },
  },
  vaults: [
    { id: 'v1', layer: 1, contentType: 'secret', isOpened: false },
    { id: 'v2', layer: 2, contentType: 'coin', isOpened: true },
  ],
  pendingUnlock: null,
};

const sampleCtx = {
  currentPlayer: '0',
};

describe('adaptBGIOtoMockState', () => {
  it('G=null/ctx=null：返回 null', () => {
    expect(adaptBGIOtoMockState({ G: {}, ctx: {} })).toBeNull();
  });

  it('人类（viewer）hand 保留真实卡 id 数组', () => {
    const s = adaptBGIOtoMockState({ G: sampleG, ctx: sampleCtx, humanPlayerID: '0' })!;
    expect(s.players['0']!.hand).toEqual(['action_shoot', 'action_unlock']);
    expect(s.players['0']!.handCount).toBe(2);
  });

  it('非人类 hand 过滤为 null，仅保留 handCount', () => {
    const s = adaptBGIOtoMockState({ G: sampleG, ctx: sampleCtx, humanPlayerID: '0' })!;
    expect(s.players['1']!.hand).toBeNull();
    expect(s.players['1']!.handCount).toBe(1);
    expect(s.players['4']!.hand).toBeNull();
    expect(s.players['4']!.handCount).toBe(1);
  });

  it('faction 仅保留 thief/master（默认 thief）', () => {
    const s = adaptBGIOtoMockState({ G: sampleG, ctx: sampleCtx })!;
    expect(s.players['0']!.faction).toBe('thief');
    expect(s.players['4']!.faction).toBe('master');
  });

  it('currentPlayerID 从 ctx 透传', () => {
    const s = adaptBGIOtoMockState({ G: sampleG, ctx: sampleCtx })!;
    expect(s.currentPlayerID).toBe('0');
  });

  it('playerOrder 按 id 排序', () => {
    const s = adaptBGIOtoMockState({ G: sampleG, ctx: sampleCtx })!;
    expect(s.playerOrder).toEqual(['0', '1', '4']);
  });

  it('layers 正确映射', () => {
    const s = adaptBGIOtoMockState({ G: sampleG, ctx: sampleCtx })!;
    expect(s.layers[2]!.heartLockValue).toBe(2);
    expect(s.layers[1]!.playersInLayer).toEqual(['1']);
  });

  it('vaults 正确映射', () => {
    const s = adaptBGIOtoMockState({ G: sampleG, ctx: sampleCtx })!;
    expect(s.vaults).toHaveLength(2);
    expect(s.vaults[0]).toMatchObject({
      id: 'v1',
      layer: 1,
      contentType: 'secret',
      isOpened: false,
    });
    expect(s.vaults[1]).toMatchObject({ id: 'v2', contentType: 'coin', isOpened: true });
  });

  it('dreamMasterID 透传', () => {
    const s = adaptBGIOtoMockState({ G: sampleG, ctx: sampleCtx })!;
    expect(s.dreamMasterID).toBe('4');
  });

  it('viewerID 默认为 humanPlayerID', () => {
    const s = adaptBGIOtoMockState({ G: sampleG, ctx: sampleCtx, humanPlayerID: '0' })!;
    expect(s.viewerID).toBe('0');
  });

  it('turnPhase / turnNumber 透传', () => {
    const s = adaptBGIOtoMockState({ G: sampleG, ctx: sampleCtx })!;
    expect(s.turnPhase).toBe('action');
    expect(s.turnNumber).toBe(3);
  });
});
