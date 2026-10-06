// 卡图加载失败（或占位模式）时的降级内容：卡名文字 + 类别色块，不留破图

import {
  categoryOfImageUrl,
  lookupCardImageUrl,
  type CardImageCategory,
} from '../../lib/cardImages';
import { getCardName } from '../../lib/cards';

/** 各类别用的语义令牌配色（底色 + 文字色）；令牌随主题变，各主题下都分得开 */
export const CATEGORY_TONE: Record<CardImageCategory, string> = {
  thief: 'bg-acc-soft text-acc-bright',
  'dream-master': 'bg-blood/25 text-foreground',
  action: 'bg-panel-2 text-foreground',
  nightmare: 'bg-lock/25 text-foreground',
  vault: 'bg-grade/25 text-foreground',
  bribe: 'bg-ok/25 text-foreground',
  dream: 'bg-panel-2 text-dim',
  other: 'bg-panel-2 text-dim',
};

export interface ArtFallback {
  /** 色块所属类别；认不出为 null（用中性色） */
  readonly category: CardImageCategory | null;
  /** 卡名；认不出具体哪张牌（如通用背面）为 null，由界面按类别显示类别名 */
  readonly name: string | null;
}

/** 按图片地址推出降级内容：explicit 是调用方给的文字，优先于按地址查到的卡名 */
export function artFallbackFor(src: string | undefined, explicit?: string): ArtFallback {
  const hit = lookupCardImageUrl(src);
  const category = hit?.category ?? categoryOfImageUrl(src);
  const name = explicit || (hit ? getCardName(hit.id) : null);
  return { category, name: name || null };
}
