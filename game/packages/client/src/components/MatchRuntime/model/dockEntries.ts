// 底部坞的「操作入口」推导：复活（本人在迷失层）、复活同伴（本人存活而场上有人在迷失层）、梦主的移动。
// 纯函数：只读按座位裁剪的视图里公开的字段（谁在迷失层、梦主是谁与角色、本人手牌与本人回合计数），
// 与布局无关；引擎的合法性判定在服务端，这里只把「引擎必拒」的入口提前置灰并说明原因。
//
// 抽牌阶段还有：略过抽牌、小丑·失控（略过抽牌后掷骰决定抽几张）、黑天鹅·纷飞（把全部手牌分给其他盗梦者再抽 4 张）、
// 黑洞·吞噬（放弃抽牌，令同层有手牌的玩家各交 1 张手牌给自己）。
//
// 对照：docs/manual/03-game-flow.md:65-67 复活（出牌阶段弃 2 张手牌复活自己或他人；复活自己到第 1 层、
//       复活他人到自己所在层；自己在迷失层不能复活他人）；
//       docs/manual/06-dream-master.md:90 密道世界观（只能弃 1 张梦境穿梭剂复活）；
//       docs/manual/03-game-flow.md:82 梦主每回合可免费移动到相邻层一次；
//       docs/manual/05-dream-thieves.md:150-158 黑洞·吞噬。

/** 与引擎的 MASTER_FREE_MOVE_KEY 一致（有测试对账）：梦主本回合已用过免费移动 */
export const MASTER_FREE_MOVE_KEY = 'master.freeMove';
/** 与引擎的 REVIVED_SELF_THIS_TURN_KEY 一致（有测试对账）：本回合复活过自己 */
export const REVIVED_SELF_KEY = 'revive.self';

/** 密道梦主的角色标识：世界观生效时复活只能弃 1 张梦境穿梭剂 */
export const SECRET_PASSAGE_MASTER_ID = 'dm_secret_passage';
/** 密道世界观下复活要弃的牌 */
export const REVIVE_TRANSIT_CARD = 'action_dream_transit';

/** 推导用的玩家信息（视图里的 PlayerView 是它的超集） */
export interface EntryPlayer {
  readonly isAlive: boolean;
  readonly currentLayer: number;
  readonly nickname?: string | null;
  readonly characterId?: string | null;
  /** 手牌张数（公开）；黑洞·吞噬据此判断同层有没有人交得出牌 */
  readonly handCount?: number | null;
  /** 只有本人的视图里有 */
  readonly skillUsedThisTurn?: Readonly<Record<string, number>> | null;
}

export type DockEntryKind =
  | 'reviveSelf'
  | 'reviveOther'
  | 'masterMove'
  | 'skipDraw'
  | 'jokerGamble'
  | 'blackSwanTour'
  | 'blackHoleLevy';

/** 黑洞的角色标识：抽牌阶段可以放弃抽牌，令同层有手牌的玩家各交 1 张（黑洞·吞噬） */
export const BLACK_HOLE_CHARACTER_ID = 'thief_black_hole';
/** 黑洞·吞噬的技能使用记录键（与引擎的 BLACK_HOLE_LEVY_SKILL_ID 一致，有测试对账）：回合限一次 */
export const BLACK_HOLE_LEVY_SKILL_KEY = 'thief_black_hole.skill_0';

/** 小丑的角色标识：抽牌阶段可以改掷骰抽牌（小丑·失控） */
export const JOKER_CHARACTER_ID = 'thief_joker';
/** 黑天鹅的角色标识：抽牌阶段可以把全部手牌分给其他盗梦者再抽 4 张（黑天鹅·纷飞） */
export const BLACK_SWAN_CHARACTER_ID = 'thief_black_swan';
/** 黑天鹅·纷飞的技能使用记录键（与引擎的 BLACK_SWAN_SKILL_ID 一致，有测试对账）：回合限一次 */
export const BLACK_SWAN_SKILL_KEY = 'thief_black_swan.skill_0';

/** 入口不可用的原因（i18n 键 + 参数） */
export interface EntryReason {
  readonly key: string;
  readonly params?: Readonly<Record<string, number>>;
}

export interface DockEntrySpec {
  readonly kind: DockEntryKind;
  readonly enabled: boolean;
  readonly reason: EntryReason | null;
}

export interface DockEntriesInput {
  readonly seat: string;
  readonly dreamMasterID: string;
  readonly players: Readonly<Record<string, EntryPlayer | undefined>>;
  readonly hand: readonly string[];
  readonly isMyTurn: boolean;
  readonly turnPhase: string;
  readonly winner: string | null;
  /** 有别的待办（出牌意图、各类待结算 / 待应答）占着界面 */
  readonly busy: boolean;
}

// ---------------------------------------------------------------------------
// 复活的规则
// ---------------------------------------------------------------------------

/** 梦主是密道：世界观生效 */
export function isSecretPassageActive(
  players: Readonly<Record<string, EntryPlayer | undefined>>,
  dreamMasterID: string,
): boolean {
  return players[dreamMasterID]?.characterId === SECRET_PASSAGE_MASTER_ID;
}

/** 复活要弃几张牌、是否只能弃梦境穿梭剂 */
export function reviveRequirement(passage: boolean): { count: number; onlyTransit: boolean } {
  return passage ? { count: 1, onlyTransit: true } : { count: 2, onlyTransit: false };
}

/** 这张牌能不能用来付复活的代价 */
export function reviveCardEligible(card: string, passage: boolean): boolean {
  return !passage || card === REVIVE_TRANSIT_CARD;
}

/** 可复活的对象：其他已在迷失层的玩家（引擎只要求目标已死亡、不是自己） */
export function reviveTargetIds(
  players: Readonly<Record<string, EntryPlayer | undefined>>,
  seat: string,
): string[] {
  return Object.entries(players)
    .filter(([id, p]) => id !== seat && p !== undefined && !p.isAlive)
    .map(([id]) => id);
}

/** 手牌付得起复活的代价吗 */
function handCoversRevive(hand: readonly string[], passage: boolean): boolean {
  const { count } = reviveRequirement(passage);
  return hand.filter((c) => reviveCardEligible(c, passage)).length >= count;
}

/** 复活弹层能否确认：选够了张数、牌都合格、复活同伴时已选定对象 */
export function canConfirmRevive(input: {
  readonly mode: 'self' | 'other';
  readonly target: string | null;
  readonly hand: readonly string[];
  readonly picked: readonly number[];
  readonly passage: boolean;
}): boolean {
  const { mode, target, hand, picked, passage } = input;
  const { count } = reviveRequirement(passage);
  if (mode === 'other' && target === null) return false;
  if (picked.length !== count) return false;
  return picked.every((i) => {
    const card = hand[i];
    return card !== undefined && reviveCardEligible(card, passage);
  });
}

/** playRevive 的参数：(目标座位或 null 表示自己, 要弃的牌 id 列表)；弃牌按手牌位置选，同名牌各算一张 */
export function reviveArgs(
  target: string | null,
  hand: readonly string[],
  picked: readonly number[],
): [string | null, string[]] {
  return [target, picked.flatMap((i) => (hand[i] !== undefined ? [hand[i]!] : []))];
}

// ---------------------------------------------------------------------------
// 梦主的移动
// ---------------------------------------------------------------------------

/** 相邻的梦境层（第 1 层与第 4 层不相邻；不含迷失层） */
export function adjacentLayers(layer: number): number[] {
  return [layer - 1, layer + 1].filter((l) => l >= 1 && l <= 4);
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

/**
 * 此刻要显示哪些入口、各自能否使用。
 * 只在本人回合、对局未结束时有入口：抽牌阶段是略过抽牌（与小丑·失控），出牌阶段是复活与梦主的移动；
 * 入口存在但此刻用不了时 enabled=false 并带原因。
 */
export function deriveDockEntries(input: DockEntriesInput): DockEntrySpec[] {
  const { seat, dreamMasterID, players, hand, isMyTurn, turnPhase, winner, busy } = input;
  if (!isMyTurn || winner) return [];
  const me = players[seat];
  if (!me) return [];

  if (turnPhase === 'draw') {
    return deriveDrawEntries({ seat, dreamMasterID, players, me, hand, busy });
  }
  if (turnPhase !== 'action') return [];

  const passage = isSecretPassageActive(players, dreamMasterID);
  const { count } = reviveRequirement(passage);
  const reviveShort: EntryReason | null = handCoversRevive(hand, passage)
    ? null
    : passage
      ? { key: 'entries.reason.transitShort' }
      : { key: 'entries.reason.handShort', params: { count, have: hand.length } };
  const busyReason: EntryReason = { key: 'entries.reason.busy' };

  const entry = (kind: DockEntryKind, reason: EntryReason | null): DockEntrySpec => ({
    kind,
    enabled: reason === null,
    reason,
  });

  // 在迷失层：只能复活自己，不能做别的
  if (!me.isAlive) return [entry('reviveSelf', busy ? busyReason : reviveShort)];

  const out: DockEntrySpec[] = [];
  if (seat === dreamMasterID) {
    const used = (me.skillUsedThisTurn?.[MASTER_FREE_MOVE_KEY] ?? 0) > 0;
    out.push(
      entry('masterMove', busy ? busyReason : used ? { key: 'entries.move.reason.used' } : null),
    );
  }
  if (reviveTargetIds(players, seat).length > 0) {
    out.push(entry('reviveOther', busy ? busyReason : reviveShort));
  }
  return out;
}

/**
 * 抽牌阶段的入口：略过抽牌（任何人都可以）；小丑存活时多一个小丑·失控；黑天鹅存活时多一个黑天鹅·纷飞；
 * 黑洞存活时多一个黑洞·吞噬。
 * 黑天鹅·纷飞引擎要求：存活、手里至少 1 张牌、本回合没发动过、有别的存活盗梦者可以接收（梦主不算）。
 * 对照：docs/manual/05-dream-thieves.md 小丑、黑天鹅；引擎的 skipDraw / playJokerGamble / playBlackSwanTour（只认抽牌阶段与本人回合）
 */
function deriveDrawEntries(input: {
  readonly seat: string;
  readonly dreamMasterID: string;
  readonly players: Readonly<Record<string, EntryPlayer | undefined>>;
  readonly me: EntryPlayer;
  readonly hand: readonly string[];
  readonly busy: boolean;
}): DockEntrySpec[] {
  const { seat, dreamMasterID, players, me, hand, busy } = input;
  const busyReason: EntryReason | null = busy ? { key: 'entries.reason.busy' } : null;
  const entry = (kind: DockEntryKind, reason: EntryReason | null = busyReason): DockEntrySpec => ({
    kind,
    enabled: reason === null,
    reason,
  });
  const out = [entry('skipDraw')];
  if (me.isAlive && me.characterId === JOKER_CHARACTER_ID) out.push(entry('jokerGamble'));
  if (me.isAlive && me.characterId === BLACK_SWAN_CHARACTER_ID) {
    const recipients = Object.entries(players).filter(
      ([id, p]) => id !== seat && id !== dreamMasterID && p?.isAlive === true,
    ).length;
    const used = (me.skillUsedThisTurn?.[BLACK_SWAN_SKILL_KEY] ?? 0) > 0;
    const reason: EntryReason | null = busyReason
      ? busyReason
      : hand.length === 0
        ? { key: 'entries.reason.tourNoHand' }
        : used
          ? { key: 'entries.reason.tourUsed' }
          : recipients === 0
            ? { key: 'entries.reason.tourNoRecipient' }
            : null;
    out.push(entry('blackSwanTour', reason));
  }
  if (me.isAlive && me.characterId === BLACK_HOLE_CHARACTER_ID) {
    // 引擎要求：本回合没发动过，且同层至少有一名存活的其他玩家手里有牌（手牌张数是公开信息）
    const givers = Object.entries(players).filter(
      ([id, p]) =>
        id !== seat &&
        p?.isAlive === true &&
        p.currentLayer === me.currentLayer &&
        (p.handCount ?? 0) > 0,
    ).length;
    const used = (me.skillUsedThisTurn?.[BLACK_HOLE_LEVY_SKILL_KEY] ?? 0) > 0;
    const reason: EntryReason | null = busyReason
      ? busyReason
      : used
        ? { key: 'entries.reason.levyUsed' }
        : givers === 0
          ? { key: 'entries.reason.levyNoGiver' }
          : null;
    out.push(entry('blackHoleLevy', reason));
  }
  return out;
}

/** 端到端用例与样式依赖的 data-testid */
export function entryTestId(kind: DockEntryKind): string {
  switch (kind) {
    case 'reviveSelf':
      return 'dock-entry-revive-self';
    case 'reviveOther':
      return 'dock-entry-revive-other';
    case 'masterMove':
      return 'dock-entry-move';
    case 'skipDraw':
      return 'dock-entry-skip-draw';
    case 'jokerGamble':
      return 'dock-entry-joker';
    case 'blackSwanTour':
      return 'dock-entry-tour';
    case 'blackHoleLevy':
      return 'dock-entry-levy';
  }
}
