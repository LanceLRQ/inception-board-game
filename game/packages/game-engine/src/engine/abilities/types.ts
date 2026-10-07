// 响应窗口相关类型

// === 响应窗口 ===

/**
 * 响应窗口类别 — 为 UI/Bot/分析工具提供语义标签，
 *   不参与规则判定逻辑，仅作为 metadata 传递。
 *   - 'unlock'   : 解封效果①响应（效果②抵消）
 *   - 'shoot'    : SHOOT 被击响应（双鱼闪避 / 恐怖分子等）
 *   - 'skill'    : 技能响应（雅典娜·急智 / 水瓶·同名重用等 / 黑洞）
 *   - 'nightmare': 梦魇触发响应
 *   - 'worldview': 世界观触发响应
 *   - 'peek'     : 梦境窥视派贿赂决策（当前走 pendingPeekDecision 独立通道，预留值）
 */
export type ResponseWindowSourceType =
  | 'unlock'
  | 'shoot'
  | 'skill'
  | 'nightmare'
  | 'worldview'
  | 'peek';

// === 响应窗口开启参数 ===

export interface PendingResponse {
  /** 触发的效果来源 */
  sourceAbilityID: string;
  /** 响应窗口来源类别（可选，不影响规则判定；向后兼容） */
  sourceType?: ResponseWindowSourceType;
  /** 需要响应的玩家列表 */
  responders: string[];
  /** 响应窗口超时（毫秒） */
  timeoutMs: number;
  /** 哪些能力可以作为响应打出 */
  validResponseAbilityIDs: string[];
  /** 超时后的默认行为 */
  onTimeout: 'resolve' | 'cancel';
}
