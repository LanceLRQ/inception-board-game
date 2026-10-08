// 黑天鹅·纷飞的分发草稿：抽牌阶段略过抽牌，把全部手牌分给其他存活的盗梦者，然后抽 4 张。
// 引擎的 playBlackSwanTour(分发表)：分发表的键是接收者座位，值是给他的牌 id 列表；必须刚好分完全部手牌，
// 不能分给自己、梦主或已死亡的人。这里的草稿按手牌位置记录每张牌分给了谁（同名牌各算一张），
// 发 move 时再汇总成分发表。纯函数，有真实引擎对账测试（entriesEngineFlow.test.ts）。
//
// 对照：docs/manual/05-dream-thieves.md 黑天鹅（266-272 行）

/** 分发草稿：当前选中的接收者，以及每张手牌分给了谁（未分配为 null） */
export interface TourState {
  readonly active: string | null;
  readonly assigned: readonly (string | null)[];
}

export const EMPTY_TOUR: TourState = { active: null, assigned: [] };

/** 能接收手牌的人：存活的、不是本人、不是梦主（对外仍是盗梦者的背叛者也算） */
export function tourRecipientIds(
  players: Readonly<Record<string, { readonly isAlive: boolean } | undefined>>,
  seat: string,
  dreamMasterID: string,
): string[] {
  return Object.entries(players)
    .filter(([id, p]) => id !== seat && id !== dreamMasterID && p?.isAlive === true)
    .map(([id]) => id);
}

/** 把草稿补齐 / 截到手牌张数，并丢掉不再合法的接收者（手牌或接收者变化后残留的选择自动失效） */
export function validTourState(
  state: TourState,
  handSize: number,
  recipients: readonly string[],
): TourState {
  const ok = new Set(recipients);
  return {
    active: state.active !== null && ok.has(state.active) ? state.active : null,
    assigned: Array.from({ length: handSize }, (_, i) => {
      const to = state.assigned[i] ?? null;
      return to !== null && ok.has(to) ? to : null;
    }),
  };
}

/** 选中一位接收者 */
export function pickTourRecipient(state: TourState, id: string): TourState {
  return { ...state, active: id };
}

/** 点一张手牌：分给当前接收者；已经分给这位的再点一次取消；还没选接收者时没有效果 */
export function tapTourCard(state: TourState, index: number, handSize: number): TourState {
  if (state.active === null || index < 0 || index >= handSize) return state;
  const assigned = Array.from({ length: handSize }, (_, i) => state.assigned[i] ?? null);
  assigned[index] = assigned[index] === state.active ? null : state.active;
  return { ...state, assigned };
}

/** 已分配 / 总张数 */
export function tourProgress(assigned: readonly (string | null)[]): {
  done: number;
  total: number;
} {
  return { done: assigned.filter((x) => x !== null).length, total: assigned.length };
}

/** 全部手牌都分给了合法的接收者（引擎要求刚好分完） */
export function canConfirmTour(
  assigned: readonly (string | null)[],
  handSize: number,
  recipients: readonly string[],
): boolean {
  if (handSize === 0 || assigned.length !== handSize) return false;
  const ok = new Set(recipients);
  return assigned.every((to) => to !== null && ok.has(to));
}

/** 汇总成 playBlackSwanTour 的分发表：接收者 → 给他的牌（按手牌里的顺序） */
export function buildDistribution(
  hand: readonly string[],
  assigned: readonly (string | null)[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  hand.forEach((card, i) => {
    const to = assigned[i] ?? null;
    if (to !== null) (out[to] ??= []).push(card);
  });
  return out;
}
