// Bot 在自己回合出牌阶段的出牌策略（纯函数）
//
// 只吃「按该 Bot 座位裁剪的视图」，不接触完整状态：他人手牌内容、金库内容、牌库顺序、
// 未公开的贿赂结果、他人未翻开的角色一律用不到。输出是按优先级排好的候选出牌；
// 候选是否合法由调用方用运行器试跑判定，策略本身不假定规则一定允许。
//
// 只覆盖打行动牌的出牌 move；角色主动技能与梦主世界观技能不在这里。
// 规则对照：docs/manual/04-action-cards.md

import type { MatchView, PlayerView } from '@icgame/game-engine';
import { isSameNameCard, type CardID } from '@icgame/shared';

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

/** 策略会打出的牌（其余牌手里放着也没用，付复活代价时先弃） */
const PLAYED_CARDS: ReadonlySet<string> = new Set([
  CARD.unlock,
  CARD.creation,
  CARD.transit,
  CARD.shootTransit,
  ...SAME_LAYER_SHOOTS.map((s) => s.card),
]);

/**
 * 复活付代价时一张牌的价值（越小越先弃）：
 * 0 策略不会打的牌；1 重复的第 2 张及以后（同名牌各留一张）；2 凭空造物 / 梦境穿梭剂；3 SHOOT 类；4 解封。
 * 重复牌的价值取 min(原价值, 1)。
 */
function cardValues(hand: readonly string[]): number[] {
  const seen = new Map<string, number>();
  return hand.map((c) => {
    const base = !PLAYED_CARDS.has(c)
      ? 0
      : c === CARD.unlock
        ? 4
        : c === CARD.creation || c === CARD.transit
          ? 2
          : 3;
    const n = seen.get(c) ?? 0;
    seen.set(c, n + 1);
    return n > 0 ? Math.min(base, 1) : base;
  });
}

/** 价值最低的 count 张牌（按价值升序、同价值保持手牌顺序）；maxValue 给出时只在价值不超过它的牌里挑，不够返回 null */
function cheapestCards(hand: readonly string[], count: number, maxValue = 4): string[] | null {
  const values = cardValues(hand);
  const picked = hand
    .map((card, i) => ({ card, v: values[i]!, i }))
    .filter((x) => x.v <= maxValue)
    .sort((a, b) => a.v - b.v || a.i - b.i)
    .slice(0, count);
  return picked.length === count ? picked.map((x) => x.card) : null;
}

/** 复活的代价候选：基础规则弃 2 张；手里有梦境穿梭剂时再给一个「只弃它」的候选（密道世界观，引擎会拒掉不适用的那个） */
function reviveCosts(hand: readonly string[], maxValue: number): string[][] {
  const out: string[][] = [];
  const basic = cheapestCards(hand, 2, maxValue);
  if (basic) out.push(basic);
  if (hand.includes(CARD.transit)) out.push([CARD.transit]);
  return out;
}

/** 复活的牌价值上限：复活同伴不动用 SHOOT 类与解封（价值 3 及以上），保住战斗力 */
const ALLY_REVIVE_MAX_VALUE = 2;

/** 梦主的免费移动：同层没有盗梦者时朝有盗梦者的层走一步 */
function masterMovePlan(view: MatchView, me: PlayerView): PlannedPlay[] {
  const thieves = view.playerOrder
    .map((id) => view.players[id])
    .filter(
      (p): p is PlayerView =>
        p !== undefined &&
        p.id !== me.id &&
        inDream(p) &&
        p.faction === 'thief' &&
        p.id !== view.dreamMasterID,
    );
  if (thieves.length === 0 || thieves.some((p) => p.currentLayer === me.currentLayer)) return [];
  const countAt = (layer: number): number => thieves.filter((p) => p.currentLayer === layer).length;
  const lockAt = (layer: number): number => view.layers[layer]?.heartLockValue ?? 0;
  // 只考虑能缩短与某名盗梦者距离的相邻层：有人的层优先（人多、心锁少者在前），其余按层号
  const options = adjacentLayers(me.currentLayer)
    .map((layer) => ({
      layer,
      people: countAt(layer),
      closer: thieves.some(
        (p) => Math.abs(p.currentLayer - layer) < Math.abs(p.currentLayer - me.currentLayer),
      ),
    }))
    .filter((o) => o.closer)
    .sort(
      (a, b) =>
        b.people - a.people ||
        (a.people > 0 ? lockAt(a.layer) - lockAt(b.layer) : 0) ||
        a.layer - b.layer,
    );
  return options.map((o) => ({
    move: 'dreamMasterMove',
    args: [o.layer],
    why:
      o.people > 0
        ? `同层没有盗梦者，去有 ${o.people} 名盗梦者的第 ${o.layer} 层`
        : `同层没有盗梦者，朝最近的盗梦者走到第 ${o.layer} 层`,
  }));
}

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

  // 复活迷失层里的同伴（对外同为盗梦者，视图里看得到）：代价只用不重要的牌
  const allies = view.playerOrder.filter((id) => {
    const p = view.players[id];
    return (
      p !== undefined &&
      !p.isAlive &&
      id !== me.id &&
      id !== view.dreamMasterID &&
      p.faction === me.faction
    );
  });
  for (const id of allies) {
    for (const cost of reviveCosts(hand, ALLY_REVIVE_MAX_VALUE)) {
      out.push({
        move: 'playRevive',
        args: [id, cost],
        why: `复活迷失层的同伴 ${id}，弃 ${cost.join('、')}`,
      });
    }
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
  // 先移动再出牌：到了同层才能 SHOOT
  const out: PlannedPlay[] = masterMovePlan(view, me);

  if (hand.includes(CARD.creation)) {
    out.push({ move: 'playCreation', args: [CARD.creation], why: '凭空造物，抽 2 张' });
  }

  // 与盗梦者同层：SHOOT 类。KICK 只是与对方换层，同层时白耗一张牌、异层时也换不到同层，所以不打
  const targets = thievesWithMe(view, me);
  for (const t of targets) out.push(...shootCandidates(hand, t.id, '与盗梦者同层'));
  return out;
}

/**
 * 该 Bot 在出牌阶段此刻可以尝试的出牌，按优先级排序；没有可打的返回空数组。
 * 不判断每回合张数上限，也不判断规则是否允许（由调用方试跑）。
 */
export function planActionPlays(view: MatchView, botID: string): PlannedPlay[] {
  if (view.turnPhase !== 'action' || view.currentPlayerID !== botID) return [];
  const me = view.players[botID];
  if (!me || me.hand === null) return [];
  // 迷失层里除了复活自己什么都不能做（梦主在自己回合开始时自动复活，不走这里）
  if (!me.isAlive) {
    if (botID === view.dreamMasterID || me.faction !== 'thief') return [];
    return reviveCosts(me.hand, 4).map((cost) => ({
      move: 'playRevive',
      args: [null, cost],
      why: `在迷失层，弃 ${cost.join('、')} 复活自己`,
    }));
  }
  if (!inDream(me)) return [];
  if (botID === view.dreamMasterID) return masterPlan(view, me, me.hand);
  // 背叛者之类自己已不是盗梦者阵营的座位：这一版不出牌
  if (me.faction !== 'thief') return [];
  return thiefPlan(view, me, me.hand);
}

/** 解封响应窗口的来源标识：打出解封的效果① */
const UNLOCK_EFFECT_1 = 'action_unlock_effect_1';

/**
 * 解封响应窗口里，轮到该座位时的应答候选：手里有解封，且打出解封的人在自己看得到的信息里是对立阵营，
 * 就用解封效果②抵消。未翻开的他人在视图里一律显示为盗梦者，所以：梦主（或自己已站在梦主方）抵消盗梦者的解封，
 * 盗梦者只会抵消已翻开的梦主方（背叛者）的解封，同阵营与判断不了的一律不抵消。
 * 对照：docs/manual/04-action-cards.md 解封 效果②
 */
function unlockResponsePlan(
  view: MatchView,
  me: PlayerView,
  hand: readonly string[],
): PlannedPlay[] {
  const window = view.pendingResponseWindow;
  const unlock = view.pendingUnlock;
  if (!window || !unlock || window.sourceAbilityID !== UNLOCK_EFFECT_1) return [];
  if (!window.responders.includes(me.id) || window.responded.includes(me.id)) return [];
  if (!hand.includes(CARD.unlock)) return [];
  const user = view.players[unlock.playerID];
  if (!user || user.id === me.id || user.faction === me.faction) return [];
  return [
    {
      move: 'respondCancelUnlock',
      args: [],
      why: `${unlock.playerID} 的解封是对立阵营打出的，用解封抵消`,
    },
  ];
}

/**
 * 土星·律令窗口里梦主的应答候选：手里有与被打出的牌同名的牌，就弃 1 张抵消，完全相同的 id 优先。
 * 没有同名牌时返回空数组，调用方回到「放过」。
 * 对照：docs/manual/06-dream-master.md 土星·领地 律令
 */
function decreePlan(view: MatchView, me: PlayerView, hand: readonly string[]): PlannedPlay[] {
  const pending = view.pendingSaturnDecree;
  if (!pending || pending.masterID !== me.id) return [];
  const played = pending.cardId;
  const ids = [...new Set(hand)].filter((c) => isSameNameCard(c as CardID, played));
  ids.sort((a, b) => Number(b === played) - Number(a === played));
  return ids.map((id) => ({
    move: 'respondSaturnDecree',
    args: [id],
    why: `律令：弃 ${id} 抵消 ${pending.userID} 打出的 ${played}`,
  }));
}

/**
 * 该座位此刻在回合外应答时可以尝试的动作，按优先级排序；没有就返回空数组（调用方保持放弃 / 放过）。
 * 只覆盖解封响应窗口与土星·律令；其余应答一律不在这里。
 */
export function planResponses(view: MatchView, botID: string): PlannedPlay[] {
  const me = view.players[botID];
  if (!me || !me.isAlive || me.hand === null) return [];
  return [...unlockResponsePlan(view, me, me.hand), ...decreePlan(view, me, me.hand)];
}
