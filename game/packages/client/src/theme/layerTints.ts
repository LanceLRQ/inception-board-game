// 层级调色：「陀螺未停」按梦境层给界面强调色换一层电影滤镜
//
// 色值属于主题数据，放在这里（允许颜色字面量）；styles/index.css 的 [data-theme='totem'] 块里有同样的
// `--ms-totem-l<层号>` 变量（themeCss.test.ts 校验逐字一致），皮肤样式只引用变量、不写字面量。
// 层号取自对局布局根容器的 data-tint-layer 属性（见 tintLayerAttr），别的主题不理会这个属性。

/** 有调色的层：第 1–4 层；迷失层不上色，沿用主题的缺省强调色 */
export const TINT_LAYERS = [1, 2, 3, 4] as const;
export type TintLayer = (typeof TINT_LAYERS)[number];

/** 雨城 / 酒店 / 雪堡 / 深渊 的电影调色（装饰性标注，可由 data-fx-off="tint" 关闭） */
export const TOTEM_LAYER_TINTS: Readonly<Record<TintLayer, string>> = {
  1: '#8FB0C8',
  2: '#E0BC7E',
  3: '#BFD4E6',
  4: '#9AA098',
};

/** 层号对应的 CSS 变量名，例如 1 → `--ms-totem-l1` */
export function totemLayerVar(layer: TintLayer): string {
  return `--ms-totem-l${layer}`;
}

/** 根容器的 data-tint-layer 属性值：0–4 的整数才输出，其余不输出 */
export function tintLayerAttr(layer: number | null | undefined): string | undefined {
  return typeof layer === 'number' && Number.isInteger(layer) && layer >= 0 && layer <= 4
    ? String(layer)
    : undefined;
}
