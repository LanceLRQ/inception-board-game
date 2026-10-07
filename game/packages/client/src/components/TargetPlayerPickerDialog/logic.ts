// TargetPlayerPickerDialog · 纯逻辑层
// 根据当前 pending card + viewer 层 + 玩家列表，推导可选/disabled 状态。
// 对照：docs/manual/04-action-cards.md SHOOT 变体目标（同层/跨层）

/** 目标被置灰的原因：同层限制 / 盗梦者不能对梦主使用 */
export type TargetDisabledReason = 'sameLayer' | 'masterTarget';

export interface TargetPlayerOption {
  id: string;
  name: string;
  /** 是否被 disable（同层限制，或盗梦者对梦主使用移形换影；刺客之王跨层允许） */
  disabled: boolean;
  /** 置灰的原因；可选时为 null */
  reason: TargetDisabledReason | null;
  /** 跨层时展示的层号（用于按钮后缀） */
  crossLayerNumber: number | null;
  /** target 当前层（信息性） */
  currentLayer: number;
}

export interface TargetPickerInputs {
  /** effectivePending.card（如 'action_shoot' / 'action_shoot_assassin' 等） */
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
  /** 梦主的座位（移形换影、梦境窥视效果②的目标限制要用） */
  dreamMasterID?: string;
  /** 本人是梦主 */
  viewerIsMaster?: boolean;
  /** 持有贿赂牌的座位（视图里贿赂池的 heldBy 是公开的）；梦境窥视效果②只能选他们 */
  bribeHolderIds?: readonly string[];
}

/**
 * 移形换影：盗梦者（含对外仍是盗梦者的背叛者）不能对梦主使用，梦主对盗梦者可用。
 * 对照：docs/manual/04-action-cards.md 移形换影 解析；引擎 playShift
 */
export function isMasterTargetForbidden(cardId: string | null | undefined): boolean {
  return cardId === 'action_shift';
}

/**
 * 梦境窥视效果②（梦主）的可选目标：存活、不是梦主自己、持有贿赂牌的盗梦者。
 * 与引擎 playPeekMaster 的校验口径一致；对照：docs/manual/04-action-cards.md:115、:119
 */
export function peekMasterTargetIds(
  players: TargetPickerInputs['players'],
  dreamMasterID: string | undefined,
  viewerPlayerID: string,
  bribeHolderIds: readonly string[] | undefined,
): string[] {
  const holders = new Set(bribeHolderIds ?? []);
  return Object.entries(players ?? {})
    .filter(
      ([id, p]) =>
        !!p && p.isAlive && id !== viewerPlayerID && id !== dreamMasterID && holders.has(id),
    )
    .map(([id]) => id);
}

/**
 * 判定当前卡牌是否"同层限制"。
 *   action_shoot / action_shoot_drill / action_shoot_burst / action_shoot_dream_transit → 同层
 *   action_shoot_assassin → 跨层（刺客之王）
 *   非 SHOOT 类 → 不做同层限制（取决于卡牌本身，此处默认 false 即不限）
 */
export function isSameLayerRequired(cardId: string | null | undefined): boolean {
  if (!cardId) return false;
  if (!cardId.startsWith('action_shoot')) return false;
  return cardId !== 'action_shoot_assassin';
}

export function computeTargetOptions(inputs: TargetPickerInputs): TargetPlayerOption[] {
  const sameLayerRequired = isSameLayerRequired(inputs.cardId);
  const masterForbidden = isMasterTargetForbidden(inputs.cardId) && inputs.viewerIsMaster !== true;
  // 梦境窥视（出现在选玩家弹层里只可能是梦主的效果②）：只列持有贿赂牌的盗梦者
  const peekIds =
    inputs.cardId === 'action_dream_peek'
      ? new Set(
          peekMasterTargetIds(
            inputs.players,
            inputs.dreamMasterID,
            inputs.viewerPlayerID,
            inputs.bribeHolderIds,
          ),
        )
      : null;
  const out: TargetPlayerOption[] = [];
  for (const [id, p] of Object.entries(inputs.players ?? {})) {
    if (!p || !p.isAlive) continue;
    if (id === inputs.viewerPlayerID) continue;
    if (peekIds && !peekIds.has(id)) continue;
    const crossLayer = p.currentLayer !== inputs.viewerLayer;
    const reason: TargetDisabledReason | null =
      masterForbidden && id === inputs.dreamMasterID
        ? 'masterTarget'
        : sameLayerRequired && crossLayer
          ? 'sameLayer'
          : null;
    out.push({
      id,
      name: p.nickname ?? id,
      disabled: reason !== null,
      reason,
      crossLayerNumber: crossLayer ? p.currentLayer : null,
      currentLayer: p.currentLayer,
    });
  }
  // 按 id 稳定排序（可用数字序）
  out.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  return out;
}
