// 卡图地址：路径 + 版本参数
//
// 卡图的运行时缓存是 cache-first（见 vite.config.ts 里的卡图规则），同一个地址缓存住之后永远不再请求，
// 所以卡图内容换了而地址不变，老用户就永远拿不到新图。地址里带上内容哈希（?v=<哈希>）：
// 图换了哈希就变，地址就变，缓存自然落空重取。
// 预加载、<img> 实际请求、运行时缓存的键都从这里取同一个地址，所以三者命中的是同一份缓存。
// 哈希来自 generated/cardImageManifest.ts（由 scripts/cardImageManifest.ts 按 public/cards 的内容生成）。

import type { CardImageManifestEntry } from './cardImageManifestBuild';
import { CARD_IMAGE_MANIFEST } from './generated/cardImageManifest';
import { logger } from './logger';

const PUBLIC_PREFIX = '/cards/';

/** 版本参数名 */
export const VERSION_PARAM = 'v';

/** 卡图文件的清单项；不在清单里（说明卡牌配置与卡图目录对不上）返回 undefined */
export function cardImageInfo(imagePath: string): CardImageManifestEntry | undefined {
  return CARD_IMAGE_MANIFEST[imagePath];
}

/**
 * 卡图的访问地址：`/cards/<路径>?v=<哈希>`。
 * @param imagePath 相对 public/cards 的路径（卡牌配置里的 imagePath）
 * 不在清单里时退回不带版本的地址（图仍然取得到，只是缓存不会随内容更新），并记一条告警；
 * 清单与配置一致由 cardImageManifest.test.ts 守护，正常不会走到这里。
 */
export function versionedCardImageUrl(imagePath: string): string {
  const url = PUBLIC_PREFIX + encodeURI(imagePath);
  const entry = CARD_IMAGE_MANIFEST[imagePath];
  if (!entry) {
    logger.warn('game/assets', 'card image missing in manifest, using unversioned url', {
      imagePath,
    });
    return url;
  }
  return `${url}?${VERSION_PARAM}=${entry.hash}`;
}
