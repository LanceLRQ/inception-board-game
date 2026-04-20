// 能力系统核心类型定义
// 对照：plans/design/05-card-system.md §5.1-§5.2
// 黄金定律：技能(bucket 1) > 行动牌(2) > 世界观(3) > 梦魇(4) > 规则(5)

import type { CardID, Faction } from '@icgame/shared';
import type { SetupState } from '../../setup.js';

// === 黄金定律优先级桶 ===

/** 优先级桶：数字越小优先级越高 */
export type PriorityBucket = 1 | 2 | 3 | 4 | 5;

//  1 = 角色技能（最高）
//  2 = 行动牌效果
//  3 = 世界观
//  4 = 梦魇牌效果
//  5 = 游戏规则 & 梦主优势（最低）

// === 触发时机 ===

/**
 * 技能触发时机枚举
 * 对照：plans/design/00-overview.md §0.4 / 02-game-rules-spec.md
 */
export type TriggerTiming =
  | 'onTurnStart' // 回合开始
  | 'onDrawPhase' // 抽牌阶段
  | 'onActionPhase' // 出牌阶段（主动使用）
  | 'onDiscardPhase' // 弃牌阶段
  | 'onTurnEnd' // 回合结束
  | 'onBeforeShoot' // SHOOT 掷骰前
  | 'onAfterShoot' // SHOOT 掷骰后
  | 'onUnlock' // 他人成功解锁时
  | 'onKilled' // 被击杀时
  | 'onReceiveBribe' // 收到贿赂牌时
  | 'onVaultOpen' // 金库被打开时
  | 'passive'; // 始终生效（被动修饰器）

// === 能力分类 ===

/** 能力来源类型 */
export type AbilityKind = 'card' | 'skill' | 'worldView' | 'nightmare' | 'rule';

/** 技能使用范围 */
export type SkillScope =
  | 'perTurn' // 每回合
  | 'perPhase' // 每阶段
  | 'perGame' // 每局
  | 'passive'; // 被动（不计次数）

// === 目标规格 ===

export type InputKind = 'player' | 'layer' | 'card' | 'nightmare' | 'choice';

export interface InputSpec {
  name: string;
  kind: InputKind;
  /** 可选项（false = 必填） */
  optional?: boolean;
  /** i18n 提示 key */
  prompt: string;
  /** 目标合法性约束 */
  constraint?: (state: SetupState, ctx: AbilityContext) => boolean;
}

// === 骰子修饰器 ===

/** 修饰器类型：delta 累加 / override 硬覆盖 */
export type DiceModifierKind = 'delta' | 'override';

export interface DiceModifierEntry {
  source: AbilityKind;
  sourceID: string;
  kind: DiceModifierKind;
  /** delta 模式的增量值 */
  delta?: number;
  /** override 模式的绝对值 */
  absoluteValue?: number;
  /** 来源的优先级桶 */
  bucket: PriorityBucket;
}

// === 效果栈帧 ===

export interface EffectStackFrame {
  abilityID: string;
  abilityKind: AbilityKind;
  priorityBucket: PriorityBucket;
  invokerID: string;
  /** 发动者在 playerOrder 中的位置 */
  invokerTurnOrder: number;
  /** 待执行的效果 */
  apply: (state: SetupState, ctx: AbilityContext) => ApplyResult;
}

// === 验证结果 ===

export interface ValidationResult {
  ok: boolean;
  /** i18n key 或纯文本原因 */
  reason?: string;
}

// === 能力执行上下文 ===

export interface AbilityContext {
  /** 发动者 */
  invokerID: string;
  /** 当前回合 */
  turnNumber: number;
  /** 当前回合阶段 */
  turnPhase: SetupState['turnPhase'];
  /** 梦主 ID */
  dreamMasterID: string;
  /** 当前发动者的阵营 */
  invokerFaction: Faction;
  /** 掷骰函数（确定性） */
  d6: () => number;
  /** SHOOT 上下文（如果当前在 SHOOT 结算链中） */
  pendingShoot?: PendingShootContext;
}

// === SHOOT 上下文 ===

export interface PendingShootContext {
  shooterID: string;
  targetID: string;
  cardID: CardID;
  baseRoll: number;
  modifiers: DiceModifierEntry[];
  /** 附加的死亡面（来自死亡宣言） */
  decreeFaces?: number[];
}

// === 响应窗口 ===

export interface PendingResponse {
  /** 触发的效果来源 */
  sourceAbilityID: string;
  /** 需要响应的玩家列表 */
  responders: string[];
  /** 响应窗口超时（毫秒） */
  timeoutMs: number;
  /** 哪些能力可以作为响应打出 */
  validResponseAbilityIDs: string[];
  /** 超时后的默认行为 */
  onTimeout: 'resolve' | 'cancel';
}

// === 执行结果 ===

export interface ApplyResult {
  /** 变更后的 state（null 表示无变更） */
  state: SetupState | null;
  /** 产生的游戏事件 */
  events: GameEvent[];
  /** 启动后续连锁效果 */
  triggerNext?: TriggerNextEntry[];
  /** 等待响应窗口 */
  pendingResponse?: PendingResponse;
}

export interface TriggerNextEntry {
  abilityID: string;
  ctx: Partial<AbilityContext>;
}

// === 游戏事件 ===

export interface GameEvent {
  type: string;
  playerID: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

// === 能力定义（核心接口） ===

/**
 * 能力定义接口 — 所有能力（技能/行动牌/世界观/梦魇）的统一抽象
 * 对照：plans/design/05-card-system.md §5.2 AbilityDefinition
 */
export interface AbilityDefinition {
  /** 唯一标识（如 "thief_pointman.skill_0" / "dm_fortress.wv_0"） */
  readonly id: string;
  /** 显示名称（i18n key） */
  readonly name: string;
  /** 描述文案（i18n key） */
  readonly description: string;
  /** 能力来源类型 */
  readonly kind: AbilityKind;
  /** 黄金定律优先级桶 */
  readonly priorityBucket: PriorityBucket;
  /** 触发时机列表（空 = 仅主动使用） */
  readonly triggers?: TriggerTiming[];
  /** 使用范围（仅 skill 类型需要） */
  readonly scope?: SkillScope;
  /** scope 下的使用次数上限（perGame / perTurn / perPhase） */
  readonly scopeLimit?: number;

  /** 能力发动的前置条件检查 */
  canActivate(state: SetupState, ctx: AbilityContext): ValidationResult;

  /** 获取需要用户提供的目标/选项 */
  getRequiredInputs(state: SetupState, ctx: AbilityContext): InputSpec[];

  /** 执行效果 */
  apply(state: SetupState, ctx: AbilityContext, inputs: ResolvedInputs): ApplyResult;
}

/** 已解析的用户输入 */
export type ResolvedInputs = Record<string, unknown>;

// === 能力注册表 ===

/** 能力注册表：全局维护所有已注册的能力定义 */
export interface AbilityRegistry {
  /** 按 ID 查询能力定义 */
  get(id: string): AbilityDefinition | undefined;
  /** 查询指定触发时机的所有能力 */
  getByTrigger(timing: TriggerTiming): AbilityDefinition[];
  /** 查询指定角色 ID 关联的所有能力 */
  getByCharacter(characterId: CardID): AbilityDefinition[];
  /** 注册一个能力 */
  register(ability: AbilityDefinition): void;
  /** 移除所有注册（测试用） */
  clear(): void;
}
