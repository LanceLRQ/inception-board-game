import { describe, it, expect } from 'vitest';
import type { MatchView } from '@icgame/game-engine';
import { buildFixtureScenario } from '../../../match/fixtures/buildScenario';
import { adaptViewToStage } from '../viewAdapter';
import {
  TOWER_LAYERS,
  buildLayerChips,
  buildTowerRows,
  deriveFocusNote,
  resolveFocusLayer,
  towerVaultOf,
  visibleTowerRows,
} from './towerModel';

function stageOf(id: 'thief' | 'master') {
  const sc = buildFixtureScenario(id);
  const G = sc.view.G as MatchView;
  const state = adaptViewToStage({ G, ctx: sc.view.ctx, humanPlayerID: sc.seat })!;
  return { sc, G, state };
}

describe('buildTowerRows', () => {
  it('从第 4 层到迷失层共 5 行，顺序固定', () => {
    const { state, G } = stageOf('thief');
    const rows = buildTowerRows(state, G.layers);
    expect(rows.map((r) => r.layer)).toEqual([...TOWER_LAYERS]);
    expect(TOWER_LAYERS).toEqual([4, 3, 2, 1, 0]);
  });

  it('心锁值来自视图，本人所在层标 hasViewer', () => {
    const { state, G } = stageOf('thief');
    const rows = buildTowerRows(state, G.layers);
    const viewerLayer = state.players[state.viewerID]!.currentLayer;
    expect(rows.filter((r) => r.hasViewer).map((r) => r.layer)).toEqual([viewerLayer]);
    for (const r of rows) {
      expect(r.heartLock).toBe(state.layers[r.layer]?.heartLockValue ?? 0);
    }
  });

  it('每个玩家只出现在自己所在的层，本人与梦主带标记', () => {
    const { state, G } = stageOf('thief');
    const rows = buildTowerRows(state, G.layers);
    const all = rows.flatMap((r) => r.occupants);
    const ids = all.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(all.find((o) => o.isSelf)?.id).toBe(state.viewerID);
    expect(all.find((o) => o.isMaster)?.id).toBe(state.dreamMasterID);
  });

  it('盗梦者看不到未翻开的梦魇，梦主能看到', () => {
    const t = stageOf('thief');
    const m = stageOf('master');
    const thiefRows = buildTowerRows(t.state, t.G.layers);
    expect(thiefRows.every((r) => r.nightmare === null || r.nightmare.revealed)).toBe(true);
    const masterRows = buildTowerRows(m.state, m.G.layers);
    const hidden = masterRows.filter((r) => r.nightmare && !r.nightmare.revealed);
    for (const r of hidden) expect(r.nightmare!.cardId).not.toBeNull();
  });

  it('金库行：未开的金库显示背面', () => {
    const { state, G } = stageOf('thief');
    const rows = buildTowerRows(state, G.layers);
    for (const r of rows) {
      for (const v of r.vaults) {
        if (!v.opened) expect(v.face).toBe('vault_back');
      }
    }
  });
});

describe('towerVaultOf', () => {
  const base = { id: 'v', layer: 1 };
  it('已开的金库按内容选卡面', () => {
    expect(towerVaultOf({ ...base, isOpened: true, contentType: 'secret' }).face).toBe(
      'vault_secret',
    );
    expect(towerVaultOf({ ...base, isOpened: true, contentType: 'coin' }).face).toBe('vault_gold');
    expect(towerVaultOf({ ...base, isOpened: true, contentType: 'empty' }).face).toBe('vault_back');
  });

  it('未开或内容未知时是背面', () => {
    expect(towerVaultOf({ ...base, isOpened: false, contentType: 'secret' }).face).toBe(
      'vault_back',
    );
    expect(towerVaultOf({ ...base, isOpened: true, contentType: 'hidden' }).face).toBe(
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

describe('buildLayerChips / visibleTowerRows', () => {
  it('标签从迷失层排到第 4 层', () => {
    const { state, G } = stageOf('thief');
    const rows = buildTowerRows(state, G.layers);
    expect(buildLayerChips(rows).map((c) => c.layer)).toEqual([0, 1, 2, 3, 4]);
  });

  it('手牌坞展开时只保留焦点层', () => {
    const { state, G } = stageOf('thief');
    const rows = buildTowerRows(state, G.layers);
    expect(visibleTowerRows(rows, 2, true).map((r) => r.layer)).toEqual([2]);
    expect(visibleTowerRows(rows, 2, false)).toHaveLength(5);
  });
});

describe('deriveFocusNote', () => {
  const { state, G } = stageOf('thief');
  const rows = buildTowerRows(state, G.layers);
  const nameOf = (id: string) => `P${id}`;

  it('解封发生在这一层时点名发起者', () => {
    const row = rows.find((r) => r.layer === 2)!;
    const note = deriveFocusNote(row, { playerID: '3', layer: 2 }, nameOf);
    expect(note).toEqual({ key: 'mobile.tower.noteUnlock', params: { name: 'P3' } });
  });

  it('解封在别的层时说这一层有几个人', () => {
    const row = rows.find((r) => r.occupants.length > 0)!;
    const note = deriveFocusNote(row, { playerID: '3', layer: row.layer === 4 ? 1 : 4 }, nameOf);
    expect(note).toEqual({
      key: 'mobile.tower.noteOccupants',
      params: { n: row.occupants.length },
    });
  });

  it('没有人时说无人', () => {
    const empty = { ...rows[0]!, occupants: [] };
    expect(deriveFocusNote(empty, null, nameOf).key).toBe('mobile.tower.noteEmpty');
  });
});
