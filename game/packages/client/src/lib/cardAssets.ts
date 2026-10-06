// 卡图预加载的默认实例：目录取自已登记的卡图，网络受限与否取自浏览器

import { AssetPreloader } from './assetPreloader';
import { buildCardCatalog } from './cardCatalog';

export const cardAssets = new AssetPreloader();
cardAssets.setManifest({
  version: 'catalog',
  generatedAt: '',
  totalBytes: 0,
  entries: buildCardCatalog(),
});
