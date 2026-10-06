// 「庄周梦蝶」山水长卷的纯推导：金库题注、层标记、牌库进度、占位者、每层山形
// 只用盘面数据里已有的字段，不编造任何数值或规则文字。

import type { BoardLayer, BoardOccupant, BoardVault } from '../../model/boardModel';

export type VaultCaption =
  | { readonly kind: 'closed' }
  | { readonly kind: 'known'; readonly content: BoardVault['contentType'] }
  | { readonly kind: 'opened'; readonly content: BoardVault['contentType'] };

/** 金库题注：已开写内容；未开而看得到内容（梦主）带上内容，否则只说未开 */
export function vaultCaption(vault: Pick<BoardVault, 'opened' | 'contentType'>): VaultCaption {
  if (vault.opened) return { kind: 'opened', content: vault.contentType };
  if (vault.contentType !== 'hidden') return { kind: 'known', content: vault.contentType };
  return { kind: 'closed' };
}

export type RowTag = 'unlocking' | 'here' | 'focus';

/** 层上的小印：解封进行中 > 本人所在层 > 焦点层 */
export function rowTag(
  row: Pick<BoardLayer, 'unlocking' | 'hasViewer'>,
  focus: boolean,
): RowTag | null {
  if (row.unlocking) return 'unlocking';
  if (row.hasViewer) return 'here';
  return focus ? 'focus' : null;
}

/** 牌库剩余占总数的百分比（整数，0–100）；有剩余时至少 1 */
export function deckPercent(remaining: number, total: number): number {
  if (!Number.isFinite(remaining) || !Number.isFinite(total) || total <= 0 || remaining <= 0) {
    return 0;
  }
  return Math.max(1, Math.min(100, Math.round((remaining / total) * 100)));
}

/** 占位者的一行文字：各人用「 · 」连起来；本人写作 selfLabel */
export function occupantLine(
  occupants: readonly Pick<BoardOccupant, 'name' | 'isSelf'>[],
  selfLabel: string,
): string {
  return occupants.map((o) => (o.isSelf ? selfLabel : o.name)).join(' · ');
}

/** 有山的层：第 1–4 层；迷失层在山外，画的是蝶 */
export const RIDGE_LAYERS = [4, 3, 2, 1] as const;

export interface RidgeShape {
  /** 山体填充：闭合路径（视口 0 0 100 40，铺满一层的宽度） */
  readonly fill: string;
  /** 山脊轮廓：开放路径，只描山顶的线 */
  readonly line: string;
}

// 每层的山脊线：越远（层号越大）起伏越高越尖，越近越低越缓。
// 手绘的二次贝塞尔曲线，终点接到右下角闭合。
const RIDGE_LINES: Readonly<Record<(typeof RIDGE_LAYERS)[number], string>> = {
  4: 'M0 24 Q 8 6 17 15 T 33 12 T 52 8 T 70 13 T 86 6 T 100 14',
  3: 'M0 18 Q 10 8 21 16 T 40 11 T 57 17 T 76 9 T 100 15',
  2: 'M0 20 Q 12 11 24 18 T 46 14 T 64 19 T 82 13 T 100 18',
  1: 'M0 22 Q 14 15 28 20 T 52 18 T 74 21 T 100 17',
};

/** 某一层的山形；迷失层与不认识的层号返回 null */
export function ridgeShape(layer: number): RidgeShape | null {
  const line = (RIDGE_LINES as Record<number, string | undefined>)[layer];
  if (!line) return null;
  return { line, fill: `${line} L 100 40 L 0 40 Z` };
}
