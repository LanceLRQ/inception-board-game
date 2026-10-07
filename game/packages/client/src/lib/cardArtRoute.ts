// 卡图的运行时缓存路由（vite.config.ts 的 Workbox 配置引用）
//
// 路由只看路径部分，所以带版本参数的卡图地址（/cards/...webp?v=<哈希>）照样命中；
// 缓存的键是完整地址，内容换了哈希就变，旧图不会被当成新图。
//
// 注意：Workbox 会把匹配器 toString() 之后写进 Service Worker，匹配器必须是自包含的。
// 所以这里用正则字面量（函数里引用别处的标识符，到了 Service Worker 里就是未定义）。

/** 运行时缓存的名字 */
export const CARD_ART_CACHE_NAME = 'card-art-cache';

/** 卡图的地址：站内 /cards/ 下的 webp；查询串与锚点不影响，也不会被查询串里的 .webp 骗到 */
export const CARD_ART_URL_PATTERN = /^https?:\/\/[^/?#]+\/cards\/[^?#]*\.webp(?:[?#]|$)/i;

/** 是不是卡图请求 */
export function isCardArtRequest(url: Pick<URL, 'href'>): boolean {
  return CARD_ART_URL_PATTERN.test(url.href);
}
