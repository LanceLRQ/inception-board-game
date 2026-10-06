// adaptViewToStage 纯函数测试

import { describe, it, expect } from 'vitest';
import type { MatchView, RunnerCtx } from '@icgame/game-engine';
import { adaptViewToStage } from './viewAdapter.js';

/** 测试里只构造用到的字段，整体按视图类型传入 */
function asView(g: object): MatchView {
  return g as unknown as MatchView;
}

const sampleRaw = {
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
      handCount: 2,
      isAlive: true,
    },
    '1': {
      nickname: 'AI 1',
      faction: 'thief',
      characterId: 'thief_space_queen',
      isRevealed: true,
      currentLayer: 1,
      hand: null,
      handCount: 1,
      isAlive: true,
    },
    '4': {
      nickname: '梦主',
      faction: 'master',
      characterId: 'dm_jupiter',
      isRevealed: true,
      currentLayer: 0,
      hand: null,
      handCount: 1,
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

const sampleG = asView(sampleRaw);

const sampleCtx = { currentPlayer: '0' } as RunnerCtx;

describe('adaptViewToStage', () => {
  it('G=null/ctx=null：返回 null', () => {
    expect(
      adaptViewToStage({ G: asView({}), ctx: {} as RunnerCtx, humanPlayerID: '0' }),
    ).toBeNull();
  });

  it('人类（viewer）hand 保留真实卡 id 数组', () => {
    const s = adaptViewToStage({ G: sampleG, ctx: sampleCtx, humanPlayerID: '0' })!;
    expect(s.players['0']!.hand).toEqual(['action_shoot', 'action_unlock']);
    expect(s.players['0']!.handCount).toBe(2);
  });

  it('非人类 hand 过滤为 null，仅保留 handCount', () => {
    const s = adaptViewToStage({ G: sampleG, ctx: sampleCtx, humanPlayerID: '0' })!;
    expect(s.players['1']!.hand).toBeNull();
    expect(s.players['1']!.handCount).toBe(1);
    expect(s.players['4']!.hand).toBeNull();
    expect(s.players['4']!.handCount).toBe(1);
  });

  it('faction 仅保留 thief/master（默认 thief）', () => {
    const s = adaptViewToStage({ G: sampleG, ctx: sampleCtx, humanPlayerID: '0' })!;
    expect(s.players['0']!.faction).toBe('thief');
    expect(s.players['4']!.faction).toBe('master');
  });

  it('currentPlayerID 从 ctx 透传', () => {
    const s = adaptViewToStage({ G: sampleG, ctx: sampleCtx, humanPlayerID: '0' })!;
    expect(s.currentPlayerID).toBe('0');
  });

  it('playerOrder 按 id 排序', () => {
    const s = adaptViewToStage({ G: sampleG, ctx: sampleCtx, humanPlayerID: '0' })!;
    expect(s.playerOrder).toEqual(['0', '1', '4']);
  });

  it('layers 正确映射', () => {
    const s = adaptViewToStage({ G: sampleG, ctx: sampleCtx, humanPlayerID: '0' })!;
    expect(s.layers[2]!.heartLockValue).toBe(2);
    expect(s.layers[1]!.playersInLayer).toEqual(['1']);
  });

  it('vaults 正确映射', () => {
    const s = adaptViewToStage({ G: sampleG, ctx: sampleCtx, humanPlayerID: '0' })!;
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
    const s = adaptViewToStage({ G: sampleG, ctx: sampleCtx, humanPlayerID: '0' })!;
    expect(s.dreamMasterID).toBe('4');
  });

  it('viewerID 默认为 humanPlayerID', () => {
    const s = adaptViewToStage({ G: sampleG, ctx: sampleCtx, humanPlayerID: '0' })!;
    expect(s.viewerID).toBe('0');
  });

  it('turnPhase / turnNumber 透传', () => {
    const s = adaptViewToStage({ G: sampleG, ctx: sampleCtx, humanPlayerID: '0' })!;
    expect(s.turnPhase).toBe('action');
    expect(s.turnNumber).toBe(3);
  });

  it('牌库张数取自 deck.cardCount', () => {
    const G = asView({ ...sampleRaw, deck: { cardCount: 37, discardPile: ['action_kick'] } });
    const s = adaptViewToStage({ G, ctx: sampleCtx, humanPlayerID: '0' })!;
    expect(s.deckCount).toBe(37);
    expect(s.discardPile).toEqual(['action_kick']);
  });

  it('他人手牌数取自 handCount，本人取 hand', () => {
    const G = asView({
      ...sampleRaw,
      players: {
        '0': { ...sampleRaw.players['0'], hand: ['action_shoot'], handCount: 1 },
        '1': { ...sampleRaw.players['1'], hand: null, handCount: 6 },
        '4': { ...sampleRaw.players['4'], hand: null, handCount: 3 },
      },
    });
    const s = adaptViewToStage({ G, ctx: sampleCtx, humanPlayerID: '0' })!;
    expect(s.players['0']!.hand).toEqual(['action_shoot']);
    expect(s.players['0']!.handCount).toBe(1);
    expect(s.players['1']!.hand).toBeNull();
    expect(s.players['1']!.handCount).toBe(6);
    expect(s.players['4']!.handCount).toBe(3);
  });
});
