// TargetLayerPickerDialog · 纯逻辑层
//
// 对于"需选目标层"的卡（梦境穿梭剂 / 梦境窥视 / 梦魇解封 等），
// 只列出可选层；梦境窥视的未打开金库列表由控制层传入，已窥视不影响再次选择。

export interface TargetLayerOption {
  layer: number;
}

export interface TargetLayerInputs {
  /** 当前 pending 的卡牌 id，可用于派生 validLayers */
  cardId: string | null | undefined;
  /** viewer 当前层（穿梭剂等需要此信息） */
  viewerLayer: number;
  /** 可选：显式指定合法层集合（优先于默认推导） */
  validLayers?: number[] | null;
}

export const ALL_LAYERS = [1, 2, 3, 4] as const;

/**
 * 根据卡牌推导合法层：
 *  - 梦境穿梭剂 / SHOOT·梦境穿梭剂 → 相邻层
 *  - 其余默认 → 全部 L1-L4 可选
 * 若传 inputs.validLayers 则优先使用。
 */
export function computeValidLayers(inputs: TargetLayerInputs): number[] {
  if (inputs.validLayers != null) return [...inputs.validLayers];
  if (inputs.cardId === 'action_dream_transit' || inputs.cardId === 'action_shoot_dream_transit') {
    const adj: number[] = [];
    if (inputs.viewerLayer - 1 >= 1) adj.push(inputs.viewerLayer - 1);
    if (inputs.viewerLayer + 1 <= 4) adj.push(inputs.viewerLayer + 1);
    return adj;
  }
  return [...ALL_LAYERS];
}

export function computeLayerOptions(inputs: TargetLayerInputs): TargetLayerOption[] {
  const valid = new Set(computeValidLayers(inputs));
  return ALL_LAYERS.filter((layer) => valid.has(layer)).map((layer) => ({ layer }));
}
