// 卡图扫描件的黑边：除盗梦者角色牌正面是满版以外，其余卡图（行动牌、贿赂、金库、梦魇、梦境层、
// 梦主角色牌与各种背面）四周都带约 30–40px 的黑边（原图 745×1040）。直接铺进画框时，
// 有黑边和没黑边的牌看起来一大一小，所以统一放大裁掉。

/** 黑边约占短边的 4.5%，按这个倍数居中放大正好裁掉四边的黑边 */
export const SCAN_BORDER_ZOOM = 1.1;

/** 这张卡图的扫描件四周是否带黑边（按地址所在的卡图目录与文件名判断） */
export function hasScanBorder(src: string): boolean {
  let path = src.split('?')[0] ?? src;
  try {
    path = decodeURI(path);
  } catch {
    // 地址里有不成对的转义：按原样判断
  }
  const isThiefFace = path.includes('/cards/thief/') && !/背面\.\w+$/.test(path);
  return !isThiefFace;
}
