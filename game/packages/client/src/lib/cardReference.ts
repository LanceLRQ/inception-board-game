import content from '../components/GameGuide/content.json';

export interface CardReference {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly fullText: string;
  readonly imagePath: string;
}

/** 图鉴和解析共用原版全文，摘要另由牌桌呈现。 */
export const CARD_REFERENCES: Readonly<Record<string, CardReference>> = content.cards;
