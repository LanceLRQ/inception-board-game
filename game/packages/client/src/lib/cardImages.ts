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

/** 通用角色背面图（未揭示身份时展示） */
export const GENERIC_BACK_IMAGES = {
  thief: PUBLIC_PREFIX + encodeURI('thief/盗梦都市_角色牌_盗梦者_背面.webp'),
  master: PUBLIC_PREFIX + encodeURI('dream-master/盗梦都市_角色牌_梦主_背面.webp'),
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

/** 遍历所有登记的卡图 URL（front + back + 通用背面） */
export function getAllCardImageUrls(): string[] {
  const urls: string[] = [];
  for (const entry of IMAGE_MAP.values()) {
    urls.push(entry.front);
    if (entry.back) urls.push(entry.back);
  }
  urls.push(GENERIC_BACK_IMAGES.thief, GENERIC_BACK_IMAGES.master);
  return urls;
}

/**
 * 最小版 AssetPreloader。
 * 后台并发创建 Image() 实例触发浏览器下载；不阻塞调用方。
 * 单次调用后浏览器 HTTP cache 会接管，后续 <img> 渲染秒出。
 *
 * @param opts.concurrency 并发上限（默认 8，避免打爆 dev server）
 * @param opts.onProgress 每加载完成一张回调（可选）
 * @returns 返回一个 Promise，所有图加载结束（成功或失败）时 resolve，
 *          并提供失败 URL 列表供诊断；已在加载中的后续调用复用结果。
 */
export async function preloadAllCardImages(
  opts: {
    readonly concurrency?: number;
    readonly onProgress?: (loaded: number, total: number, failed: readonly string[]) => void;
  } = {},
): Promise<{ loaded: number; failed: string[] }> {
  if (preloadPromise) return preloadPromise;
  const concurrency = Math.max(1, opts.concurrency ?? 8);
  const onProgress = opts.onProgress;
  const all = getAllCardImageUrls();
  const total = all.length;
  let loaded = 0;
  const failed: string[] = [];
  let cursor = 0;

  const loadOne = (url: string): Promise<void> =>
    new Promise((resolve) => {
      if (typeof Image === 'undefined') {
        resolve(); // SSR / 测试环境兜底
        return;
      }
      const img = new Image();
      img.onload = () => {
        loaded++;
        onProgress?.(loaded, total, failed);
        resolve();
      };
      img.onerror = () => {
        failed.push(url);
        loaded++;
        onProgress?.(loaded, total, failed);
        resolve();
      };
      img.src = url;
    });

  const runner = async (): Promise<void> => {
    while (true) {
      const i = cursor++;
      if (i >= total) return;
      await loadOne(all[i]!);
    }
  };

  preloadPromise = (async () => {
    const workers = Array.from({ length: Math.min(concurrency, total) }, () => runner());
    await Promise.all(workers);
    return { loaded, failed };
  })();

  return preloadPromise;
}

let preloadPromise: Promise<{ loaded: number; failed: string[] }> | null = null;
