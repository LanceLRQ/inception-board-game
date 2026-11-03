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

export const GUIDE_CATEGORIES: Readonly<Record<string, string>> = {
  tutorial: '入门与规则',
  action: '行动牌',
  thief: '盗梦者',
  'dream-master': '梦主',
  dream: '梦境牌',
  vault: '金库牌',
  bribe: '贿赂牌',
  nightmare: '梦魇牌',
  other: '道具与配置',
};

export function guideEntries(category: string, query = '') {
  const entries =
    category === 'tutorial'
      ? content.chapters.map((c) => ({
          id: c.id,
          name: c.name,
          text: c.text,
          image: undefined as string | undefined,
        }))
      : Object.values(CARD_REFERENCES)
          .filter((c) => c.category === category)
          .map((c) => ({ id: c.id, name: c.name, text: c.fullText, image: c.imagePath }));
  const needle = query.trim().toLocaleLowerCase();
  return entries.filter((entry) =>
    `${entry.name} ${entry.text}`.toLocaleLowerCase().includes(needle),
  );
}
