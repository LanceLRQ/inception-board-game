// 傻 AI L0 - "有啥打啥"策略
// L0-L3 AI 分级
//
// L0 设计原则：
//   - 合法即可行，不考虑胜率
//   - 手牌优先级：SHOOT > 解封 > 梦境穿梭剂 > 凭空造物 > pass/end
//   - 响应窗口：50% 取消 / 50% pass（防止总是阻挡解封）
//   - 不规划长远：只看当前合法动作集合

import type { Bot } from './randomBot.js';

export type MoveDescriptor = {
  readonly name: string;
  readonly args?: unknown[];
};

// 手牌行动优先级（数字越小越优先）
export const CARD_PRIORITY: Record<string, number> = {
  action_shoot: 1,
  action_shoot_assassin: 1,
  action_shoot_drill: 1,
  action_shoot_burst: 1,
  action_shoot_dream_transit: 1,
  action_unlock: 2,
  action_dream_transit: 3,
  action_creation: 4,
  action_kick: 2,
  action_telekinesis: 3,
  action_graft: 4,
  action_resonance: 4,
  action_gravity: 4,
};

// Move 名称优先级（数字越小越优先）
const MOVE_PRIORITY: Record<string, number> = {
  playShoot: 1,
  playUnlock: 2,
  playDreamTransit: 3,
  playCreation: 4,
  dreamMasterMove: 5,
  endActionPhase: 90,
  skipDraw: 91,
  doDraw: 10, // 抽牌基本总是选
  doDiscard: 50,
  skipDiscard: 51,
  // Bug fix（2026-04-21）：响应类 move 不能在 SimpleBot.play 里主动选
  //   原因：play() 看到 legalMoves 含 respondCancelUnlock 就会因高优先级选中 →
  //         无 pendingResponseWindow / 不在 responders 时 engine 返回 INVALID_MOVE，
  //         污染日志且浪费循环。
  //   正确路径：响应窗口由自动行动判定以响应者本人的名义发出（passResponse / respondCancelUnlock）
  //   playResponse() 方法用 startsWith() 直接匹配，不依赖 MOVE_PRIORITY → 不受影响。
  respondCancelUnlock: 999,
  passResponse: 999,
  resolveUnlock: 999,
  // 梦境窥视三段式 move 注册（同上原则：响应类 999 不主动选）
  peekerAcknowledge: 999,
  masterPeekBribeDecision: 999,
  masterVaultDecision: 999,
  playPeek: 80,
  playPeekMaster: 85,
  // 处女·完美 三选一响应窗（回合外 move，由自动行动判定以处女本人的名义发；此处 999 不主动选）
  respondVirgoPerfect: 999,
  // 双鱼·闪避 SHOOT 响应窗（同上：响应类 999 不主动选；由自动行动判定以目标本人的名义发）
  respondShootEvade: 999,
  respondShootPass: 999,
  // 恐怖分子·狂热 SHOOT 响应窗（同上）
  respondTerroristDiscard: 999,
  respondTerroristAccept: 999,
  // 水瓶·凝聚（playAquariusCoherence）
  //   主动技能：本回合每打 2 张同名牌产生 1 次触发额度，从弃牌堆收 1 张未用过的牌
  //   优先级 7：高于 doDraw(10) 但低于 SHOOT/Unlock 类（让 bot 优先打出 SHOOT 凑同名 pair 再回收）
  //   实际可用性由 engine availableAquariusCoherence(state, playerID) 守卫，bot 看到合法即触发
  playAquariusCoherence: 7,
  // 雅典娜·急智的应答（respondAthenaWit）、黑洞·吞噬的交牌（respondBlackHoleLevy）、
  //   达尔文·淘汰的选牌（respondDarwinReturn）都是待应答 move，由自动行动判定以应答者本人的名义发；
  //   此处 999 防 SimpleBot 主动选
  respondAthenaWit: 999,
  respondBlackHoleLevy: 999,
  respondDarwinReturn: 999,
  // 土星·律令的应答同上：由自动行动判定以梦主本人的名义发
  respondSaturnDecree: 999,
};

/**
 * L0 简单 Bot - 根据 move 名称 + 卡牌优先级选择
 */
export class SimpleBot implements Bot {
  play(_state: unknown, legalMoves: string[]): string {
    if (legalMoves.length === 0) {
      throw new Error('No legal moves available');
    }
    // 解析 move 名称（可能是 "playShoot" 或 "playShoot:action_shoot_assassin" 等复合）
    const sorted = [...legalMoves].sort((a, b) => {
      const aInfo = parseMoveKey(a);
      const bInfo = parseMoveKey(b);
      const aP = MOVE_PRIORITY[aInfo.name] ?? 99;
      const bP = MOVE_PRIORITY[bInfo.name] ?? 99;
      if (aP !== bP) return aP - bP;
      // Move 同名：按卡牌优先级
      const aCardP = aInfo.cardId ? (CARD_PRIORITY[aInfo.cardId] ?? 99) : 99;
      const bCardP = bInfo.cardId ? (CARD_PRIORITY[bInfo.cardId] ?? 99) : 99;
      return aCardP - bCardP;
    });

    return sorted[0]!;
  }

  /** 响应窗口专用：按概率决定是否取消 */
  playResponse(legalMoves: string[], cancelProbability = 0.5): string {
    const cancel = legalMoves.find((m) => m.startsWith('respondCancelUnlock'));
    const pass = legalMoves.find((m) => m.startsWith('passResponse'));
    if (cancel && Math.random() < cancelProbability) return cancel;
    if (pass) return pass;
    return this.play(null, legalMoves);
  }
}

/** 解析 move key："playShoot:card_id:target" → { name, cardId, target } */
function parseMoveKey(key: string): {
  name: string;
  cardId?: string;
  target?: string;
} {
  const parts = key.split(':');
  return {
    name: parts[0] ?? key,
    cardId: parts[1],
    target: parts[2],
  };
}
