// 固定场景的登记与按地址参数选择。不引入引擎，主线程可以直接导入。

import { MATCH_MAX_PLAYERS, MATCH_MIN_PLAYERS } from '@icgame/shared';

/**
 * 盗梦者 / 梦主视角，各有一个「无待办」与「有待应答的解封响应窗口」的版本；
 * 另有盗梦者的「弃牌阶段」场景（手牌超出上限，必须选牌弃置）、
 * 盗梦者轮到本人应答的各种待决状态（被 SHOOT 时的响应、天秤、意念判官、处女、白羊、黑洞·吞噬、达尔文·淘汰、雅典娜·急智），
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
  'thief-pending-aries-plague',
  'thief-pending-levy',
  'thief-pending-darwin',
  'thief-pending-athena',
  'master-chess',
  'thief-dead',
  'thief-mate-dead',
  'master-mate-dead',
  'master-bribe',
  'master-vault-echo',
  'master-vault-plague',
  'skill-draw',
  'skill-joker',
  'skill-gemini-back',
  'skill-chemist',
  'skill-space-queen',
  'skill-space-queen-other',
  'skill-gaia',
  'skill-aries-glow',
  'skill-black-hole',
  'skill-black-hole-draw',
  'skill-terrorist',
  'skill-sagittarius',
  'skill-venus',
  'skill-black-swan',
  'skill-luna',
  'skill-pisces',
  'skill-darwin',
  'skill-green-ray',
  'skill-aquarius',
  'skill-heart-lock',
  'skill-venus-mirror',
  'skill-passage',
  'skill-imperial',
  'skill-saturn',
  'skill-nightmare',
  'skill-unlock-none',
  'skill-unlock-spent',
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
  'aries-plague': 'thief-pending-aries-plague',
  levy: 'thief-pending-levy',
  darwin: 'thief-pending-darwin',
  athena: 'thief-pending-athena',
} as const satisfies Record<string, FixtureScenarioId>;

/** ?skill= 的取值与场景的对应：走查某个角色技能 / 抽牌阶段入口 / 出牌预判的固定局面 */
export const SKILL_SCENARIOS = {
  draw: 'skill-draw',
  joker: 'skill-joker',
  'gemini-back': 'skill-gemini-back',
  chemist: 'skill-chemist',
  'space-queen': 'skill-space-queen',
  'space-queen-other': 'skill-space-queen-other',
  gaia: 'skill-gaia',
  'aries-glow': 'skill-aries-glow',
  'black-hole': 'skill-black-hole',
  'black-hole-draw': 'skill-black-hole-draw',
  terrorist: 'skill-terrorist',
  sagittarius: 'skill-sagittarius',
  venus: 'skill-venus',
  'black-swan': 'skill-black-swan',
  luna: 'skill-luna',
  pisces: 'skill-pisces',
  darwin: 'skill-darwin',
  'green-ray': 'skill-green-ray',
  aquarius: 'skill-aquarius',
  'heart-lock': 'skill-heart-lock',
  'venus-mirror': 'skill-venus-mirror',
  passage: 'skill-passage',
  imperial: 'skill-imperial',
  saturn: 'skill-saturn',
  nightmare: 'skill-nightmare',
  'unlock-none': 'skill-unlock-none',
  'unlock-spent': 'skill-unlock-spent',
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
 *   ?pending=shoot|terrorist|libra-split|libra-pick|sudger|virgo|aries|aries-plague|levy|darwin|athena
 *                盗梦者视角，轮到本人应答对应的待决状态：被 SHOOT 时的双鱼·游离 / 恐怖分子·狂热、
 *                天秤分牌 / 天秤挑一份、意念判官选骰、处女·完美、白羊·星尘（梦魇为回音萦绕；aries-plague 为邪念瘟疫）、
 *                黑洞·吞噬（levy，本人与另一名同层玩家各交 1 张手牌）、达尔文·淘汰（darwin，已抽到 2 张、选 2 张放回）、
 *                雅典娜·急智（athena，同层盗梦者对本人打出 KICK，结算前可从弃牌堆选 1 张）；不与 as=master 叠加
 *   ?character=sudger  盗梦者视角，本人是意念判官、行动阶段手里有 SHOOT（走查【定罪】的发动入口）；
 *                      梦主视角、响应窗口与待应答参数优先，忽略它
 *   ?skill=名    走查某个角色技能 / 抽牌阶段入口 / 出牌预判的固定局面（视角由场景决定，响应窗口与待应答参数优先）：
 *                draw 抽牌阶段（略过抽牌）· joker 抽牌阶段的小丑 · gemini-back 翻到背面的双子 · chemist 药剂师
 *                · space-queen 弃牌阶段的空间女王 · space-queen-other 别人的弃牌阶段里的空间女王 · gaia 同层有两名同伴的盖亚
 *                · aries-glow 抽牌阶段、弃掉过 2 张梦魇的白羊 · black-hole 黑洞 · black-hole-draw 抽牌阶段的黑洞（吞噬入口）· terrorist 恐怖分子 · sagittarius 射手
 *                · imperial 皇城世界观下有 SHOOT 机会 · saturn 土星世界观下持贿赂 · unlock-none 所在层心锁为 0
 *                · unlock-spent 本回合已成功解封 · black-swan 抽牌阶段的黑天鹅 · luna 翻到背面的露娜（有同伴在迷失层）
 *                · pisces 翻到背面的双鱼（有同伴在迷失层）· darwin 达尔文 · green-ray 格林射线 · aquarius 本回合打出过两张同名牌的水瓶
 *                · heart-lock 本回合击杀过玩家的射手 · venus-mirror 金星·镜界世界观下本回合打出过 KICK；
 *                梦主视角：venus 金星 · passage 密道 · nightmare 有已翻开的梦魇（回音萦绕、邪念瘟疫、致命漩涡）
 *   ?chess=1     与 as=master 叠加：梦主是「棋局」，行动阶段会自动弹出易位弹窗
 *   ?dead=1      盗梦者视角，本人已在迷失层、轮到自己的出牌阶段、手里有牌（走查「复活」入口）；
 *                ?dead=mate 本人存活，一名盗梦者同伴在迷失层（走查「复活同伴」，可与 as=master 叠加）；
 *                梦主视角下 dead=1 忽略；响应窗口、待应答与弃牌参数优先
 *   ?bribe=1     与 as=master 叠加：一名盗梦者持有贿赂牌（走查梦主的梦境窥视效果②选目标）
 *   ?vault=echo|plague  与 as=master 叠加：盗梦者打开了金币金库、梦主待三选一，该层梦魇是回音萦绕 / 邪念瘟疫
 *                （走查发动梦魇的附加参数）
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
  const deadParam = searchParams.get('dead');
  const deadSelf = deadParam === '1';
  const deadMate = deadParam === 'mate';
  const bribe = searchParams.get('bribe') === '1';
  const vaultParam = searchParams.get('vault');
  const sudger = searchParams.get('character') === 'sudger';
  const skillParam = searchParams.get('skill');
  const skillScene =
    skillParam !== null && Object.hasOwn(SKILL_SCENARIOS, skillParam)
      ? SKILL_SCENARIOS[skillParam as keyof typeof SKILL_SCENARIOS]
      : null;
  const baseId: FixtureScenarioId = master
    ? pending
      ? 'master-pending'
      : chess
        ? 'master-chess'
        : deadMate
          ? 'master-mate-dead'
          : bribe
            ? 'master-bribe'
            : vaultParam === 'echo'
              ? 'master-vault-echo'
              : vaultParam === 'plague'
                ? 'master-vault-plague'
                : 'master'
    : pending
      ? 'thief-pending'
      : (response ??
        (discard
          ? 'thief-discard'
          : deadSelf
            ? 'thief-dead'
            : deadMate
              ? 'thief-mate-dead'
              : sudger
                ? 'thief-sudger'
                : 'thief'));
  // 角色走查场景自带视角；只有响应窗口与待应答参数比它优先
  const id: FixtureScenarioId = !pending && response === null && skillScene ? skillScene : baseId;
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
