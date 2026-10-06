// 对局界面控制层的对外类型：布局只读这个对象，不直接碰对局来源与视图推导
//
// 控制层（useMatchController）拥有全部状态推导、出牌 / 弃牌 / 选目标的本地状态与回调；
// 布局组件（ClassicLayout 等）与弹窗群（MatchDialogs）只消费 MatchController，彼此不互相依赖。

import type { MatchView, RunnerCtx, SeatInfo } from '@icgame/game-engine';
import type { MatchSource, MoveOutcome } from '../../match/matchSource';
import type { ActiveSkillContext, ActiveSkillDescriptor } from '../../lib/activeSkills';
import type { ChessVaultInfo } from '../ChessTransposeDialog';
import type { GravityTargetOption } from '../GravityTargetPickerDialog';
import type { LayerMapProps } from '../LayerMap';
import type { AwaitingNotice } from './awaitingNotice';
import type { SeatMarker } from './seatMarkers';

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
  /** 弃牌阶段已被选中 */
  readonly selected: boolean;
  /** 是当前出牌意图对应的那张牌 */
  readonly pending: boolean;
}

/** 卡图预载进度 */
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
  /** 对局正在等某位玩家应答（且界面没有对应操作）时的提示 */
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
  /** 点一张手牌：弃牌阶段切换选中，行动阶段进入出牌流程 */
  readonly tap: (card: string) => void;
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

export interface PlayModel {
  /** 当前有效的出牌意图；牌不在手牌或不在行动阶段时为 null */
  readonly pending: PendingPlay | null;
  readonly start: (card: string) => void;
  readonly confirmNoTarget: () => Promise<void>;
  readonly confirmTargetPlayer: (targetPlayerID: string) => Promise<void>;
  readonly confirmTargetLayer: (targetLayer: number) => Promise<void>;
  readonly cancel: () => void;
  /** 选目标玩家的弹层所需的出牌意图；弹层不该开时为 null */
  readonly targetPlayerPending: { readonly card: string; readonly move: string } | null;
  /** 选目标层的弹层所需的出牌意图；弹层不该开时为 null */
  readonly targetLayerPending: { readonly card: string; readonly move: string } | null;
  /** 取消选目标玩家：同时清掉已选的死亡宣言 */
  readonly cancelTargetPlayer: () => void;
  /** 梦境穿梭剂的模式选择 */
  readonly dreamTransit: {
    readonly open: boolean;
    readonly choose: (mode: 'shoot' | 'transit') => void;
    readonly cancel: () => void;
  };
  readonly decree: DecreeModel;
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
  readonly open: boolean;
  readonly vaults: ChessVaultInfo[];
  readonly picked: number[];
  readonly toggle: (vaultIndex: number) => void;
  readonly confirm: () => Promise<void>;
  readonly cancel: () => void;
}

export interface GraftModel {
  readonly open: boolean;
  readonly hand: string[];
  readonly picked: string[];
  readonly toggle: (card: string) => void;
  readonly confirm: () => Promise<void>;
}

/** 角色主动技能面板所需；此刻不显示面板时整个对象为 null */
export interface SkillPanelModel {
  readonly context: ActiveSkillContext;
  readonly targetIds: readonly string[];
  readonly nicknames: Record<string, string>;
  readonly invoke: (skill: ActiveSkillDescriptor, args: unknown[]) => void;
}

export interface PreviewModel {
  /** 当前预览的卡牌；没有为 null */
  readonly cardId: string | null;
  readonly open: (cardId: string) => void;
  readonly close: () => void;
}

/** 梦主旧视图（层级总览）所需 */
export interface OverviewModel {
  readonly layers: LayerMapProps['layers'];
  readonly players: LayerMapProps['players'];
}

/** 玩家明细列表的一行 */
export interface PlayerRow {
  readonly id: string;
  /** 已揭示的角色；被过滤时为空串 */
  readonly characterId: string;
  readonly isMaster: boolean;
  readonly isCurrent: boolean;
  readonly isSelf: boolean;
  /** 非本人时显示的名字：真人用昵称，Bot 用「AI N」 */
  readonly otherName: string;
  readonly markers: readonly SeatMarker[];
  readonly faction: string;
  readonly layer: number;
  readonly isAlive: boolean;
  readonly handCount: number;
}

export interface MatchController {
  // 就绪与全局
  readonly ready: boolean;
  readonly error: string | null;
  readonly kind: MatchSource['kind'];
  readonly isRemote: boolean;
  readonly winner: string | null;
  readonly winReason: string | null;
  readonly preload: PreloadProgress | null;

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
  readonly play: PlayModel;
  readonly actions: TurnActions;

  // 各弹窗的状态与回调
  readonly gravity: GravityModel;
  readonly chess: ChessModel;
  readonly graft: GraftModel;
  readonly shootDice: {
    readonly roll: number | null;
    readonly onComplete: () => void;
  };

  // 其他展示数据
  readonly skillPanel: SkillPanelModel | null;
  readonly preview: PreviewModel;
  readonly overview: OverviewModel;
  /** 玩家明细列表；视图里没有玩家时为 null */
  readonly playerRows: readonly PlayerRow[] | null;
}
