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

function buildImageMap(): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
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
    const path = (card as { imagePath?: string }).imagePath;
    if (!card.id || !path) continue;
    map.set(card.id, PUBLIC_PREFIX + encodeURI(path));
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
  return IMAGE_MAP.get(cardId);
}

/** 已登记的卡牌总数（测试/诊断用） */
export function getCardImageCount(): number {
  return IMAGE_MAP.size;
}
