import { describe, expect, it } from 'vitest';
import {
  HEART_LOCK_REDUCED_BY_SKILL_KEY,
  isUnlockLimitExempt,
  unlockLimitExhausted,
  type UnlockLimitInput,
} from './unlockLimit';

function input(over: Partial<UnlockLimitInput> = {}): UnlockLimitInput {
  return {
    characterId: 'thief_aries',
    isAlive: true,
    currentLayer: 2,
    handCount: 3,
    successfulUnlocksThisTurn: 0,
    skillUsedThisTurn: {},
    maxUnlockPerTurn: 1,
    ...over,
  };
}

describe('本回合解封次数', () => {
  it('还没解封过：没用尽', () => {
    expect(unlockLimitExhausted(input())).toBe(false);
  });

  it('成功解封次数达到上限：用尽', () => {
    expect(unlockLimitExhausted(input({ successfulUnlocksThisTurn: 1 }))).toBe(true);
  });

  it('技能减少心锁也计入同一份次数', () => {
    expect(
      unlockLimitExhausted(input({ skillUsedThisTurn: { [HEART_LOCK_REDUCED_BY_SKILL_KEY]: 1 } })),
    ).toBe(true);
    expect(
      unlockLimitExhausted(
        input({
          maxUnlockPerTurn: 2,
          successfulUnlocksThisTurn: 1,
          skillUsedThisTurn: { [HEART_LOCK_REDUCED_BY_SKILL_KEY]: 1 },
        }),
      ),
    ).toBe(true);
  });

  it('上限提到 2（黑洞世界观）：解封一次后还没用尽', () => {
    expect(unlockLimitExhausted(input({ maxUnlockPerTurn: 2, successfulUnlocksThisTurn: 1 }))).toBe(
      false,
    );
  });

  it('视图里没有本人的使用记录（null）：只按成功解封次数算', () => {
    expect(unlockLimitExhausted(input({ skillUsedThisTurn: null }))).toBe(false);
  });
});

describe('解封次数的豁免', () => {
  it('水瓶存活：豁免；水瓶在迷失层：不豁免', () => {
    expect(isUnlockLimitExempt(input({ characterId: 'thief_aquarius' }))).toBe(true);
    expect(isUnlockLimitExempt(input({ characterId: 'thief_aquarius', isAlive: false }))).toBe(
      false,
    );
  });

  it('摩羯：手牌数不小于所在层数字才豁免', () => {
    const cap = { characterId: 'thief_capricornus', currentLayer: 3 };
    expect(isUnlockLimitExempt(input({ ...cap, handCount: 3 }))).toBe(true);
    expect(isUnlockLimitExempt(input({ ...cap, handCount: 2 }))).toBe(false);
    expect(isUnlockLimitExempt(input({ ...cap, currentLayer: 0, handCount: 5 }))).toBe(false);
  });

  it('豁免的角色次数用满也不算用尽', () => {
    expect(
      unlockLimitExhausted(input({ characterId: 'thief_aquarius', successfulUnlocksThisTurn: 5 })),
    ).toBe(false);
  });
});
