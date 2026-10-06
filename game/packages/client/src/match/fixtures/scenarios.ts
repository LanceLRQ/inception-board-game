// 固定场景的登记与按地址参数选择。不引入引擎，主线程可以直接导入。

import { MATCH_MAX_PLAYERS, MATCH_MIN_PLAYERS } from '@icgame/shared';

/**
 * 盗梦者 / 梦主视角，各有一个「无待办」与「有待应答的解封响应窗口」的版本；
 * 另有盗梦者的「弃牌阶段」场景（手牌超出上限，必须选牌弃置）、
 * 盗梦者轮到本人应答的各种待决状态（被 SHOOT 时的响应、天秤、意念判官、处女、白羊），
 * 以及梦主是「棋局」的场景
 */
export const FIXTURE_SCENARIO_IDS = [
  'thief',
  'master',
  'thief-pending',
  'master-pending',
  'thief-discard',
  'thief-sudger',
  'thief-sudger',
  'thief-pending-shoot',
  'thief-pending-terrorist',
  'thief-pending-libra-split',
  'thief-pending-libra-pick',
  'thief-pending-sudger',
  'thief-pending-virgo',
  'thief-pending-aries',
  'master-chess',
] as const;

export type FixtureScenarioId = (typeof FIXTURE_SCENARIO_IDS)[number];

/** 固定场景的人数范围与缺省人数 */
export const FIXTURE_MIN_PLAYERS = MATCH_MIN_PLAYERS;
export const FIXTURE_MAX_PLAYERS = MATCH_MAX_PLAYERS;
export const FIXTURE_DEFAULT_PLAYERS = 6;

/** 举报在固定场景里的结果：成功、重复举报、网络失败 */
export const FIXTURE_REPORT_RESULTS = ['ok', 'duplicate', 'failed'] as const;
export type FixtureReportResult = (typeof FIXTURE_REPORT_RESULTS)[number];

/** 固定场景上叠加的、与局面无关的功能走查开关 */
export interface FixtureExtras {
  /** 打开预设短语通道并注入几条示例消息 */
  readonly chat?: boolean;
  /** 对局已结束（盗梦者胜），所有对手按真人对待，可走查局后举报；值是举报接口的结果 */
  readonly outcome?: FixtureReportResult;
}

/** 一个固定场景：视角与局面（id）加上人数，以及可选的功能走查开关 */
export interface FixtureScenarioSpec {
  readonly id: FixtureScenarioId;
  readonly players: number;
  readonly extras?: FixtureExtras;
}

/** ?pending= 的取值（不含 1）与场景的对应：轮到本人应答的各种待决状态 */
const PENDING_RESPONSE_SCENARIOS = {
  shoot: 'thief-pending-shoot',
  terrorist: 'thief-pending-terrorist',
  'libra-split': 'thief-pending-libra-split',
  'libra-pick': 'thief-pending-libra-pick',
  sudger: 'thief-pending-sudger',
  virgo: 'thief-pending-virgo',
  aries: 'thief-pending-aries',
} as const satisfies Record<string, FixtureScenarioId>;

/** 解析人数参数：4–10 的整数；缺失或非法（含小数、超出范围）回落缺省 */
export function parseFixturePlayers(raw: string | null): number {
  if (raw === null || !/^\d+$/.test(raw)) return FIXTURE_DEFAULT_PLAYERS;
  const n = Number(raw);
  return n >= FIXTURE_MIN_PLAYERS && n <= FIXTURE_MAX_PLAYERS ? n : FIXTURE_DEFAULT_PLAYERS;
}

/**
 * 按地址参数选场景：
 *   ?as=master   梦主视角（缺省为盗梦者）
 *   ?pending=1   场景里有一个等待本人应答的【解封】响应窗口（可与 as=master 叠加）
 *   ?pending=shoot|terrorist|libra-split|libra-pick|sudger|virgo|aries
 *                盗梦者视角，轮到本人应答对应的待决状态：被 SHOOT 时的双鱼·游离 / 恐怖分子·狂热、
 *                天秤分牌 / 天秤挑一份、意念判官选骰、处女·完美、白羊·星尘（梦魇为回音萦绕）；不与 as=master 叠加
 *   ?character=sudger  盗梦者视角，本人是意念判官、行动阶段手里有 SHOOT（走查【定罪】的发动入口）；
 *                      梦主视角、响应窗口与待应答参数优先，忽略它
 *   ?chess=1     与 as=master 叠加：梦主是「棋局」，行动阶段会自动弹出易位弹窗
 *   ?discard=1   盗梦者处于弃牌阶段，手牌超出上限（梦主视角与响应窗口参数优先，忽略它）
 *   ?players=N   人数 4–10（缺省 6），方便走查座位环在不同人数下的排布
 *   ?chat=1      打开预设短语通道，并注入几条示例消息（固定场景本没有连接，发出的短语只在本机回显）
 *   ?outcome=1   对局已结束，所有对手按真人对待，可走查局后举报；
 *                ?outcome=duplicate / failed 让举报接口返回「已举报过」/ 网络失败
 */
export function resolveFixtureScenario(searchParams: URLSearchParams): FixtureScenarioSpec {
  const master = searchParams.get('as') === 'master';
  const pendingParam = searchParams.get('pending');
  const pending = pendingParam === '1';
  const discard = searchParams.get('discard') === '1';
  const response =
    pendingParam !== null && Object.hasOwn(PENDING_RESPONSE_SCENARIOS, pendingParam)
      ? PENDING_RESPONSE_SCENARIOS[pendingParam as keyof typeof PENDING_RESPONSE_SCENARIOS]
      : null;
  const chess = searchParams.get('chess') === '1';
  const sudger = searchParams.get('character') === 'sudger';
  const id: FixtureScenarioId = master
    ? pending
      ? 'master-pending'
      : chess
        ? 'master-chess'
        : 'master'
    : pending
      ? 'thief-pending'
      : (response ?? (discard ? 'thief-discard' : sudger ? 'thief-sudger' : 'thief'));
  const extras = resolveFixtureExtras(searchParams);
  return {
    id,
    players: parseFixturePlayers(searchParams.get('players')),
    ...(extras ? { extras } : {}),
  };
}

function resolveFixtureExtras(searchParams: URLSearchParams): FixtureExtras | null {
  const chat = searchParams.get('chat') === '1';
  const outcomeParam = searchParams.get('outcome');
  const outcome: FixtureReportResult | null =
    outcomeParam === '1'
      ? 'ok'
      : (FIXTURE_REPORT_RESULTS.find((r) => r === outcomeParam && r !== 'ok') ?? null);
  if (!chat && outcome === null) return null;
  return { ...(chat ? { chat } : {}), ...(outcome !== null ? { outcome } : {}) };
}
