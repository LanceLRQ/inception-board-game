// 轮到本人应答的待决情形：从按座位裁剪的视图推导「现在要应答什么、有哪些合法选项、点下去发哪个 move」。
//
// 覆盖九种需要本人做选择的待决状态：
//   被 SHOOT 时的响应（双鱼·游离 / 恐怖分子·狂热）、天秤·平衡（分牌 / 挑一份）、
//   意念判官·定罪（二选一骰值）、处女·完美（三选一）、白羊·星尘（发动或弃掉梦魇）、
//   黑洞·吞噬（同层有手牌的人各交 1 张）、达尔文·淘汰（选 2 张放回牌库顶）、雅典娜·急智（从弃牌堆选 1 张或放弃）。
// 只读视图里对本人可见的字段；点名对本人不可见（视图里为 null）时一律视为不是本人。
// 引擎不支持的选项不给：可复活的目标、可传送的层、双鱼能否闪避等都按引擎守卫的同一口径推导。
//
// 对照：docs/manual/05-dream-thieves.md 双鱼（52-60 行）、白羊（62-70 行）、处女（100-111 行）、
//       天秤（113-120 行）、黑洞（150-158 行）、雅典娜（160-170 行）、恐怖分子（239-248 行）、意念判官（258-265 行）；
//       梦魇效果见 docs/manual/07-nightmare-cards.md；达尔文是扩展角色，说明书没有收录，以卡面「淘汰」为准

import type { MatchView } from '@icgame/game-engine';
import { handCardsAt, validHandPicks } from '../../../lib/handPick';
import { nightmareParamKind, plagueCandidates } from '../../../lib/nightmareParams';

export type AwaitedKind =
  | 'shoot-evade'
  | 'shoot-zealot'
  | 'libra-split'
  | 'libra-pick'
  | 'sudger'
  | 'virgo'
  | 'aries'
  | 'levy'
  | 'darwin'
  | 'athena';

/** SHOOT 一次结算的结果 */
export type ShootResult = 'kill' | 'move' | 'miss';

/** 双鱼·游离：被 SHOOT 时可以闪避 */
export interface ShootEvadeAwaited {
  readonly mine: true;
  readonly kind: 'shoot-evade';
  readonly shooterID: string;
  /** 被打出的牌；哈雷·冲击没有实体牌，此时为 null */
  readonly cardId: string | null;
  /** 能否闪避：双鱼要在第 2 层及以上才能移到更小的相邻层 */
  readonly canEvade: boolean;
  /** 闪避后到达的层（0 为迷失层）；不能闪避时为 null */
  readonly evadeLayer: number | null;
}

/** 恐怖分子·狂热：掷骰前弃 1 张手牌，否则掷骰结果 -1 */
export interface ShootZealotAwaited {
  readonly mine: true;
  readonly kind: 'shoot-zealot';
  readonly shooterID: string;
  readonly cardId: string | null;
  /** 本人手牌，每张都可以弃 */
  readonly hand: readonly string[];
}

/** 天秤·平衡 第 1 步：被交付全部手牌的人把手牌分成两份（一份可以为空） */
export interface LibraSplitAwaited {
  readonly mine: true;
  readonly kind: 'libra-split';
  readonly bonderID: string;
  readonly hand: readonly string[];
}

/** 天秤·平衡 第 2 步：发动者查看两份牌，取走其中一份 */
export interface LibraPickAwaited {
  readonly mine: true;
  readonly kind: 'libra-pick';
  readonly targetID: string;
  readonly pile1: readonly string[];
  readonly pile2: readonly string[];
}

export interface SudgerRollOption {
  readonly pick: 'A' | 'B';
  readonly roll: number;
  /** 采用这颗骰值时 SHOOT 的结果 */
  readonly result: ShootResult;
}

/** 意念判官·定罪：目标掷了 2 颗骰子，由发动者选 1 颗作为结果 */
export interface SudgerAwaited {
  readonly mine: true;
  readonly kind: 'sudger';
  readonly targetID: string;
  readonly cardId: string;
  readonly rolls: readonly [SudgerRollOption, SudgerRollOption];
}

/** 处女·完美：三选一（复活 / 抽 2 张 / 传送），也可以放弃 */
export interface VirgoAwaited {
  readonly mine: true;
  readonly kind: 'virgo';
  readonly triggerRoll: number;
  readonly shooterID: string;
  /** 处女是否还活着；已死亡时三个效果都不能执行，只能放弃 */
  readonly alive: boolean;
  /** 可复活的玩家：任何已死亡的玩家，不限阵营、含梦主（引擎只要求目标已死亡、不是处女自己） */
  readonly reviveTargets: readonly string[];
  /** 可传送到的层：1-4 层任选（不含迷失层） */
  readonly teleportLayers: readonly number[];
}

/** 白羊·星尘：被击杀者所在层的梦魇，发动或弃掉（不能保留） */
export interface AriesAwaited {
  readonly mine: true;
  readonly kind: 'aries';
  readonly victimID: string;
  readonly victimLayer: number;
  /** 白羊翻开的梦魇；视图里看不到时为 null */
  readonly nightmareId: string | null;
  /** 发动时是否需要选择：回音萦绕要选层与方式，邪念瘟疫要点名派发贿赂牌的盗梦者 */
  readonly params: 'none' | 'echo' | 'plague';
  /** 邪念瘟疫能点名的盗梦者：被击杀者所在层存活的非梦主座位 */
  readonly candidates: readonly string[];
  /** 贿赂池里还没派出的张数（点名人数上限） */
  readonly bribePoolCount: number;
}

/** 黑洞·吞噬：同层有手牌的每个人各选 1 张手牌交给黑洞（不挡先后，各自应答） */
export interface LevyAwaited {
  readonly mine: true;
  readonly kind: 'levy';
  readonly blackHoleID: string;
  /** 本人手牌，每张都可以交 */
  readonly hand: readonly string[];
}

/** 达尔文·淘汰：已抽到牌库顶 2 张，从现在的手牌里选刚好 2 张按顺序放回牌库顶 */
export interface DarwinAwaited {
  readonly mine: true;
  readonly kind: 'darwin';
  /** 抽牌之后的手牌 */
  readonly hand: readonly string[];
}

/** 雅典娜·急智：另一同层盗梦者对本人用行动牌，结算前可以从弃牌堆选 1 张收入手牌，也可以放弃 */
export interface AthenaAwaited {
  readonly mine: true;
  readonly kind: 'athena';
  readonly userID: string;
  /** 对方打出的牌 */
  readonly cardId: string;
  /** 弃牌堆（公开），每张都可以选 */
  readonly discard: readonly string[];
}

export type MineAwaited =
  | ShootEvadeAwaited
  | ShootZealotAwaited
  | LibraSplitAwaited
  | LibraPickAwaited
  | SudgerAwaited
  | VirgoAwaited
  | AriesAwaited
  | LevyAwaited
  | DarwinAwaited
  | AthenaAwaited;

/** 别人在应答：本人只需要等 */
export interface OtherAwaited {
  readonly mine: false;
}

export type AwaitedResponse = MineAwaited | OtherAwaited;

/** 达尔文·淘汰要放回牌库顶的张数 */
export const DARWIN_RETURN_COUNT = 2;
/** 回音萦绕·发动时的层数范围 */
export const ECHO_LAYERS: readonly number[] = [1, 2, 3, 4];
/** 传送可选的层 */
export const TELEPORT_LAYERS: readonly number[] = [1, 2, 3, 4];

/** 按骰值判定 SHOOT 结果：与引擎 resolveShootCustom 同一口径（先判死亡面，再判移动面） */
export function shootResultOf(
  roll: number,
  deathFaces: readonly number[],
  moveFaces: readonly number[],
): ShootResult {
  if (deathFaces.includes(roll)) return 'kill';
  if (moveFaces.includes(roll)) return 'move';
  return 'miss';
}

/** 由梦魇牌 ID 推出白羊发动时是否需要选择 */
export function ariesParamsOf(nightmareId: string | null): AriesAwaited['params'] {
  return nightmareParamKind(nightmareId);
}

const other: OtherAwaited = { mine: false };

function handOf(view: MatchView, seat: string): readonly string[] | null {
  const hand = view.players[seat]?.hand;
  return Array.isArray(hand) ? (hand as readonly string[]) : null;
}

/**
 * 当前正在等待应答的情形，及其是否轮到本人；没有待决状态返回 null。
 * 阻塞类先判断（与引擎行动权表同序），白羊的选择不挡住回合主人，放最后。
 */
export function awaitedResponse(view: MatchView, seat: string | null): AwaitedResponse | null {
  const me = seat === null ? undefined : view.players[seat];

  const shoot = view.pendingShootResponse;
  if (shoot) {
    // 响应类型只有目标本人看得到：看不到就不是本人
    if (seat === null || shoot.targetPlayerID !== seat || shoot.responseType === null) return other;
    if (shoot.responseType === 'terrorist') {
      const hand = handOf(view, seat);
      if (hand === null) return other;
      return {
        mine: true,
        kind: 'shoot-zealot',
        shooterID: shoot.shooterID,
        cardId: shoot.cardId,
        hand,
      };
    }
    const layer = me?.currentLayer;
    // 引擎的双鱼闪避守卫：第 1 层及以下不能闪避
    const canEvade = typeof layer === 'number' && layer > 1;
    return {
      mine: true,
      kind: 'shoot-evade',
      shooterID: shoot.shooterID,
      cardId: shoot.cardId,
      canEvade,
      evadeLayer: canEvade ? layer - 1 : null,
    };
  }

  const libra = view.pendingLibra;
  if (libra) {
    if (seat === null) return other;
    if (!libra.split) {
      if (libra.targetPlayerID !== seat) return other;
      const hand = handOf(view, seat);
      if (hand === null) return other;
      return { mine: true, kind: 'libra-split', bonderID: libra.bonderPlayerID, hand };
    }
    if (libra.bonderPlayerID !== seat) return other;
    const { pile1, pile2 } = libra.split;
    // 两份的内容只有发动者和被要求分牌的人看得到
    if (pile1 === null || pile2 === null) return other;
    return { mine: true, kind: 'libra-pick', targetID: libra.targetPlayerID, pile1, pile2 };
  }

  const sudger = view.pendingSudgerRolls;
  if (sudger) {
    // 由回合主人（定罪的发动者）选骰
    if (seat === null || view.currentPlayerID !== seat) return other;
    const option = (pick: 'A' | 'B', roll: number): SudgerRollOption => ({
      pick,
      roll,
      result: shootResultOf(roll, sudger.deathFaces, sudger.moveFaces),
    });
    return {
      mine: true,
      kind: 'sudger',
      targetID: sudger.targetPlayerID,
      cardId: sudger.cardId,
      rolls: [option('A', sudger.rollA), option('B', sudger.rollB)],
    };
  }

  const virgo = view.pendingVirgoChoice;
  if (virgo) {
    if (seat === null || virgo.virgoID === null || virgo.virgoID !== seat) return other;
    const alive = me?.isAlive === true;
    const reviveTargets = alive
      ? Object.values(view.players)
          .filter((p) => !p.isAlive && p.id !== seat)
          .map((p) => p.id)
      : [];
    return {
      mine: true,
      kind: 'virgo',
      triggerRoll: virgo.triggerRoll,
      shooterID: virgo.shooterID,
      alive,
      reviveTargets,
      teleportLayers: alive ? TELEPORT_LAYERS : [],
    };
  }

  // 黑洞·吞噬：名单里的每个人都可以交，不限先后；不在名单里（含黑洞自己）的只需要等
  const levy = view.pendingBlackHoleLevy;
  if (levy) {
    if (seat === null || !levy.waiting.includes(seat)) return other;
    const hand = handOf(view, seat);
    if (hand === null) return other;
    return { mine: true, kind: 'levy', blackHoleID: levy.blackHoleID, hand };
  }

  // 雅典娜·急智：雅典娜是谁只有她本人看得到
  const athena = view.pendingAthenaWit;
  if (athena) {
    if (seat === null || athena.athenaID === null || athena.athenaID !== seat) return other;
    return {
      mine: true,
      kind: 'athena',
      userID: athena.userID,
      cardId: athena.cardId,
      discard: view.deck.discardPile,
    };
  }

  const darwin = view.pendingDarwinReturn;
  if (darwin) {
    if (seat === null || darwin.playerID !== seat) return other;
    const hand = handOf(view, seat);
    if (hand === null) return other;
    return { mine: true, kind: 'darwin', hand };
  }

  const aries = view.pendingAriesChoice;
  if (aries) {
    if (seat === null || aries.ariesID === null || aries.ariesID !== seat) return other;
    const layer = view.layers[aries.victimLayer];
    const nightmareId = layer?.nightmareId ?? null;
    return {
      mine: true,
      kind: 'aries',
      victimID: aries.victimID,
      victimLayer: aries.victimLayer,
      nightmareId,
      params: ariesParamsOf(nightmareId),
      candidates: plagueCandidates(layer?.playersInLayer ?? [], view.players, view.dreamMasterID),
      bribePoolCount: (view.bribePool ?? []).filter((b) => b.status === 'inPool').length,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// 操作：按钮与弹窗
// ---------------------------------------------------------------------------

/** 需要选牌、分牌、选层的弹窗 */
export type AwaitedSheet =
  | 'zealot-discard'
  | 'libra-split'
  | 'libra-pick'
  | 'virgo-revive'
  | 'virgo-teleport'
  | 'aries-echo'
  | 'aries-plague'
  | 'levy-give'
  | 'darwin-return'
  | 'athena-pick';

/** 点击一个操作按钮的效果：直接发 move，或打开弹窗 */
export type AwaitedEffect =
  | { readonly type: 'move'; readonly move: string; readonly args: readonly unknown[] }
  | { readonly type: 'sheet'; readonly sheet: AwaitedSheet };

export interface AwaitedAction {
  /** 稳定标识：data-testid 与测试用 */
  readonly id: string;
  /** i18n 键 */
  readonly labelKey: string;
  readonly labelParams?: Readonly<Record<string, string | number>>;
  /** 按钮下的补充说明（i18n 键） */
  readonly hintKey?: string;
  /** 主操作用强调样式 */
  readonly tone: 'primary' | 'plain';
  readonly disabled: boolean;
  /** 放弃 / 不发动这一类「不做选择」的操作 */
  readonly decline: boolean;
  readonly effect: AwaitedEffect;
}

const move = (name: string, ...args: unknown[]): AwaitedEffect => ({
  type: 'move',
  move: name,
  args,
});
const sheet = (name: AwaitedSheet): AwaitedEffect => ({ type: 'sheet', sheet: name });

/** 本人应答时窗口 / 响应条上的按钮；按钮顺序即界面顺序 */
export function awaitedActions(awaited: MineAwaited): AwaitedAction[] {
  switch (awaited.kind) {
    case 'shoot-evade':
      return [
        {
          id: 'evade',
          labelKey: 'awaited.shootEvade.evade',
          labelParams: { layer: awaited.evadeLayer ?? 0 },
          tone: 'primary',
          disabled: !awaited.canEvade,
          decline: false,
          effect: move('respondShootEvade'),
        },
        {
          id: 'pass',
          labelKey: 'awaited.shootEvade.pass',
          tone: 'plain',
          disabled: false,
          decline: true,
          effect: move('respondShootPass'),
        },
      ];
    case 'shoot-zealot':
      return [
        {
          id: 'discard',
          labelKey: 'awaited.zealot.discard',
          tone: 'primary',
          disabled: awaited.hand.length === 0,
          decline: false,
          effect: sheet('zealot-discard'),
        },
        {
          id: 'accept',
          labelKey: 'awaited.zealot.accept',
          tone: 'plain',
          disabled: false,
          decline: true,
          effect: move('respondTerroristAccept'),
        },
      ];
    case 'libra-split':
      return [
        {
          id: 'split',
          labelKey: 'awaited.libraSplit.open',
          tone: 'primary',
          disabled: false,
          decline: false,
          effect: sheet('libra-split'),
        },
      ];
    case 'libra-pick':
      return [
        {
          id: 'pick',
          labelKey: 'awaited.libraPick.open',
          tone: 'primary',
          disabled: false,
          decline: false,
          effect: sheet('libra-pick'),
        },
      ];
    case 'sudger':
      return awaited.rolls.map((r) => ({
        id: `pick-${r.pick.toLowerCase()}`,
        labelKey: 'awaited.sudger.pick',
        labelParams: { pick: r.pick, roll: r.roll },
        hintKey: `awaited.result.${r.result}`,
        tone: 'primary' as const,
        disabled: false,
        decline: false,
        effect: move('resolveSudgerPick', r.pick),
      }));
    case 'virgo':
      return [
        {
          id: 'revive',
          labelKey: 'awaited.virgo.revive',
          tone: 'primary',
          disabled: awaited.reviveTargets.length === 0,
          decline: false,
          effect: sheet('virgo-revive'),
        },
        {
          id: 'draw-two',
          labelKey: 'awaited.virgo.drawTwo',
          tone: 'primary',
          disabled: !awaited.alive,
          decline: false,
          effect: move('respondVirgoPerfect', 'draw_two'),
        },
        {
          id: 'teleport',
          labelKey: 'awaited.virgo.teleport',
          tone: 'primary',
          disabled: awaited.teleportLayers.length === 0,
          decline: false,
          effect: sheet('virgo-teleport'),
        },
        {
          id: 'skip',
          labelKey: 'awaited.virgo.skip',
          tone: 'plain',
          disabled: false,
          decline: true,
          effect: move('respondVirgoPerfect', 'skip'),
        },
      ];
    case 'levy':
      return [
        {
          id: 'give',
          labelKey: 'awaited.levy.give',
          tone: 'primary',
          disabled: awaited.hand.length === 0,
          decline: false,
          effect: sheet('levy-give'),
        },
      ];
    case 'darwin':
      return [
        {
          id: 'return',
          labelKey: 'awaited.darwin.open',
          tone: 'primary',
          disabled: awaited.hand.length < DARWIN_RETURN_COUNT,
          decline: false,
          effect: sheet('darwin-return'),
        },
      ];
    case 'athena':
      return [
        {
          id: 'take',
          labelKey: 'awaited.athena.take',
          tone: 'primary',
          disabled: awaited.discard.length === 0,
          decline: false,
          effect: sheet('athena-pick'),
        },
        {
          id: 'pass',
          labelKey: 'awaited.athena.pass',
          tone: 'plain',
          disabled: false,
          decline: true,
          effect: move('respondAthenaWit', null),
        },
      ];
    case 'aries': {
      const activateSheet: AwaitedSheet | null =
        awaited.params === 'echo'
          ? 'aries-echo'
          : awaited.params === 'plague'
            ? 'aries-plague'
            : null;
      return [
        {
          id: 'activate',
          labelKey: 'awaited.aries.activate',
          tone: 'primary',
          // 看不到梦魇或该层已没有梦魇时，发动无从谈起（引擎会拒绝）
          disabled: awaited.nightmareId === null,
          decline: false,
          effect: activateSheet ? sheet(activateSheet) : move('playAriesStardustActivate'),
        },
        {
          id: 'discard',
          labelKey: 'awaited.aries.discard',
          tone: 'plain',
          disabled: awaited.nightmareId === null,
          decline: false,
          effect: move('playAriesStardustDiscard'),
        },
      ];
    }
  }
}

// ---------------------------------------------------------------------------
// 弹窗里的草稿：选了什么、能否确认、确认后发什么
// ---------------------------------------------------------------------------

export interface AwaitedDraft {
  /** 狂热：选中要弃的手牌位置 */
  readonly discardIndex: number | null;
  /** 分牌：放进第 2 份的手牌位置（其余在第 1 份） */
  readonly secondPile: readonly number[];
  /** 处女·复活的目标 */
  readonly reviveTarget: string | null;
  /** 处女·传送的层 */
  readonly teleportLayer: number | null;
  /** 回音萦绕的目标层与方式 */
  readonly echoLayer: number | null;
  readonly echoAction: 'restore' | 'add' | null;
  /** 邪念瘟疫点名要派发贿赂牌的盗梦者 */
  readonly bribed: readonly string[];
  /** 黑洞·吞噬：选中要交出的手牌位置 */
  readonly giveIndex: number | null;
  /** 达尔文·淘汰：选中要放回的手牌位置，按选择顺序（第 1 张放在牌库最顶） */
  readonly returnPicks: readonly number[];
  /** 雅典娜·急智：选中的弃牌堆里的牌 */
  readonly athenaCard: string | null;
}

export const EMPTY_DRAFT: AwaitedDraft = {
  discardIndex: null,
  secondPile: [],
  reviveTarget: null,
  teleportLayer: null,
  echoLayer: null,
  echoAction: null,
  bribed: [],
  giveIndex: null,
  returnPicks: [],
  athenaCard: null,
};

/** 切换一个位置是否在列表里（保持升序、不重复） */
export function toggleIndex(list: readonly number[], index: number): number[] {
  return list.includes(index)
    ? list.filter((i) => i !== index)
    : [...list, index].sort((a, b) => a - b);
}

/** 按「第 2 份」的位置把手牌分成两份；越界的位置忽略 */
export function splitPiles(
  hand: readonly string[],
  secondPile: readonly number[],
): { pile1: string[]; pile2: string[] } {
  const second = new Set(secondPile);
  const pile1: string[] = [];
  const pile2: string[] = [];
  hand.forEach((card, i) => (second.has(i) ? pile2 : pile1).push(card));
  return { pile1, pile2 };
}

/** 弃牌堆按牌种归并：保持首次出现的顺序，带张数 */
export function groupDiscard(
  discard: readonly string[],
): readonly { readonly card: string; readonly count: number }[] {
  const counts = new Map<string, number>();
  for (const card of discard) counts.set(card, (counts.get(card) ?? 0) + 1);
  return [...counts].map(([card, count]) => ({ card, count }));
}

export interface AwaitedCommand {
  readonly move: string;
  readonly args: readonly unknown[];
}

/**
 * 弹窗里点「确认」时要发的 move；弹窗与待决状态对不上、或草稿还没选完时返回 null。
 * 天秤挑一份不走草稿（两个按钮各发一次），由 libraPickCommand 给出。
 */
export function sheetCommand(
  awaited: MineAwaited,
  sheetName: AwaitedSheet,
  draft: AwaitedDraft,
): AwaitedCommand | null {
  switch (sheetName) {
    case 'zealot-discard': {
      if (awaited.kind !== 'shoot-zealot' || draft.discardIndex === null) return null;
      const card = awaited.hand[draft.discardIndex];
      return card === undefined ? null : { move: 'respondTerroristDiscard', args: [card] };
    }
    case 'libra-split': {
      if (awaited.kind !== 'libra-split') return null;
      const { pile1, pile2 } = splitPiles(awaited.hand, draft.secondPile);
      return { move: 'resolveLibraSplit', args: [pile1, pile2] };
    }
    case 'virgo-revive': {
      if (awaited.kind !== 'virgo' || draft.reviveTarget === null) return null;
      if (!awaited.reviveTargets.includes(draft.reviveTarget)) return null;
      return { move: 'respondVirgoPerfect', args: ['revive', { targetID: draft.reviveTarget }] };
    }
    case 'virgo-teleport': {
      if (awaited.kind !== 'virgo' || draft.teleportLayer === null) return null;
      if (!awaited.teleportLayers.includes(draft.teleportLayer)) return null;
      return { move: 'respondVirgoPerfect', args: ['teleport', { layer: draft.teleportLayer }] };
    }
    case 'aries-echo': {
      if (awaited.kind !== 'aries' || awaited.params !== 'echo') return null;
      if (draft.echoLayer === null || draft.echoAction === null) return null;
      return {
        move: 'playAriesStardustActivate',
        args: [{ targetLayer: draft.echoLayer, action: draft.echoAction }],
      };
    }
    case 'aries-plague': {
      if (awaited.kind !== 'aries' || awaited.params !== 'plague') return null;
      return {
        move: 'playAriesStardustActivate',
        args: [{ bribedTargets: [...draft.bribed] }],
      };
    }
    case 'levy-give': {
      if (awaited.kind !== 'levy' || draft.giveIndex === null) return null;
      const card = awaited.hand[draft.giveIndex];
      return card === undefined ? null : { move: 'respondBlackHoleLevy', args: [card] };
    }
    case 'darwin-return': {
      if (awaited.kind !== 'darwin') return null;
      const picks = validHandPicks(draft.returnPicks, awaited.hand.length);
      if (picks.length !== DARWIN_RETURN_COUNT || picks.length !== draft.returnPicks.length) {
        return null;
      }
      return { move: 'respondDarwinReturn', args: [handCardsAt(awaited.hand, picks)] };
    }
    case 'athena-pick': {
      if (awaited.kind !== 'athena' || draft.athenaCard === null) return null;
      if (!awaited.discard.includes(draft.athenaCard)) return null;
      return { move: 'respondAthenaWit', args: [draft.athenaCard] };
    }
    case 'libra-pick':
      return null;
  }
}

/** 天秤·挑一份 */
export function libraPickCommand(pick: 'pile1' | 'pile2'): AwaitedCommand {
  return { move: 'resolveLibraPick', args: [pick] };
}

/** 本次应答的识别串：变了就说明是另一次待决状态，弹窗与草稿都该重置 */
export function awaitedKey(awaited: MineAwaited | null, turnNumber: number): string | null {
  if (awaited === null) return null;
  switch (awaited.kind) {
    case 'shoot-evade':
    case 'shoot-zealot':
      return `${awaited.kind}|${turnNumber}|${awaited.shooterID}|${awaited.cardId}`;
    case 'libra-split':
      return `${awaited.kind}|${turnNumber}|${awaited.bonderID}|${awaited.hand.join(',')}`;
    case 'libra-pick':
      return `${awaited.kind}|${turnNumber}|${awaited.targetID}`;
    case 'sudger':
      return `${awaited.kind}|${turnNumber}|${awaited.targetID}|${awaited.rolls[0].roll}-${awaited.rolls[1].roll}`;
    case 'virgo':
      return `${awaited.kind}|${turnNumber}|${awaited.shooterID}|${awaited.triggerRoll}`;
    case 'aries':
      return `${awaited.kind}|${turnNumber}|${awaited.victimID}|${awaited.victimLayer}`;
    case 'levy':
      return `${awaited.kind}|${turnNumber}|${awaited.blackHoleID}|${awaited.hand.join(',')}`;
    case 'darwin':
      return `${awaited.kind}|${turnNumber}|${awaited.hand.join(',')}`;
    case 'athena':
      return `${awaited.kind}|${turnNumber}|${awaited.userID}|${awaited.cardId}`;
  }
}

/** 有真实截止时间的应答：白羊不挡人，没有自己的时限 */
export function hasOwnDeadline(awaited: MineAwaited): boolean {
  return awaited.kind !== 'aries';
}
