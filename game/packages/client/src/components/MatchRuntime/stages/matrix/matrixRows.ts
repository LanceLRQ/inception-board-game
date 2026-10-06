// 「梦境矩阵」进程表的纯推导：金库列怎么写、状态列标什么、牌库进度条亮几格
// 只用盘面数据里已有的字段，不编造任何数值或规则文字。

import type { BoardLayer, BoardOccupant, BoardVault } from '../../model/boardModel';

export type VaultCellState =
  | { readonly kind: 'sealed' }
  | { readonly kind: 'sealedKnown'; readonly content: BoardVault['contentType'] }
  | { readonly kind: 'opened'; readonly content: BoardVault['contentType'] };

/** 金库列：已开显示内容；未开且看得到内容（梦主）带上内容，否则只说封存 */
export function vaultCell(vault: Pick<BoardVault, 'opened' | 'contentType'>): VaultCellState {
  if (vault.opened) return { kind: 'opened', content: vault.contentType };
  if (vault.contentType !== 'hidden') return { kind: 'sealedKnown', content: vault.contentType };
  return { kind: 'sealed' };
}

export type RowMarker = 'unlocking' | 'here' | 'focus';

/** 状态列的标记：解封进行中 > 本人所在层 > 焦点层 */
export function rowMarker(
  row: Pick<BoardLayer, 'unlocking' | 'hasViewer'>,
  focus: boolean,
): RowMarker | null {
  if (row.unlocking) return 'unlocking';
  if (row.hasViewer) return 'here';
  return focus ? 'focus' : null;
}

/** 牌库进度条的总格数 */
export const DECK_SEGMENTS = 24;

/** 牌库剩余落成亮起的格数；有剩余时至少亮一格 */
export function deckSegments(remaining: number, total: number): number {
  if (!Number.isFinite(remaining) || !Number.isFinite(total) || total <= 0 || remaining <= 0) {
    return 0;
  }
  const ratio = Math.min(1, remaining / total);
  return Math.max(1, Math.round(ratio * DECK_SEGMENTS));
}

/** 占位列的文字：本层各人的称呼用「 · 」连起来；本人写作 selfLabel */
export function nodeNames(
  occupants: readonly Pick<BoardOccupant, 'name' | 'isSelf'>[],
  selfLabel: string,
): string {
  return occupants.map((o) => (o.isSelf ? selfLabel : o.name)).join(' · ');
}
