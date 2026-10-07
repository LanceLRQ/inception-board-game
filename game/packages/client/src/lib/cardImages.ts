// cardId → 卡图 URL 映射（UI 素材接入最小版）
//
// 数据源：@icgame/shared 的 generated/cards.ts 里每张卡的 imagePath 字段
// （由 shared/scripts/codegen.ts 从内部素材目录下的 cards-data.json 生成，
//  且扩展名被 normalizeImagePath 强制转为 .webp）
//
// 静态资源路径：game/packages/client/public/cards/**（由 `pnpm assets:sync` 生成）
// 部署路径：/cards/**（Vite 会把 public/ 原样拷到 dist/）

import {
  THIEF_CHARACTERS,
  MASTER_CHARACTERS,
  ACTION_CARDS,
  NIGHTMARE_CARDS,
  DREAM_CARDS,
  VAULT_CARDS,
  BRIBE_CARDS,
  CARD_BACK_IMAGES,
} from '@icgame/shared';

const PUBLIC_PREFIX = '/cards/';

/** 卡图在 public/cards 下的分类目录；与素材目录的分类一致 */
export type CardImageCategory =
  | 'thief'
  | 'dream-master'
  | 'action'
  | 'bribe'
  | 'dream'
  | 'nightmare'
  | 'vault'
  | 'other';

interface ImageEntry {
  readonly front: string;
  readonly back?: string;
  readonly category: CardImageCategory;
  /** 通用背面：界面按固定 id 取图，但它不是卡牌，不参与按地址反查卡牌 */
  readonly isGenericBack?: boolean;
}

/** 界面里按固定 id 取用的通用背面（如金库未翻开时的 vault_back）；图片路径来自 shared 的通用背面导出 */
const GENERIC_BACK_ENTRIES: ReadonlyArray<[string, CardImageCategory, string]> = [
  ['action_back', 'action', CARD_BACK_IMAGES.action],
  ['nightmare_back', 'nightmare', CARD_BACK_IMAGES.nightmare],
  ['vault_back', 'vault', CARD_BACK_IMAGES.vault],
  ['bribe_back', 'bribe', CARD_BACK_IMAGES.bribe],
];

function buildImageMap(): ReadonlyMap<string, ImageEntry> {
  const map = new Map<string, ImageEntry>();
  const groups: ReadonlyArray<[CardImageCategory, ReadonlyArray<object>]> = [
    ['thief', THIEF_CHARACTERS],
    ['dream-master', MASTER_CHARACTERS],
    ['action', ACTION_CARDS],
    ['nightmare', NIGHTMARE_CARDS],
    ['dream', DREAM_CARDS],
    ['vault', VAULT_CARDS],
    ['bribe', BRIBE_CARDS],
  ];
  for (const [category, cards] of groups) {
    for (const card of cards as ReadonlyArray<{
      id?: string;
      imagePath?: string;
      backImagePath?: string;
    }>) {
      const front = card.imagePath;
      if (!card.id || !front) continue;
      map.set(card.id, {
        front: PUBLIC_PREFIX + encodeURI(front),
        ...(card.backImagePath ? { back: PUBLIC_PREFIX + encodeURI(card.backImagePath) } : {}),
        category,
      });
    }
  }
  for (const [id, category, path] of GENERIC_BACK_ENTRIES) {
    map.set(id, { front: PUBLIC_PREFIX + encodeURI(path), category, isGenericBack: true });
  }
  return map;
}

const IMAGE_MAP = buildImageMap();

/** 通用角色背面图（未揭示身份时展示） */
export const GENERIC_BACK_IMAGES = {
  thief: PUBLIC_PREFIX + encodeURI(CARD_BACK_IMAGES.thief),
  master: PUBLIC_PREFIX + encodeURI(CARD_BACK_IMAGES.master),
} as const;

/**
 * 通过 cardId 查询卡图的可访问 URL。
 * @param cardId 数据库 ID（如 thief_space_queen / action_shoot）
 * @returns 形如 `/cards/thief/...webp` 的相对路径；未登记则 undefined
 */
export function getCardImageUrl(cardId: string | null | undefined): string | undefined {
  if (!cardId) return undefined;
  return IMAGE_MAP.get(cardId)?.front;
}

/**
 * 获取双面卡牌的背面图 URL；单面卡或未登记返回 undefined。
 * 用于 CardDetailModal 翻面预览。
 */
export function getCardBackImageUrl(cardId: string | null | undefined): string | undefined {
  if (!cardId) return undefined;
  return IMAGE_MAP.get(cardId)?.back;
}

/** 判断一张卡是否为双面（有背面图） */
export function hasCardBackImage(cardId: string | null | undefined): boolean {
  if (!cardId) return false;
  return !!IMAGE_MAP.get(cardId)?.back;
}

/** 已登记的卡牌总数（测试/诊断用） */
export function getCardImageCount(): number {
  return IMAGE_MAP.size;
}

/** 卡图目录中的一项：卡牌 id、分类与正面图地址；双面卡另给背面图 */
export interface CardImageRecord {
  readonly id: string;
  readonly category: CardImageCategory;
  readonly url: string;
  readonly backUrl?: string;
}

/** 全部已登记的卡图，含界面按固定 id 取用的通用背面；顺序稳定 */
export function getCardImageCatalog(): CardImageRecord[] {
  return [...IMAGE_MAP].map(([id, e]) => ({
    id,
    category: e.category,
    url: e.front,
    ...(e.back ? { backUrl: e.back } : {}),
  }));
}

/** 卡图地址反查：卡牌 id 与分类；不是已登记的卡图返回 null（通用背面、占位等） */
const URL_INDEX: ReadonlyMap<string, { id: string; category: CardImageCategory }> = new Map(
  [...IMAGE_MAP].flatMap(([id, e]) => {
    if (e.isGenericBack) return [];
    const rows: Array<[string, { id: string; category: CardImageCategory }]> = [
      [e.front, { id, category: e.category }],
    ];
    if (e.back) rows.push([e.back, { id, category: e.category }]);
    return rows;
  }),
);

export function lookupCardImageUrl(
  url: string | undefined,
): { id: string; category: CardImageCategory } | null {
  return (url && URL_INDEX.get(url)) || null;
}

/** 从图片地址里读出分类目录（/cards/<分类>/...）；通用背面等未登记的地址也能得到分类 */
export function categoryOfImageUrl(url: string | undefined): CardImageCategory | null {
  if (!url) return null;
  const hit = /\/cards\/(thief|dream-master|action|bribe|dream|nightmare|vault|other)\//.exec(url);
  return (hit?.[1] as CardImageCategory | undefined) ?? null;
}
