// TargetPlayerPickerDialog · 纯逻辑层
// 根据当前 pending card + viewer 层 + 玩家列表，推导可选/disabled 状态。
// 对照：docs/manual/04-action-cards.md SHOOT 变体目标（同层/跨层）

export interface TargetPlayerOption {
  id: string;
  name: string;
  /** 是否因"同层限制"被 disable（刺客之王跨层允许） */
  disabled: boolean;
  /** 跨层时展示的层号（用于按钮后缀） */
  crossLayerNumber: number | null;
  /** target 当前层（信息性） */
  currentLayer: number;
}

export interface TargetPickerInputs {
  /** effectivePending.card（如 'action_shoot' / 'action_shoot_king' 等） */
  cardId: string | null | undefined;
  /** viewer 自身当前层（决定同层判定） */
  viewerLayer: number;
  /** viewer 的 playerID（用于过滤自己） */
  viewerPlayerID: string;
  /** 所有玩家；仅取 id + isAlive + currentLayer + nickname */
  players: Record<
    string,
    { isAlive: boolean; currentLayer: number; nickname?: string } | undefined
  >;
}

/**
 * 判定当前卡牌是否"同层限制"。
 *   action_shoot / action_shoot_armor / action_shoot_burst / action_shoot_dream_transit → 同层
 *   action_shoot_king → 跨层（刺客之王）
 *   非 SHOOT 类 → 不做同层限制（取决于卡牌本身，此处默认 false 即不限）
 */
export function isSameLayerRequired(cardId: string | null | undefined): boolean {
  if (!cardId) return false;
  if (!cardId.startsWith('action_shoot')) return false;
  return cardId !== 'action_shoot_king';
}

export function computeTargetOptions(inputs: TargetPickerInputs): TargetPlayerOption[] {
  const sameLayerRequired = isSameLayerRequired(inputs.cardId);
  const out: TargetPlayerOption[] = [];
  for (const [id, p] of Object.entries(inputs.players ?? {})) {
    if (!p || !p.isAlive) continue;
    if (id === inputs.viewerPlayerID) continue;
    const crossLayer = p.currentLayer !== inputs.viewerLayer;
    const disabled = sameLayerRequired && crossLayer;
    out.push({
      id,
      name: p.nickname ?? `AI ${id}`,
      disabled,
      crossLayerNumber: crossLayer ? p.currentLayer : null,
      currentLayer: p.currentLayer,
    });
  }
  // 按 id 稳定排序（可用数字序）
  out.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  return out;
}
