// 梦魇发动时要界面补充的参数：回音萦绕选层与方式，邪念瘟疫点名要派发贿赂牌的盗梦者。
// 金库三选一、技能面板里的发动 / 火星·杀戮、白羊·星尘的应答三处入口共用这里的推导。
// 参数的形状与引擎的 applyNightmareEffect 一致（有真实引擎对账测试）；合法性判定仍在引擎。
//
// 对照：docs/manual/07-nightmare-cards.md 回音萦绕（29-34 行）、邪念瘟疫（15-20 行）

/** 发动这张梦魇要不要附加参数 */
export type NightmareParamKind = 'none' | 'echo' | 'plague';

const ECHO_NIGHTMARE = 'nightmare_echo';
const PLAGUE_NIGHTMARE = 'nightmare_plague';

/** 回音萦绕可以选的层 */
export const ECHO_LAYER_CHOICES: readonly number[] = [1, 2, 3, 4];

/** 由梦魇牌 id 推出发动时要补充的参数；看不到梦魇是什么（null）时按不需要处理 */
export function nightmareParamKind(nightmareId: string | null | undefined): NightmareParamKind {
  if (nightmareId === ECHO_NIGHTMARE) return 'echo';
  if (nightmareId === PLAGUE_NIGHTMARE) return 'plague';
  return 'none';
}

/** 弹窗里的草稿：回音萦绕的层与方式、邪念瘟疫点名的盗梦者 */
export interface NightmareParamDraft {
  readonly echoLayer: number | null;
  readonly echoAction: 'restore' | 'add' | null;
  readonly bribed: readonly string[];
}

export const EMPTY_NIGHTMARE_DRAFT: NightmareParamDraft = {
  echoLayer: null,
  echoAction: null,
  bribed: [],
};

/** 草稿是否已经选完：回音萦绕要层与方式都选；邪念瘟疫可以一个都不点名（不派发） */
export function nightmareParamsReady(
  kind: NightmareParamKind,
  draft: NightmareParamDraft,
): boolean {
  if (kind === 'echo') return draft.echoLayer !== null && draft.echoAction !== null;
  return true;
}

/**
 * 发给引擎的参数对象：回音萦绕 { targetLayer, action }，邪念瘟疫 { bribedTargets }；
 * 不需要参数或草稿没选完返回 undefined（调用方据此不带这个参数）。
 */
export function nightmareParamsOf(
  kind: NightmareParamKind,
  draft: NightmareParamDraft,
): Record<string, unknown> | undefined {
  if (kind === 'echo') {
    if (draft.echoLayer === null || draft.echoAction === null) return undefined;
    return { targetLayer: draft.echoLayer, action: draft.echoAction };
  }
  if (kind === 'plague') return { bribedTargets: [...draft.bribed] };
  return undefined;
}

/**
 * 邪念瘟疫能点名的盗梦者：该层存活的、对外是盗梦者的人（背叛者也算，梦主不算）。
 * 与引擎口径一致：只有这些人会按点名派发；其余座位即使被点名也不起作用。
 */
export function plagueCandidates(
  playersInLayer: readonly string[],
  players: Readonly<Record<string, { readonly isAlive: boolean } | undefined>>,
  dreamMasterID: string,
): string[] {
  return playersInLayer.filter((id) => id !== dreamMasterID && players[id]?.isAlive === true);
}

/**
 * 点名切换：已点名则取消；未点名则加入，但不能超过贿赂池里还没派出的张数
 * （引擎按该层座次依次派发，池空之后点名的人也拿不到牌，所以界面不让多点）。
 */
export function togglePlagueTarget(
  prev: readonly string[],
  id: string,
  poolCount: number,
): readonly string[] {
  if (prev.includes(id)) return prev.filter((x) => x !== id);
  if (prev.length >= poolCount) return prev;
  return [...prev, id];
}
