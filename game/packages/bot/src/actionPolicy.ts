// Bot 在自己回合出牌阶段的出牌策略（纯函数）
//
// 只吃「按该 Bot 座位裁剪的视图」，不接触完整状态：他人手牌内容、金库内容、牌库顺序、
// 未公开的贿赂结果、他人未翻开的角色一律用不到。输出是按优先级排好的候选出牌；
// 候选是否合法由调用方用运行器试跑判定，策略本身不假定规则一定允许。
//
// 只覆盖打行动牌的出牌 move；角色主动技能与梦主世界观技能不在这里。
// 规则对照：docs/manual/04-action-cards.md

import type { MatchView, PlayerView } from '@icgame/game-engine';

/** 一条候选出牌 */
export interface PlannedPlay {
  move: string;
  args: unknown[];
  /** 给日志看的简短说明 */
  why: string;
}

/** 一个 Bot 一回合最多打出的行动牌张数 */
export const MAX_PLAYS_PER_TURN = 4;

/** 牌 id */
const CARD = {
  unlock: 'action_unlock',
  creation: 'action_creation',
  transit: 'action_dream_transit',
  shootTransit: 'action_shoot_dream_transit',
  kick: 'action_kick',
} as const;

/**
 * 同层 SHOOT 类牌，强的在前：爆甲螺旋 / 炸裂弹头 / 刺客之王都比普通 SHOOT 更容易击杀或驱逐。
 * 对照：docs/manual/04-action-cards.md SHOOT 各变体
 */
const SAME_LAYER_SHOOTS: readonly { move: string; card: string; label: string }[] = [
  { move: 'playShootArmor', card: 'action_shoot_drill', label: 'SHOOT·爆甲螺旋' },
  { move: 'playShootBurst', card: 'action_shoot_burst', label: 'SHOOT·炸裂弹头' },
  { move: 'playShootKing', card: 'action_shoot_assassin', label: 'SHOOT·刺客之王' },
  { move: 'playShoot', card: 'action_shoot', label: 'SHOOT' },
];

/** 层号 1–4 才是活人所在的梦境层；0 是迷失层 */
function inDream(player: PlayerView): boolean {
  return player.isAlive && player.currentLayer >= 1 && player.currentLayer <= 4;
}

/** 相邻层（1 与 4 不相连，不会走进迷失层） */
function adjacentLayers(layer: number): number[] {
  return [layer - 1, layer + 1].filter((l) => l >= 1 && l <= 4);
}

/** 同层、存活、对外身份是盗梦者的其他玩家；已翻开的同阵营者不算敌人 */
function thievesWithMe(view: MatchView, me: PlayerView): PlayerView[] {
  return view.playerOrder
    .map((id) => view.players[id])
    .filter(
      (p): p is PlayerView =>
        p !== undefined &&
        p.id !== me.id &&
        p.id !== view.dreamMasterID &&
        inDream(p) &&
        p.currentLayer === me.currentLayer &&
        p.faction === 'thief',
    )
    .sort((a, b) => b.unlockCount - a.unlockCount);
}

function shootCandidates(
  hand: readonly string[],
  targetID: string,
  whyPrefix: string,
): PlannedPlay[] {
  const out: PlannedPlay[] = [];
  for (const s of SAME_LAYER_SHOOTS) {
    if (hand.includes(s.card)) {
      out.push({
        move: s.move,
        args: [targetID, s.card],
        why: `${whyPrefix}：${s.label} 射 ${targetID}`,
      });
    }
  }
  if (hand.includes(CARD.shootTransit)) {
    out.push({
      move: 'playShootDreamTransit',
      args: [CARD.shootTransit, 'shoot', targetID],
      why: `${whyPrefix}：SHOOT·梦境穿梭剂（射击）射 ${targetID}`,
    });
  }
  return out;
}

/** 策略里写死的全部牌 id（供与卡牌配置对账） */
export const POLICY_CARD_IDS: readonly string[] = [
  ...Object.values(CARD),
  ...SAME_LAYER_SHOOTS.map((s) => s.card),
];

function thiefPlan(view: MatchView, me: PlayerView, hand: readonly string[]): PlannedPlay[] {
  const out: PlannedPlay[] = [];
  const layer = view.layers[me.currentLayer];
  const lock = layer?.heartLockValue ?? 0;

  // 所在层心锁未清：解封最优先
  if (lock > 0 && hand.includes(CARD.unlock)) {
    out.push({
      move: 'playUnlock',
      args: [CARD.unlock],
      why: `所在层 ${me.currentLayer} 心锁 ${lock}，解封`,
    });
  }

  // 抽牌类：白赚手牌
  if (hand.includes(CARD.creation)) {
    out.push({ move: 'playCreation', args: [CARD.creation], why: '凭空造物，抽 2 张' });
  }

  // 与梦主同层：射梦主
  const master = view.players[view.dreamMasterID];
  if (master && inDream(master) && master.currentLayer === me.currentLayer) {
    out.push(...shootCandidates(hand, master.id, '与梦主同层'));
  }

  // 所在层心锁已清：往更深的、还有心锁的相邻层走
  if (lock === 0) {
    const targets = adjacentLayers(me.currentLayer)
      .filter((l) => (view.layers[l]?.heartLockValue ?? 0) > 0)
      .sort((a, b) => b - a);
    for (const target of targets) {
      if (hand.includes(CARD.transit)) {
        out.push({
          move: 'playDreamTransit',
          args: [CARD.transit, target],
          why: `所在层心锁已清，梦境穿梭剂去还有心锁的第 ${target} 层`,
        });
      }
    }
    // 没有单纯的梦境穿梭剂时才动用 SHOOT·梦境穿梭剂的移动效果
    if (!hand.includes(CARD.transit) && hand.includes(CARD.shootTransit)) {
      for (const target of targets) {
        out.push({
          move: 'playShootDreamTransit',
          args: [CARD.shootTransit, 'transit', target],
          why: `所在层心锁已清，SHOOT·梦境穿梭剂（移动）去第 ${target} 层`,
        });
      }
    }
  }
  return out;
}

function masterPlan(view: MatchView, me: PlayerView, hand: readonly string[]): PlannedPlay[] {
  const out: PlannedPlay[] = [];

  if (hand.includes(CARD.creation)) {
    out.push({ move: 'playCreation', args: [CARD.creation], why: '凭空造物，抽 2 张' });
  }

  // 与盗梦者同层：先 SHOOT 类，再 KICK
  const targets = thievesWithMe(view, me);
  for (const t of targets) out.push(...shootCandidates(hand, t.id, '与盗梦者同层'));
  if (hand.includes(CARD.kick)) {
    for (const t of targets) {
      out.push({
        move: 'playKick',
        args: [CARD.kick, t.id],
        why: `与盗梦者 ${t.id} 同层，KICK 消耗手牌`,
      });
    }
  }
  return out;
}

/**
 * 该 Bot 在出牌阶段此刻可以尝试的出牌，按优先级排序；没有可打的返回空数组。
 * 不判断每回合张数上限，也不判断规则是否允许（由调用方试跑）。
 */
export function planActionPlays(view: MatchView, botID: string): PlannedPlay[] {
  if (view.turnPhase !== 'action' || view.currentPlayerID !== botID) return [];
  const me = view.players[botID];
  if (!me || !inDream(me) || me.hand === null) return [];
  if (botID === view.dreamMasterID) return masterPlan(view, me, me.hand);
  // 背叛者之类自己已不是盗梦者阵营的座位：这一版不出牌
  if (me.faction !== 'thief') return [];
  return thiefPlan(view, me, me.hand);
}
