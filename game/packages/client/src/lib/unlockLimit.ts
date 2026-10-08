// 本回合还能不能再做一次「成功解锁」的预判（【解封】效果①、双子·协同、殉道者·减少、射手·穿心减少心锁共用同一份次数）。
// 只读按座位裁剪的视图里本人的数据；引擎的判定是 engine/skills.ts 的 canMakeSuccessfulUnlock，这里只做提前置灰。
// 对照：docs/manual/03-game-flow.md:26-28（每回合解封次数）、docs/manual/05-dream-thieves.md 摩羯「节奏」与水瓶「同流」（豁免次数上限）

/** 与引擎的 HEART_LOCK_REDUCED_BY_SKILL_KEY 一致（有测试对账）：本回合技能减少心锁的次数，计入解封次数 */
export const HEART_LOCK_REDUCED_BY_SKILL_KEY = 'heartLockReducedBySkill';

export interface UnlockLimitInput {
  readonly characterId: string | null | undefined;
  readonly isAlive: boolean;
  readonly currentLayer: number;
  readonly handCount: number;
  /** 本回合已成功解封的次数（公开） */
  readonly successfulUnlocksThisTurn: number;
  /** 本人的 skillUsedThisTurn（只有本人视图里有） */
  readonly skillUsedThisTurn: Readonly<Record<string, number>> | null | undefined;
  /** 视图里的实际每回合解封次数上限（黑洞世界观下为 2） */
  readonly maxUnlockPerTurn: number;
}

/** 摩羯·节奏：手牌数不小于所在层数字时，解封次数不受限制；水瓶·同流：解封次数不受限制 */
export function isUnlockLimitExempt(input: UnlockLimitInput): boolean {
  if (!input.isAlive) return false;
  if (input.characterId === 'thief_aquarius') return true;
  return (
    input.characterId === 'thief_capricornus' &&
    input.currentLayer >= 1 &&
    input.handCount >= input.currentLayer
  );
}

/** 本回合解封次数已用尽（不豁免且次数已满） */
export function unlockLimitExhausted(input: UnlockLimitInput): boolean {
  if (isUnlockLimitExempt(input)) return false;
  const used =
    input.successfulUnlocksThisTurn +
    (input.skillUsedThisTurn?.[HEART_LOCK_REDUCED_BY_SKILL_KEY] ?? 0);
  return used >= input.maxUnlockPerTurn;
}
