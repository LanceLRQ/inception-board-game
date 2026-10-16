// 动画提示：把一步的事件（已按本人座位裁剪）翻成界面要播的一个个动作
// 事件的 data 来自来源，形状不可全信：逐字段检查，认不出的事件或字段直接跳过，不影响对局。
// 阶段、回合、等待名单的变化由横幅与高亮表达，这里不出动画；掷骰另有专门的演出。

import type { MatchEvent } from '@icgame/game-engine';

export type FxCue =
  /** 抽牌：cards 只有抽牌人自己看得到，别人为 null */
  | {
      readonly kind: 'draw';
      readonly player: string;
      readonly count: number;
      readonly cards: readonly string[] | null;
    }
  | { readonly kind: 'play'; readonly player: string; readonly card: string }
  /** 弃牌：player 为 null 表示不是从谁手里弃的（翻开的牌库顶等） */
  | { readonly kind: 'discard'; readonly player: string | null; readonly cards: readonly string[] }
  | {
      readonly kind: 'transfer';
      readonly from: string;
      readonly to: string;
      readonly count: number;
      readonly cards: readonly string[] | null;
    }
  | { readonly kind: 'move'; readonly player: string; readonly from: number; readonly to: number }
  | { readonly kind: 'died'; readonly player: string; readonly layer: number }
  | { readonly kind: 'revived'; readonly player: string; readonly layer: number }
  | { readonly kind: 'lock'; readonly layer: number; readonly from: number; readonly to: number }
  | { readonly kind: 'vault'; readonly layer: number; readonly content: string };

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strs = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null;

function discardCues(data: Record<string, unknown>): FxCue[] {
  const cards = strs(data.cards);
  if (!cards || cards.length === 0) return [];
  const rest = [...cards];
  const cues: FxCue[] = [];
  const from = Array.isArray(data.from) ? data.from : [];
  for (const entry of from) {
    const player = str((entry as { player?: unknown })?.player);
    const count = num((entry as { count?: unknown })?.count);
    if (player === null || count === null || count <= 0) continue;
    cues.push({ kind: 'discard', player, cards: rest.splice(0, count) });
  }
  if (rest.length > 0) cues.push({ kind: 'discard', player: null, cards: rest });
  return cues;
}

function cueOf(ev: MatchEvent): FxCue[] {
  const d = ev.data;
  switch (ev.kind) {
    case 'cards_drawn': {
      const player = str(d.player);
      const count = num(d.count);
      if (player === null || count === null || count <= 0) return [];
      return [{ kind: 'draw', player, count, cards: strs(ev.secret?.data.cards) }];
    }
    case 'card_played': {
      const player = str(d.player);
      const card = str(d.card);
      return player !== null && card !== null ? [{ kind: 'play', player, card }] : [];
    }
    case 'cards_discarded':
      return discardCues(d);
    case 'cards_transferred': {
      const from = str(d.from);
      const to = str(d.to);
      const count = num(d.count);
      if (from === null || to === null || count === null || count <= 0) return [];
      return [{ kind: 'transfer', from, to, count, cards: strs(ev.secret?.data.cards) }];
    }
    case 'player_moved': {
      const player = str(d.player);
      const from = num(d.from);
      const to = num(d.to);
      if (player === null || from === null || to === null) return [];
      // 进出迷失层由击杀 / 复活表达，这里只播层与层之间的移动
      return from > 0 && to > 0 ? [{ kind: 'move', player, from, to }] : [];
    }
    case 'player_died':
    case 'player_revived': {
      const player = str(d.player);
      const layer = num(d.layer);
      if (player === null || layer === null) return [];
      return [{ kind: ev.kind === 'player_died' ? 'died' : 'revived', player, layer }];
    }
    case 'heart_lock_changed': {
      const layer = num(d.layer);
      const from = num(d.from);
      const to = num(d.to);
      return layer !== null && from !== null && to !== null
        ? [{ kind: 'lock', layer, from, to }]
        : [];
    }
    case 'vault_opened': {
      const layer = num(d.layer);
      const content = str(d.content);
      return layer !== null && content !== null ? [{ kind: 'vault', layer, content }] : [];
    }
    default:
      return [];
  }
}

/** 一步的事件 → 动画提示，保持事件顺序 */
export function cuesFromEvents(events: readonly MatchEvent[]): FxCue[] {
  return events.flatMap(cueOf);
}

/** 每种动作的播放时长（毫秒，常速） */
export const CUE_DURATION_MS: Readonly<Record<FxCue['kind'], number>> = {
  draw: 600,
  play: 1200,
  discard: 600,
  transfer: 700,
  move: 700,
  died: 900,
  revived: 900,
  lock: 800,
  vault: 1000,
};
