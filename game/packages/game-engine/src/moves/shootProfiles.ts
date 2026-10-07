// SHOOT 类牌的结算参数表：每张牌的层数限制、死亡骰面、移动骰面与命中「移动」时的附带弃牌。
// 出牌 move、技能复用（意念判官、格林射线）都从这里取值，避免各处各抄一份字面量。
// 对照：docs/manual/04-action-cards.md SHOOT 与各变体

/** 命中「移动」时对目标手牌的附带处理：弃全部解封 / 弃全部 SHOOT 类 / 无 */
export type ShootExtraOnMove = 'discard_unlocks' | 'discard_shoots' | null;

export interface ShootProfile {
  /** 目标必须与射手同层（刺客之王不限） */
  sameLayerRequired: boolean;
  deathFaces: number[];
  moveFaces: number[];
  extraOnMove: ShootExtraOnMove;
}

const PROFILE_TABLE: Readonly<Record<string, Readonly<ShootProfile>>> = {
  // SHOOT：[1] 死亡，[2-4] 移动
  action_shoot: {
    sameLayerRequired: true,
    deathFaces: [1],
    moveFaces: [2, 3, 4],
    extraOnMove: null,
  },
  // SHOOT·梦境穿梭剂：选择射击时按普通 SHOOT 结算
  action_shoot_dream_transit: {
    sameLayerRequired: true,
    deathFaces: [1],
    moveFaces: [2, 3, 4],
    extraOnMove: null,
  },
  // SHOOT·刺客之王：目标任意层，[1/2] 死亡，[3/4/5] 移动
  action_shoot_assassin: {
    sameLayerRequired: false,
    deathFaces: [1, 2],
    moveFaces: [3, 4, 5],
    extraOnMove: null,
  },
  // SHOOT·爆甲螺旋：同层，[1/2] 死亡，[3/4/5] 弃目标所有解封并移动
  action_shoot_drill: {
    sameLayerRequired: true,
    deathFaces: [1, 2],
    moveFaces: [3, 4, 5],
    extraOnMove: 'discard_unlocks',
  },
  // SHOOT·炸裂弹头：同层，[1/2] 死亡，[3/4/5] 弃目标所有 SHOOT 类并移动
  action_shoot_burst: {
    sameLayerRequired: true,
    deathFaces: [1, 2],
    moveFaces: [3, 4, 5],
    extraOnMove: 'discard_shoots',
  },
};

// 按 Map 取值，避免 'constructor' 之类的原型属性名被当成牌 id 命中
const SHOOT_PROFILES: ReadonlyMap<string, Readonly<ShootProfile>> = new Map(
  Object.entries(PROFILE_TABLE),
);

/** 参数表里登记的牌 id */
export const SHOOT_PROFILE_CARD_IDS: readonly string[] = [...SHOOT_PROFILES.keys()];

/**
 * 取一张 SHOOT 类牌的结算参数；非 SHOOT 类牌返回 undefined。
 * 每次返回新对象与新数组：这些数组会被写进对局状态（待响应 / 待结算），不能与表共用引用。
 */
export function getShootProfile(cardId: string): ShootProfile | undefined {
  const profile = SHOOT_PROFILES.get(cardId);
  if (!profile) return undefined;
  return {
    sameLayerRequired: profile.sameLayerRequired,
    deathFaces: [...profile.deathFaces],
    moveFaces: [...profile.moveFaces],
    extraOnMove: profile.extraOnMove,
  };
}
