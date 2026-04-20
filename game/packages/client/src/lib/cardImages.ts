// cardId → 卡图 URL 映射（W18.5 · UI 素材接入最小版）
// 对照：plans/design/06-frontend-design.md §6.17
//
// 数据源：@icgame/shared 的 generated/cards.ts 里每张卡的 imagePath 字段
// （由 shared/scripts/codegen.ts 从 plans/assets/cards-data.json 生成，
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
} from '@icgame/shared';

const PUBLIC_PREFIX = '/cards/';

interface ImageEntry {
  readonly front: string;
  readonly back?: string;
}

function buildImageMap(): ReadonlyMap<string, ImageEntry> {
  const map = new Map<string, ImageEntry>();
  const all = [
    ...THIEF_CHARACTERS,
    ...MASTER_CHARACTERS,
    ...ACTION_CARDS,
    ...NIGHTMARE_CARDS,
    ...DREAM_CARDS,
    ...VAULT_CARDS,
    ...BRIBE_CARDS,
  ];
  for (const card of all) {
    const front = (card as { imagePath?: string }).imagePath;
    if (!card.id || !front) continue;
    const backRaw = (card as { backImagePath?: string }).backImagePath;
    const entry: ImageEntry = {
      front: PUBLIC_PREFIX + encodeURI(front),
      ...(backRaw ? { back: PUBLIC_PREFIX + encodeURI(backRaw) } : {}),
    };
    map.set(card.id, entry);
  }
  return map;
}

const IMAGE_MAP = buildImageMap();

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
