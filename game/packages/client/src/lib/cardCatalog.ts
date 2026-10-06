// 卡图目录：把所有已登记的卡图按「何时需要」分成三档，供分阶段预加载使用
//
//   critical     进站就取：界面必需的小图（通用背面、金库牌面、各种牌的背面）
//   match-entry  进对局前取：每局都会用到、且与「谁手里有什么」无关的牌种全集（行动牌、梦魇牌）
//   idle         空闲时再取：其余（角色牌、世界观、贿赂牌等），对局里用到时也会按需加载
//
// 预加载永远只取「公开的牌种全集」或「本人视图里可见的牌」：不按别人的手牌或未翻开的身份去取图，
// 否则图片请求的模式本身就会泄露隐藏信息。

import type { AssetManifestEntry, AssetTier } from './assetPreloader';
import { GENERIC_BACK_IMAGES, getCardImageCatalog, type CardImageCategory } from './cardImages';

/** 一张卡图属于哪一档 */
export function tierOf(id: string, category: CardImageCategory): AssetTier {
  if (/_back$/.test(id) || category === 'vault') return 'critical';
  if (category === 'action' || category === 'nightmare') return 'match-entry';
  return 'idle';
}

/** 全部卡图的目录；同一张图只出现一次，id 唯一（背面图的 id 是「卡牌 id#back」） */
export function buildCardCatalog(): AssetManifestEntry[] {
  const entries: AssetManifestEntry[] = [];
  const seen = new Set<string>();
  const add = (id: string, category: CardImageCategory, url: string, tier: AssetTier): void => {
    if (seen.has(url)) return;
    seen.add(url);
    entries.push({ id, category, url, bytes: 0, sha256: '', tier });
  };
  add('generic_thief_back', 'thief', GENERIC_BACK_IMAGES.thief, 'critical');
  add('generic_master_back', 'dream-master', GENERIC_BACK_IMAGES.master, 'critical');
  for (const rec of getCardImageCatalog()) {
    add(rec.id, rec.category, rec.url, tierOf(rec.id, rec.category));
    // 双面卡的背面：与正面同档，但不会早于正面被需要
    if (rec.backUrl) add(`${rec.id}#back`, rec.category, rec.backUrl, tierOf(rec.id, rec.category));
  }
  return entries;
}
