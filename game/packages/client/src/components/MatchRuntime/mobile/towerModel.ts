// 移动布局层塔的纯推导：层级标签、每层一行的数据、焦点层
// 只读按座位裁剪后的视图（经 StageState 转换）；梦主能看到的额外信息（未翻开的梦魇、
// 未开金库的内容）取决于视图里是否带了这些字段，这里不做任何权限判断，有什么显示什么。

import type { MatchView } from '@icgame/game-engine';
import type { StageState, StageVault } from '../stageState';

/** 层塔从上到下的层号：第 4 层在上，最下是迷失层 */
export const TOWER_LAYERS = [4, 3, 2, 1, 0] as const;

/** 金库内容在界面里用的卡面编号（与桌面中央面板一致） */
export type VaultFace = 'vault_back' | 'vault_secret' | 'vault_gold';

export interface TowerVault {
  readonly id: string;
  readonly opened: boolean;
  readonly contentType: StageVault['contentType'];
  /** 缩略图与详情用的卡面：未开的金库一律是背面 */
  readonly face: VaultFace;
}

export interface TowerNightmare {
  readonly revealed: boolean;
  /** 能看到的梦魇牌；看不到（盗梦者面对未翻开的梦魇）为 null */
  readonly cardId: string | null;
}

export interface TowerOccupant {
  readonly id: string;
  readonly name: string;
  readonly isSelf: boolean;
  readonly isMaster: boolean;
  readonly isCurrent: boolean;
}

export interface TowerRow {
  readonly layer: number;
  readonly heartLock: number;
  readonly vaults: readonly TowerVault[];
  /** 这一层有梦魇信息可显示才有值 */
  readonly nightmare: TowerNightmare | null;
  readonly occupants: readonly TowerOccupant[];
  /** 本人所在层 */
  readonly hasViewer: boolean;
}

const OPENED_FACE: Record<'secret' | 'coin' | 'empty', VaultFace> = {
  secret: 'vault_secret',
  coin: 'vault_gold',
  empty: 'vault_back',
};

/** 一座金库的展示数据；已开的金库按内容显示卡面，未开的显示背面 */
export function towerVaultOf(vault: StageVault): TowerVault {
  const face =
    vault.isOpened && vault.contentType !== 'hidden'
      ? OPENED_FACE[vault.contentType]
      : 'vault_back';
  return { id: vault.id, opened: vault.isOpened, contentType: vault.contentType, face };
}

/** 构造层塔每一层的数据（顺序见 TOWER_LAYERS） */
export function buildTowerRows(
  state: StageState,
  layersView: MatchView['layers'] | undefined,
): TowerRow[] {
  const viewer = state.players[state.viewerID];
  return TOWER_LAYERS.map((layer) => {
    const stageLayer = state.layers[layer];
    const raw = layersView?.[layer];
    const ids = stageLayer?.playersInLayer ?? [];
    // 迷失层按玩家当前所在层补齐：被淘汰的玩家也可能不在 playersInLayer 里
    const inLayer =
      layer === 0
        ? Object.values(state.players)
            .filter((p) => p.currentLayer === 0 || !p.isAlive)
            .map((p) => p.id)
        : ids;
    const occupants: TowerOccupant[] = [...new Set(inLayer)].flatMap((id) => {
      const p = state.players[id];
      if (!p) return [];
      return [
        {
          id,
          name: p.nickname,
          isSelf: id === state.viewerID,
          isMaster: id === state.dreamMasterID,
          isCurrent: id === state.currentPlayerID,
        },
      ];
    });

    let nightmare: TowerNightmare | null = null;
    if (raw) {
      const cardId = raw.nightmareId ?? null;
      if (raw.nightmareRevealed || cardId) {
        nightmare = { revealed: !!raw.nightmareRevealed, cardId };
      }
    } else if (stageLayer?.nightmareRevealed) {
      nightmare = { revealed: true, cardId: null };
    }

    return {
      layer,
      heartLock: stageLayer?.heartLockValue ?? 0,
      vaults: state.vaults.filter((v) => v.layer === layer).map(towerVaultOf),
      nightmare,
      occupants,
      hasViewer: !!viewer && viewer.currentLayer === layer,
    };
  });
}

/** 焦点层的选择：点按标签时记下当时本人所在的层 */
export interface FocusPick {
  readonly layer: number;
  readonly viewerLayer: number;
}

/**
 * 焦点层：缺省为本人所在层；点按标签后固定在所选层，直到本人换层，之后重新跟随本人。
 */
export function resolveFocusLayer(pick: FocusPick | null, viewerLayer: number): number {
  return pick && pick.viewerLayer === viewerLayer ? pick.layer : viewerLayer;
}

/** 层级标签：层号、心锁值、是否有金库已开 */
export interface LayerChip {
  readonly layer: number;
  readonly heartLock: number;
  readonly anyVaultOpened: boolean;
}

export function buildLayerChips(rows: readonly TowerRow[]): LayerChip[] {
  // 标签从迷失层到第 4 层，与原型一致
  return [...rows]
    .sort((a, b) => a.layer - b.layer)
    .map((r) => ({
      layer: r.layer,
      heartLock: r.heartLock,
      anyVaultOpened: r.vaults.some((v) => v.opened),
    }));
}

/** 展开手牌坞时层塔只保留焦点层 */
export function visibleTowerRows(
  rows: readonly TowerRow[],
  focusLayer: number,
  dockOpen: boolean,
): TowerRow[] {
  return dockOpen ? rows.filter((r) => r.layer === focusLayer) : [...rows];
}

/** 焦点层多出来的一行说明：解封进行中点名发起者，否则说这一层有几个人 */
export function deriveFocusNote(
  row: TowerRow,
  pendingUnlock: { playerID: string; layer: number } | null | undefined,
  nicknameOf: (playerID: string) => string,
): { key: string; params: Record<string, string | number> } {
  if (pendingUnlock && pendingUnlock.layer === row.layer) {
    return { key: 'mobile.tower.noteUnlock', params: { name: nicknameOf(pendingUnlock.playerID) } };
  }
  if (row.occupants.length === 0) return { key: 'mobile.tower.noteEmpty', params: {} };
  return { key: 'mobile.tower.noteOccupants', params: { n: row.occupants.length } };
}
