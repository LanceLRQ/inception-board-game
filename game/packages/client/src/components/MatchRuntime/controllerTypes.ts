// 对局界面控制层的对外类型：布局只读这个对象，不直接碰对局来源与视图推导
//
// 控制层（useMatchController）拥有全部状态推导、出牌 / 弃牌 / 选目标的本地状态与回调；
// 布局组件（desktop/ 与 mobile/）与弹窗群（MatchDialogs）只消费 MatchController，彼此不互相依赖。

import type { MatchView, RunnerCtx, SeatInfo } from '@icgame/game-engine';
import type { ChatPresetPhrase } from '@icgame/shared';
import type { ChatEntry } from '../../match/chat';
import type { MatchSource, MoveOutcome } from '../../match/matchSource';
import type { ReportOutcome, ReportReason } from '../../lib/reportApi';
import type { ReportTarget } from './reportTargets';
import type { ActiveSkillContext, ActiveSkillDescriptor } from '../../lib/activeSkills';
import type { PlayRole } from '../../lib/cards';
import type { NightmareParamDraft } from '../../lib/nightmareParams';
import type { ChessVaultInfo } from '../ChessTransposeDialog';
import type { GravityTargetOption } from '../GravityTargetPickerDialog';
import type { AwaitingNotice } from './awaitingNotice';
import type { DockEntryKind, EntryReason } from './model/dockEntries';
import type { PlayBlockReason } from './model/handDerive';
import type {
  AwaitedAction,
  AwaitedDraft,
  AwaitedSheet,
  MineAwaited,
} from './response/awaitedResponse';

/** 包好提示与日志的 move 派发；silent 的 move 被拒时不弹提示 */
export type MatchMakeMove = (
  move: string,
  args?: unknown[],
  opts?: { silent?: boolean },
) => Promise<MoveOutcome>;

/** 出牌意图：action 阶段选中一张牌后，进入「选目标 / 确认」流程 */
export interface PendingPlay {
  readonly card: string;
  readonly move: string;
  readonly needsTarget: 'player' | 'layer' | 'none';
  readonly argOrder?: 'target_first' | 'card_first';
  /** SHOOT·梦境穿梭剂 专用：shoot | transit 模式（非空时 move 签名为 (cardId, mode, target)） */
  readonly dreamMode?: 'shoot' | 'transit';
}

/** 一张手牌当前能做什么：弃牌选择 / 可出牌 / 只读 */
export type HandCardMode = 'discard' | 'play' | 'idle';

export interface HandCardItem {
  readonly card: string;
  /** 手牌里的位置 */
  readonly index: number;
  readonly name: string;
  readonly imageUrl: string | undefined;
  readonly mode: HandCardMode;
  /** 行动阶段轮到本人、但引擎必拒这张牌时的原因（已在迷失层、梦主的解封等）；否则为 null */
  readonly blockReason: PlayBlockReason | null;
  /** 弃牌阶段已被选中 */
  readonly selected: boolean;
  /** 是当前出牌意图对应的那张牌 */
  readonly pending: boolean;
}

/** 卡图预加载进度 */
export interface PreloadProgress {
  readonly loaded: number;
  readonly total: number;
  readonly failed: number;
}

/** 本人座位在视图里的信息；就绪前或没有座位为 null */
export interface SelfInfo {
  readonly seat: string;
  /** 本人角色；视图里没有时为空串 */
  readonly characterId: string;
  readonly faction: string;
  readonly layer: number;
  readonly isAlive: boolean;
  readonly bribeReceived: number;
}

export interface TurnModel {
  readonly number: number;
  readonly phase: string;
  /** 当前行动座位 */
  readonly currentSeat: string;
  readonly isMine: boolean;
  /** 别人回合的文案（i18n 键 + 参数） */
  readonly otherTurn: { readonly key: string; readonly params: Record<string, string> };
  /** 服务端截止时间的剩余秒数；没有截止时间为 null */
  readonly deadlineSeconds: number | null;
  readonly deadlineAt: number | null;
  /** 对局正在等某位玩家应答时的提示（谁在等由视图决定）；轮到本人且 response 有操作界面时，等待提示不再显示，由应答窗口承担 */
  readonly awaiting: AwaitingNotice | null;
}

export interface TakeoverModel {
  /** 本人座位是否被 Bot 托管 */
  readonly active: boolean;
  /** 是否显示托管横幅（仅联机） */
  readonly bannerVisible: boolean;
  readonly resume: () => void;
}

export interface HandModel {
  /** 视图里本人是否带着手牌 */
  readonly available: boolean;
  readonly cards: readonly string[];
  readonly items: readonly HandCardItem[];
  /** 超出手牌上限的张数 */
  readonly overflow: number;
  /** 弃牌阶段且轮到本人且超出上限：必须选牌弃掉 */
  readonly mustDiscard: boolean;
  /** 弃牌阶段点第 index 张手牌：切换选中（按位置，同名牌各算一张）；其他阶段无操作 */
  readonly tap: (index: number) => void;
}

export interface StageModel {
  readonly G: MatchView;
  readonly ctx: RunnerCtx;
  readonly humanPlayerID: string;
  readonly seats: readonly SeatInfo[];
}

export interface DecreeModel {
  /** 手牌里的死亡宣言 */
  readonly options: readonly string[];
  readonly selected: string | null;
  readonly toggle: (card: string) => void;
  readonly clear: () => void;
  /** 当前出牌意图是 SHOOT 系且手里有死亡宣言：此刻应当显示可选项 */
  readonly applicable: boolean;
}

/** 射手·禁足：打出普通 SHOOT 时可以选择令目标不移动 */
export interface PreventMoveModel {
  /** 此刻应当显示：本人是射手，出牌意图是普通 SHOOT */
  readonly applicable: boolean;
  readonly value: boolean;
  readonly toggle: () => void;
}

export interface PlayModel {
  /** 当前有效的出牌意图；牌不在手牌或不在行动阶段时为 null */
  readonly pending: PendingPlay | null;
  /**
   * 确认打出一张牌（两步出牌的第二步）：无目标的牌直接发 move，
   * 需要目标的牌进入选目标流程（之后与 start 相同）；牌此刻不能打则无操作。
   */
  readonly commit: (card: string) => void;
  readonly confirmNoTarget: () => Promise<void>;
  readonly confirmTargetPlayer: (targetPlayerID: string) => Promise<void>;
  readonly confirmTargetLayer: (targetLayer: number) => Promise<void>;
  readonly cancel: () => void;
  /** 选目标玩家的弹层所需的出牌意图；弹层不该开时为 null */
  readonly targetPlayerPending: { readonly card: string; readonly move: string } | null;
  /** 选目标层的弹层所需的出牌意图；弹层不该开时为 null */
  readonly targetLayerPending: { readonly card: string; readonly move: string } | null;
  /** 选目标层时引擎会接受的层（梦魇解封只列还盖着暗置梦魇的层）；没有特别限制为 null，交给弹层默认推导 */
  readonly targetLayerChoices: readonly number[] | null;
  /** 取消选目标玩家：同时清掉已选的死亡宣言 */
  readonly cancelTargetPlayer: () => void;
  /** 梦境穿梭剂的模式选择 */
  readonly dreamTransit: {
    readonly open: boolean;
    readonly choose: (mode: 'shoot' | 'transit') => void;
    readonly cancel: () => void;
  };
  readonly decree: DecreeModel;
  readonly preventMove: PreventMoveModel;
}

export interface TurnActions {
  readonly draw: () => void;
  readonly endAction: () => void;
  readonly skipDiscard: () => void;
  /** 提交当前选中的弃牌 */
  readonly confirmDiscard: () => void;
  /** 已选中的弃牌数 */
  readonly discardSelected: number;
  /** 需要弃的张数 */
  readonly discardRequired: number;
  readonly canConfirmDiscard: boolean;
}

export interface GravityModel {
  readonly pickerOpen: boolean;
  readonly targets: string[];
  readonly options: GravityTargetOption[];
  readonly toggle: (playerID: string) => void;
  readonly confirm: () => Promise<void>;
  readonly cancel: () => void;
  /** 池挑选（人类 bonder） */
  readonly pool: {
    readonly open: boolean;
    readonly cards: string[];
    readonly currentPicker: string;
    readonly pick: (cardId: string) => Promise<void>;
  };
}

export interface ChessModel {
  /** 易位弹窗是否打开：回合进入行动阶段时自动弹出一次，关闭后本回合不再自动弹出，可再从技能入口主动打开 */
  readonly open: boolean;
  /** 梦主「棋局」在行动阶段且没有别的待办：技能入口可用 */
  readonly available: boolean;
  /** 从技能入口主动打开 */
  readonly show: () => void;
  readonly vaults: ChessVaultInfo[];
  readonly picked: number[];
  readonly toggle: (vaultIndex: number) => void;
  readonly confirm: () => Promise<void>;
  readonly cancel: () => void;
}

/** 轮到本人应答时的弹窗：选牌、分牌、选层；草稿跟随待决状态，换了一次待决状态就清空 */
export interface ResponseSheetModel {
  /** 打开的弹窗；没有为 null */
  readonly open: AwaitedSheet | null;
  readonly draft: AwaitedDraft;
  /** 草稿已选完、可以确认 */
  readonly canConfirm: boolean;
  readonly close: () => void;
  readonly confirm: () => void;
  readonly pickDiscard: (index: number) => void;
  readonly toggleSecondPile: (index: number) => void;
  readonly pickReviveTarget: (id: string) => void;
  readonly pickTeleportLayer: (layer: number) => void;
  readonly pickEchoLayer: (layer: number) => void;
  readonly pickEchoAction: (action: 'restore' | 'add') => void;
  /** 回音萦绕 / 邪念瘟疫的附加参数草稿整体更新（共用的参数表单用） */
  readonly setNightmareDraft: (draft: NightmareParamDraft) => void;
  /** 天秤·挑一份：点哪份就发哪份 */
  readonly pickPile: (pile: 'pile1' | 'pile2') => void;
  /** 黑洞·吞噬：选要交出的手牌位置 */
  readonly pickGive: (index: number) => void;
  /** 达尔文·淘汰：切换一张手牌是否放回牌库顶（最多 2 张，选的先后就是放回的顺序） */
  readonly toggleReturn: (index: number) => void;
  /** 雅典娜·急智：选弃牌堆里的一张牌（再点同一张取消） */
  readonly pickAthenaCard: (card: string) => void;
  /** 土星·律令：选一张同名手牌（按手牌位置；再点同一张取消） */
  readonly pickSaturn: (index: number) => void;
}

/** 被 SHOOT 时的响应、天秤、意念判官、处女、白羊、黑洞·吞噬、达尔文·淘汰、雅典娜·急智、土星·律令：轮到本人时的操作界面 */
export interface ResponseModel {
  /** 轮到本人应答的情形；没有待决状态或轮到别人为 null */
  readonly awaited: MineAwaited | null;
  /** 窗口 / 响应条上的按钮 */
  readonly actions: readonly AwaitedAction[];
  /** 服务端截止时间的剩余秒数；没有截止时间（本地对局、白羊）为 null */
  readonly deadlineSeconds: number | null;
  readonly perform: (action: AwaitedAction) => void;
  readonly sheet: ResponseSheetModel;
}

export interface GraftModel {
  readonly open: boolean;
  readonly hand: string[];
  /** 已挑选的手牌位置，按挑选顺序（第 1 张位于牌库最顶）；按位置记录，手里有同名牌时能各选一张 */
  readonly picked: readonly number[];
  readonly toggle: (index: number) => void;
  readonly confirm: () => Promise<void>;
}

/** 底部坞里的一个操作入口：复活 / 复活同伴 / 梦主的移动 */
export interface DockEntry {
  readonly kind: DockEntryKind;
  /** 此刻能不能用；不能用时入口仍显示，说明在 reason 里 */
  readonly enabled: boolean;
  readonly reason: EntryReason | null;
  /** 点击：可用则打开对应弹层；不可用则无操作（界面把原因提示出来） */
  readonly open: () => void;
}

/** 复活弹层：选对象（复活同伴时）与要弃的牌（按手牌位置选，同名牌各算一张） */
export interface ReviveModel {
  readonly open: boolean;
  readonly mode: 'self' | 'other';
  /** 可选的对象（复活同伴时用） */
  readonly targets: readonly { readonly id: string; readonly name: string }[];
  readonly target: string | null;
  readonly hand: readonly string[];
  readonly picked: readonly number[];
  /** 要弃几张；密道世界观下只能弃梦境穿梭剂 */
  readonly required: number;
  readonly onlyTransit: boolean;
  /** 手牌里每张牌能不能用来付代价（密道世界观下只有梦境穿梭剂） */
  readonly eligible: readonly boolean[];
  readonly canConfirm: boolean;
  readonly pickTarget: (id: string) => void;
  readonly toggleCard: (index: number) => void;
  readonly confirm: () => Promise<void>;
  readonly cancel: () => void;
}

/** 黑天鹅·纷飞的分发弹层：选接收者，再逐张点手牌分给他 */
export interface TourModel {
  readonly open: boolean;
  readonly hand: readonly string[];
  readonly recipients: readonly { readonly id: string; readonly name: string }[];
  readonly active: string | null;
  /** 每张手牌分给了谁（按手牌位置），未分配为 null */
  readonly assigned: readonly (string | null)[];
  readonly progress: { readonly done: number; readonly total: number };
  readonly canConfirm: boolean;
  readonly pickRecipient: (id: string) => void;
  readonly tapCard: (index: number) => void;
  readonly confirm: () => Promise<void>;
  readonly cancel: () => void;
}

/** 梦主的免费移动：选相邻层的弹层 */
export interface MasterMoveModel {
  readonly open: boolean;
  /** 可去的相邻层 */
  readonly layers: readonly number[];
  readonly pick: (layer: number) => Promise<void>;
  readonly cancel: () => void;
}

/** 角色主动技能面板所需；此刻不显示面板时整个对象为 null */
export interface SkillPanelModel {
  readonly context: ActiveSkillContext;
  readonly targetIds: readonly string[];
  /** 在迷失层的其他玩家（灵魂牧师·拯救等目标必须已死亡的技能用） */
  readonly lostTargetIds: readonly string[];
  readonly nicknames: Record<string, string>;
  readonly invoke: (skill: ActiveSkillDescriptor, args: unknown[]) => void;
}

export interface PreviewModel {
  /** 当前预览的卡牌；没有为 null */
  readonly cardId: string | null;
  readonly open: (cardId: string) => void;
  readonly close: () => void;
}

/** 对局内预设短语：只有联机对局可用；入口按 available 显示 */
export interface ChatModel {
  readonly available: boolean;
  /** 本人座位能发的短语（梦主看不到盗梦者专用的战术短语） */
  readonly presets: readonly ChatPresetPhrase[];
  /** 最近的消息，旧的在前 */
  readonly messages: readonly ChatEntry[];
  /** 此刻还在显示的气泡，键是发送者座位 */
  readonly bubbles: ReadonlyMap<string, ChatEntry>;
  /** 发送冷却剩余秒数；可以发为 0 */
  readonly cooldownSeconds: number;
  readonly send: (presetId: string) => void;
}

/** 局后举报：有真人对手且来源支持举报时才有 */
export interface ReportModel {
  readonly targets: readonly ReportTarget[];
  readonly submit: (
    seat: string,
    reason: ReportReason,
    description?: string,
  ) => Promise<ReportOutcome>;
}

export interface MatchController {
  // 就绪与全局
  readonly ready: boolean;
  readonly error: string | null;
  readonly kind: MatchSource['kind'];
  readonly isRemote: boolean;
  readonly winner: string | null;
  readonly winReason: string | null;
  /** 空闲阶段的后台预加载进度（顶栏细线）；没有为 null */
  readonly preload: PreloadProgress | null;
  /** 进入对局前的素材加载进度（加载界面）；没有为 null */
  readonly entryAssets: PreloadProgress | null;
  /** 进入对局前的素材已取完（或不需要取）；界面根节点据此打 data-assets-ready 标记 */
  readonly assetsReady: boolean;

  // 视图与座位
  /** 当前视图的对局状态；就绪前为 undefined */
  readonly view: MatchView | undefined;
  /** 本人座位；就绪前为空串（需要字符串的子组件用） */
  readonly viewerSeat: string;
  /** 本人所在层；没有本人信息时为 1 */
  readonly viewerLayer: number;
  readonly dreamMasterID: string;
  readonly seatById: ReadonlyMap<string, SeatInfo>;
  readonly stage: StageModel | null;
  readonly nicknameOf: (playerID: string) => string;

  // 回合与本人
  readonly turn: TurnModel;
  readonly takeover: TakeoverModel;
  readonly self: SelfInfo | null;
  readonly hand: HandModel;

  // 操作
  readonly makeMove: MatchMakeMove;
  /** 本人出牌的一方：梦主与盗梦者对同一张牌可能走不同的 move */
  readonly playRole: PlayRole;
  /** 梦主的梦境窥视选目标用：持有贿赂牌的座位 */
  readonly bribeHolderIds: readonly string[];
  readonly play: PlayModel;
  readonly actions: TurnActions;

  // 各弹窗的状态与回调
  readonly gravity: GravityModel;
  readonly chess: ChessModel;
  readonly graft: GraftModel;
  /** 底部坞的操作入口（复活 / 复活同伴 / 梦主的移动）；此刻没有为空数组 */
  readonly entries: readonly DockEntry[];
  readonly revive: ReviveModel;
  readonly masterMove: MasterMoveModel;
  readonly tour: TourModel;
  readonly response: ResponseModel;
  readonly shootDice: {
    readonly roll: number | null;
    readonly onComplete: () => void;
  };

  readonly chat: ChatModel;
  readonly report: ReportModel | null;

  // 其他展示数据
  readonly skillPanel: SkillPanelModel | null;
  readonly preview: PreviewModel;
}
