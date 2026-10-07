// 金币金库三选一决策 · 纯逻辑层
// 对照：docs/manual/03-game-flow.md 金库与梦魇牌（第 33-36、94-103 行）
// 触发：盗梦者打开金币金库后，视图里的 pendingVaultDecision 挂起，所有人等梦主三选一。
//   只对梦主本人显示，不看回合与阶段（回合外应答）。
//
// 三个选项（都发 masterVaultDecision）：
//   bribe     派 1 张贿赂牌给打开者并弃掉该层梦魇；贿赂池没有可派的牌时不可用，皇城可指定池里一张
//   nightmare 翻开并发动该层梦魇，不派贿赂牌；该层没有梦魇时不可用
//   discard   弃掉梦魇、不派贿赂牌；始终可用（该层没有梦魇时就是「不派发」）

import type { MatchView } from '@icgame/game-engine';
import { imperialPoolChoices, type PoolChoice } from '../MasterPeekBribeBanner/logic.js';

export type VaultDecisionChoice = 'bribe' | 'nightmare' | 'discard';

/** 发动梦魇时需要界面补充的参数：回音萦绕要选层与方式，其余梦魇不需要（邪念瘟疫不派发贿赂） */
export type NightmareParamKind = 'none' | 'echo';

export interface VaultDecisionOption {
  enabled: boolean;
  /** 不可用的原因；可用时为 null */
  reason: 'poolEmpty' | 'noNightmare' | null;
}

export interface VaultDecisionState {
  visible: boolean;
  layer: number | null;
  openerID: string | null;
  /** 该层是否有梦魇牌 */
  hasNightmare: boolean;
  /** 梦魇牌编号；视图里看不到时为 null */
  nightmareId: string | null;
  /** 贿赂池里还没派出的牌数 */
  poolCount: number;
  /** 皇城梦主能看到池内每张的成败时，可指定的牌；否则为 null（只能随机派发） */
  poolChoices: PoolChoice[] | null;
  nightmareParams: NightmareParamKind;
  bribe: VaultDecisionOption;
  nightmare: VaultDecisionOption;
}

const HIDDEN: VaultDecisionState = {
  visible: false,
  layer: null,
  openerID: null,
  hasNightmare: false,
  nightmareId: null,
  poolCount: 0,
  poolChoices: null,
  nightmareParams: 'none',
  bribe: { enabled: false, reason: null },
  nightmare: { enabled: false, reason: null },
};

/**
 * 计算决策状态
 * @param G 按座位裁剪的视图
 * @param viewerPlayerID 观看者座位（来自调用方）
 */
export function computeVaultDecisionState(
  G: MatchView | null | undefined,
  viewerPlayerID: string,
): VaultDecisionState {
  if (!G) return HIDDEN;
  const pending = G.pendingVaultDecision;
  if (!pending) return HIDDEN;
  // 只有梦主本人操作
  if (!G.dreamMasterID || viewerPlayerID !== G.dreamMasterID) return HIDDEN;

  const nightmareId = G.layers[pending.layer]?.nightmareId ?? null;
  const hasNightmare = nightmareId !== null;
  const poolCount = G.bribePool.filter((b) => b.status === 'inPool').length;

  return {
    visible: true,
    layer: pending.layer,
    openerID: pending.openerID,
    hasNightmare,
    nightmareId,
    poolCount,
    poolChoices: imperialPoolChoices(G),
    nightmareParams: nightmareId === 'nightmare_echo' ? 'echo' : 'none',
    bribe:
      poolCount > 0 ? { enabled: true, reason: null } : { enabled: false, reason: 'poolEmpty' },
    nightmare: hasNightmare
      ? { enabled: true, reason: null }
      : { enabled: false, reason: 'noNightmare' },
  };
}

/** 弹窗里的草稿：指定的贿赂牌下标、回音萦绕的目标层与方式 */
export interface VaultDecisionDraft {
  poolIndex: number | null;
  echoLayer: number | null;
  echoAction: 'restore' | 'add' | null;
}

export interface VaultDecisionCommand {
  move: 'masterVaultDecision';
  args: unknown[];
}

/** 点下某个选项时要发的 move；选项不可用或参数没选完返回 null */
export function computeVaultDecisionCommand(
  state: VaultDecisionState,
  choice: VaultDecisionChoice,
  draft: VaultDecisionDraft,
): VaultDecisionCommand | null {
  if (!state.visible) return null;
  switch (choice) {
    case 'bribe':
      if (!state.bribe.enabled) return null;
      return {
        move: 'masterVaultDecision',
        args: draft.poolIndex === null ? ['bribe'] : ['bribe', { poolIndex: draft.poolIndex }],
      };
    case 'nightmare':
      if (!state.nightmare.enabled) return null;
      if (state.nightmareParams === 'echo') {
        if (draft.echoLayer === null || draft.echoAction === null) return null;
        return {
          move: 'masterVaultDecision',
          args: ['nightmare', { targetLayer: draft.echoLayer, action: draft.echoAction }],
        };
      }
      return { move: 'masterVaultDecision', args: ['nightmare'] };
    case 'discard':
      return { move: 'masterVaultDecision', args: ['discard'] };
  }
}
