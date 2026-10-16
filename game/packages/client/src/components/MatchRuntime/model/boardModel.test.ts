import { describe, it, expect } from 'vitest';
import type { MatchView } from '@icgame/game-engine';
import { buildFixtureScenario } from '../../../match/fixtures/buildScenario';
import { adaptViewToStage } from './viewAdapter';
import {
  BOARD_LAYERS,
  boardVaultOf,
  buildBoardLayers,
  buildBoardModel,
  buildLayerChips,
  currentCharacterNameOf,
  deriveBanner,
  deriveDeck,
  deriveLayerNote,
  derivePiles,
  dreamCardOf,
  resolveFocusLayer,
  visibleBoardLayers,
} from './boardModel';

const nameOf = (id: string) => `P${id}`;

function stageOf(id: 'thief' | 'master') {
  const sc = buildFixtureScenario(id);
  const G = sc.view.G as MatchView;
  const state = adaptViewToStage({ G, ctx: sc.view.ctx, humanPlayerID: sc.seat })!;
  return { sc, G, state };
}

describe('buildBoardLayers · 占位者头像', () => {
  it('每个占位者带头像种子，与座位上的一致', () => {
    const { state, G } = stageOf('thief');
    const rows = buildBoardLayers(state, G.layers, G.pendingUnlock, nameOf);
    const occupants = rows.flatMap((r) => r.occupants);
    expect(occupants.length).toBeGreaterThan(0);
    for (const o of occupants) expect(o.avatarSeed).toBe(state.players[o.id]!.avatarSeed);
  });
});

describe('buildBoardLayers', () => {
  it('从第 4 层到迷失层共 5 行，顺序固定', () => {
    const { state, G } = stageOf('thief');
    const rows = buildBoardLayers(state, G.layers, G.pendingUnlock, nameOf);
    expect(rows.map((r) => r.layer)).toEqual([...BOARD_LAYERS]);
    expect(BOARD_LAYERS).toEqual([4, 3, 2, 1, 0]);
  });

  it('心锁值来自视图，本人所在层标 hasViewer', () => {
    const { state, G } = stageOf('thief');
    const rows = buildBoardLayers(state, G.layers, G.pendingUnlock, nameOf);
    const viewerLayer = state.players[state.viewerID]!.currentLayer;
    expect(rows.filter((r) => r.hasViewer).map((r) => r.layer)).toEqual([viewerLayer]);
    for (const r of rows) {
      expect(r.heartLock).toBe(state.layers[r.layer]?.heartLockValue ?? 0);
    }
  });

  it('每个玩家只出现在自己所在的层，本人与梦主带标记', () => {
    const { state, G } = stageOf('thief');
    const rows = buildBoardLayers(state, G.layers, G.pendingUnlock, nameOf);
    const all = rows.flatMap((r) => r.occupants);
    const ids = all.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(all.find((o) => o.isSelf)?.id).toBe(state.viewerID);
    expect(all.find((o) => o.isMaster)?.id).toBe(state.dreamMasterID);
  });

  it('盗梦者看不到未翻开的梦魇，梦主能看到', () => {
    const t = stageOf('thief');
    const m = stageOf('master');
    const thiefRows = buildBoardLayers(t.state, t.G.layers, null, nameOf);
    expect(thiefRows.every((r) => r.nightmare === null || r.nightmare.revealed)).toBe(true);
    const masterRows = buildBoardLayers(m.state, m.G.layers, null, nameOf);
    const hidden = masterRows.filter((r) => r.nightmare && !r.nightmare.revealed);
    for (const r of hidden) expect(r.nightmare!.cardId).not.toBeNull();
  });

  it('金库行：未开的金库显示背面', () => {
    const { state, G } = stageOf('thief');
    const rows = buildBoardLayers(state, G.layers, G.pendingUnlock, nameOf);
    for (const r of rows) {
      for (const v of r.vaults) {
        if (!v.opened) expect(v.face).toBe('vault_back');
      }
    }
  });
});

describe('dreamCardOf', () => {
  it('每一层取对应的原版梦境牌，迷失层是灰色那张', () => {
    expect(dreamCardOf(0)).toBe('dream_limbo');
    expect([1, 2, 3, 4].map(dreamCardOf)).toEqual(['dream_1', 'dream_2', 'dream_3', 'dream_4']);
  });

  it('每一行带着自己的梦境牌', () => {
    const { state, G } = stageOf('thief');
    const rows = buildBoardLayers(state, G.layers, G.pendingUnlock, nameOf);
    for (const r of rows) expect(r.dreamCardId).toBe(dreamCardOf(r.layer));
  });
});

describe('derivePiles', () => {
  it('弃牌堆整堆公开、堆顶在最后；本回合出牌照视图给出', () => {
    const { state, G } = stageOf('thief');
    const piles = derivePiles(
      { ...state, discardPile: ['action_kick', 'action_shoot'] },
      { ...G, playedCardsThisTurn: ['action_unlock'] },
    );
    expect(piles.discard).toEqual(['action_kick', 'action_shoot']);
    expect(piles.played).toEqual(['action_unlock']);
  });

  it('没有视图时本回合出牌为空', () => {
    const { state } = stageOf('thief');
    expect(derivePiles(state, undefined).played).toEqual([]);
  });
});

describe('boardVaultOf', () => {
  const base = { id: 'v', layer: 1 };
  it('已开的金库按内容选卡面', () => {
    expect(boardVaultOf({ ...base, isOpened: true, contentType: 'secret' }).face).toBe(
      'vault_secret',
    );
    expect(boardVaultOf({ ...base, isOpened: true, contentType: 'coin' }).face).toBe('vault_gold');
    expect(boardVaultOf({ ...base, isOpened: true, contentType: 'empty' }).face).toBe('vault_back');
  });

  it('未开或内容未知时是背面', () => {
    expect(boardVaultOf({ ...base, isOpened: false, contentType: 'secret' }).face).toBe(
      'vault_back',
    );
    expect(boardVaultOf({ ...base, isOpened: true, contentType: 'hidden' }).face).toBe(
      'vault_back',
    );
  });
});

describe('resolveFocusLayer', () => {
  it('没有点选时跟随本人所在层', () => {
    expect(resolveFocusLayer(null, 2)).toBe(2);
  });

  it('点选后固定在所选层', () => {
    expect(resolveFocusLayer({ layer: 4, viewerLayer: 2 }, 2)).toBe(4);
  });

  it('本人换层后重新跟随', () => {
    expect(resolveFocusLayer({ layer: 4, viewerLayer: 2 }, 3)).toBe(3);
  });
});

describe('buildLayerChips / visibleBoardLayers', () => {
  it('标签从迷失层排到第 4 层', () => {
    const { state, G } = stageOf('thief');
    const rows = buildBoardLayers(state, G.layers, G.pendingUnlock, nameOf);
    expect(buildLayerChips(rows).map((c) => c.layer)).toEqual([0, 1, 2, 3, 4]);
  });

  it('手牌坞展开时只保留焦点层', () => {
    const { state, G } = stageOf('thief');
    const rows = buildBoardLayers(state, G.layers, G.pendingUnlock, nameOf);
    expect(visibleBoardLayers(rows, 2, true).map((r) => r.layer)).toEqual([2]);
    expect(visibleBoardLayers(rows, 2, false)).toHaveLength(5);
  });
});

describe('deriveLayerNote', () => {
  const { state, G } = stageOf('thief');
  const rows = buildBoardLayers(state, G.layers, G.pendingUnlock, nameOf);
  it('解封发生在这一层时点名发起者', () => {
    const row = rows.find((r) => r.layer === 2)!;
    const note = deriveLayerNote(row, { playerID: '3', layer: 2 }, nameOf);
    expect(note).toEqual({ key: 'board.tower.noteUnlock', params: { name: 'P3' } });
  });

  it('解封在别的层时说这一层有几个人', () => {
    const row = rows.find((r) => r.occupants.length > 0)!;
    const note = deriveLayerNote(row, { playerID: '3', layer: row.layer === 4 ? 1 : 4 }, nameOf);
    expect(note).toEqual({
      key: 'board.tower.noteOccupants',
      params: { n: row.occupants.length },
    });
  });

  it('没有人时说无人', () => {
    const empty = { ...rows[0]!, occupants: [] };
    expect(deriveLayerNote(empty, null, nameOf).key).toBe('board.tower.noteEmpty');
  });
});

describe('buildBoardLayers · 解封与占位者', () => {
  it('解封发生的层标 unlocking，其余层不标', () => {
    const { state, G } = stageOf('thief');
    const layers = buildBoardLayers(state, G.layers, { playerID: '3', layer: 2 }, nameOf);
    expect(layers.filter((l) => l.unlocking).map((l) => l.layer)).toEqual([2]);
    expect(layers.find((l) => l.layer === 2)!.note.key).toBe('board.tower.noteUnlock');
  });

  it('占位者的角色照视图给出（角色牌开局全员翻开）', () => {
    const { state, G } = stageOf('thief');
    const occupants = buildBoardLayers(state, G.layers, null, nameOf).flatMap((l) => l.occupants);
    for (const o of occupants) {
      const p = state.players[o.id]!;
      expect(o.characterId).toBe(p.characterId || null);
      expect(o.characterName !== null).toBe(o.characterId !== null && !!o.characterName);
    }
  });
});

describe('deriveBanner', () => {
  it('本人回合与别人回合用不同的文案键', () => {
    const mine = deriveBanner({
      isMine: true,
      actorName: '我',
      characterName: null,
      phase: 'draw',
    });
    expect(mine.key).toBe('board.banner.mine');
    expect(mine.mine).toBe(true);
    expect(mine.phaseKey).toBe('localMatch.phase.draw');
    const other = deriveBanner({
      isMine: false,
      actorName: '白鸦',
      characterName: '小丑',
      phase: 'action',
    });
    expect(other.key).toBe('board.banner.other');
    expect(other.mine).toBe(false);
    expect(other.params).toEqual({ actor: '白鸦 · 小丑' });
  });

  it('角色未翻开时只写昵称', () => {
    const b = deriveBanner({
      isMine: false,
      actorName: '眠者',
      characterName: null,
      phase: 'draw',
    });
    expect(b.params).toEqual({ actor: '眠者' });
  });
});

describe('deriveDeck', () => {
  it('总数不小于剩余，且包含弃牌堆与各人手牌', () => {
    const { state, G } = stageOf('thief');
    const deck = deriveDeck(state, G);
    const hands = Object.values(state.players).reduce((n, p) => n + p.handCount, 0);
    expect(deck.remaining).toBe(state.deckCount);
    expect(deck.total).toBe(
      state.deckCount + state.discardPile.length + hands + G.removedFromGame.length,
    );
    expect(deck.total).toBeGreaterThanOrEqual(deck.remaining);
  });
});

describe('buildBoardModel', () => {
  it('汇总各层、牌库、横幅与焦点层', () => {
    const { state, G } = stageOf('thief');
    const board = buildBoardModel({
      state,
      view: G,
      focusLayer: 2,
      activity: null,
      nicknameOf: nameOf,
    });
    expect(board.layers.map((l) => l.layer)).toEqual([...BOARD_LAYERS]);
    expect(board.focusLayer).toBe(2);
    expect(board.viewerLayer).toBe(state.players[state.viewerID]!.currentLayer);
    expect(board.turn).toEqual({ number: state.turnNumber, phase: state.turnPhase });
    expect(board.banner.key).toBe('board.banner.mine');
    expect(board.activity).toBeNull();
  });

  it('没有视图时仍能由状态构造', () => {
    const { state } = stageOf('thief');
    const board = buildBoardModel({
      state,
      view: undefined,
      focusLayer: 1,
      activity: null,
      nicknameOf: nameOf,
    });
    expect(board.deck.remaining).toBe(state.deckCount);
    expect(board.piles.discard).toEqual(state.discardPile);
  });
});

describe('currentCharacterNameOf', () => {
  it('本人行动时给出本人角色名', () => {
    const { state } = stageOf('thief');
    expect(state.currentPlayerID).toBe(state.viewerID);
    expect(currentCharacterNameOf(state)).toBeTruthy();
  });

  it('行动者的角色名照视图给出；视图里还没有角色时没有名字', () => {
    const { state } = stageOf('thief');
    const other = state.playerOrder.find(
      (id) => id !== state.viewerID && id !== state.dreamMasterID && !state.players[id]!.isRevealed,
    )!;
    expect(currentCharacterNameOf({ ...state, currentPlayerID: other })).toBeTruthy();
    const blank = {
      ...state,
      currentPlayerID: other,
      players: {
        ...state.players,
        [other]: { ...state.players[other]!, characterId: '' as const },
      },
    };
    expect(currentCharacterNameOf(blank)).toBeNull();
  });
});
