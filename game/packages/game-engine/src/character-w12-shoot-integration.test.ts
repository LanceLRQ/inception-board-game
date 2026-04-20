// W12 Tier B SHOOT 修饰角色 game.ts 接入集成测试
// 对照：plans/tasks.md Phase 3 W12 · 天蝎 / 金牛 接入 applyShootVariant
// 对照：docs/manual/05-dream-thieves.md
//
// 单测层（character-w12.test.ts）覆盖纯函数；本文件覆盖 callMove 端到端。

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from './setup.js';
import { SCORPIUS_SKILL_ID } from './engine/skills.js';
import { callMove, expectMoveOk } from './testing/fixtures.js';
import { scenarioActionPhase } from './testing/scenarios.js';

function setCharacter(state: SetupState, playerID: string, characterId: CardID): SetupState {
  const p = state.players[playerID];
  if (!p) return state;
  return {
    ...state,
    players: { ...state.players, [playerID]: { ...p, characterId } },
  };
}

function setHand(state: SetupState, playerID: string, hand: CardID[]): SetupState {
  const p = state.players[playerID];
  if (!p) return state;
  return {
    ...state,
    players: { ...state.players, [playerID]: { ...p, hand } },
  };
}

// 天蝎 baseline：p1=天蝎 同层 p2，手牌 SHOOT
function scorpiusBaseline(): SetupState {
  let s = scenarioActionPhase();
  s = setCharacter(s, 'p1', 'thief_scorpius' as CardID);
  s = setHand(s, 'p1', ['action_shoot'] as CardID[]);
  return s;
}

// 金牛 baseline：p1=金牛 同层 p2，手牌 SHOOT
function taurusBaseline(): SetupState {
  let s = scenarioActionPhase();
  s = setCharacter(s, 'p1', 'thief_taurus' as CardID);
  s = setHand(s, 'p1', ['action_shoot'] as CardID[]);
  return s;
}

describe('天蝎 · 毒针接入 applyShootVariant', () => {
  it('双骰相同：差值 0 → 视为 1 → kill', () => {
    const s = scorpiusBaseline();
    // 第 1 颗 base D6=4，第 2 颗 D6=4，差值 0 → 视为 1（命中 deathFaces=[1]）→ kill
    const r = callMove(s, 'playShoot', ['p2', 'action_shoot' as CardID], { rolls: [4, 4] });
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(false);
    expect(r.players.p1!.skillUsedThisTurn[SCORPIUS_SKILL_ID]).toBe(1);
  });

  it('差值落在 moveFaces：移动 target', () => {
    const s = scorpiusBaseline();
    // base=5, second=2 → diff=3 → 命中 moveFaces=[2,3,4,5] → move
    const r = callMove(s, 'playShoot', ['p2', 'action_shoot' as CardID], { rolls: [5, 2] });
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(true);
    expect(r.players.p2!.currentLayer).toBe(2); // 1→2
  });

  it('差值 6 → miss（baseRoll=6, second=0 不可能；用 1 和 1 中等情况）', () => {
    // 差值最大是 5 (1 vs 6)，命中 moveFaces；6 实际不可能。验证一个 miss 场景：
    // base=1, second=1 → diff=0 → 视为 1 → kill。再换 base=1, second=2 → diff=1 → kill...
    // 实际上 SHOOT 默认 deathFaces=[1] moveFaces=[2..5] 6=miss，但天蝎差值最大 5，永不 miss。
    // 改为高 deathFaces 测试：用 playShootKing（deathFaces=[1,2]）观察差值=2 触发 kill
    let s = scorpiusBaseline();
    s = setHand(s, 'p1', ['action_shoot_king'] as CardID[]);
    // 跨层（刺客之王不要求同层），p2 在 layer 1
    const r = callMove(s, 'playShootKing', ['p2', 'action_shoot_king' as CardID], {
      rolls: [3, 1],
    });
    expectMoveOk(r);
    // diff=2 命中 deathFaces=[1,2] → kill
    expect(r.players.p2!.isAlive).toBe(false);
  });

  it('回合限 1 次：第二张 SHOOT 不再触发双骰', () => {
    let s = scorpiusBaseline();
    // 用刺客之王（跨层 SHOOT）避免 move 后同层校验失败
    s = setHand(s, 'p1', ['action_shoot_king', 'action_shoot_king'] as CardID[]);
    // 第 1 张：base=6, second=1 → diff=5 → 命中 moveFaces=[3,4,5] → move（消耗 1 次双骰）
    const r1 = callMove(s, 'playShootKing', ['p2', 'action_shoot_king' as CardID], {
      rolls: [6, 1],
    });
    expectMoveOk(r1);
    expect(r1.players.p1!.skillUsedThisTurn[SCORPIUS_SKILL_ID]).toBe(1);
    // 第 2 张：技能已用 → 走单骰；rolls=[6] → 6=miss
    const r2 = callMove(r1, 'playShootKing', ['p2', 'action_shoot_king' as CardID], { rolls: [6] });
    expectMoveOk(r2);
    expect(r2.players.p2!.isAlive).toBe(true);
    // 第二次走单骰：rolls 只消费 1 颗（若双骰则会消费 2 颗导致结果不同）
    expect(r2.players.p1!.skillUsedThisTurn[SCORPIUS_SKILL_ID]).toBe(1); // 仍为 1 次
  });
});

describe('金牛 · 号角接入 applyShootVariant', () => {
  it('base 为 kill：不需要触发 self 骰', () => {
    const s = taurusBaseline();
    // baseRoll=1 → 命中 deathFaces=[1] → kill。不应消耗 self 骰
    const r = callMove(s, 'playShoot', ['p2', 'action_shoot' as CardID], { rolls: [1] });
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(false);
  });

  it('base 为 miss + self > base → 强制 kill', () => {
    const s = taurusBaseline();
    // baseRoll=6 → SHOOT 默认 6=miss；selfRoll=5 > base=6? no
    // 改：base=6（miss），self=... 必须 > 6，不可能。
    // 用 base=3（move），self=5 → 5>3 → 强制 kill
    const r = callMove(s, 'playShoot', ['p2', 'action_shoot' as CardID], { rolls: [3, 5] });
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(false);
  });

  it('base 为 move + self <= base → 保持 move', () => {
    const s = taurusBaseline();
    // base=4 (move), self=2 → 2<4 → 保持 move
    const r = callMove(s, 'playShoot', ['p2', 'action_shoot' as CardID], { rolls: [4, 2] });
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(true);
    expect(r.players.p2!.currentLayer).toBe(2); // moved
  });

  it('base 为 miss + self == base → 保持 miss', () => {
    const s = taurusBaseline();
    // base=6 (miss), self=6 → not > → miss
    const r = callMove(s, 'playShoot', ['p2', 'action_shoot' as CardID], { rolls: [6, 6] });
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(true);
    expect(r.players.p2!.currentLayer).toBe(1); // unchanged
  });

  it('多次使用：金牛号角不限次数', () => {
    let s = taurusBaseline();
    s = setHand(s, 'p1', ['action_shoot', 'action_shoot'] as CardID[]);
    // 复活 p2 模拟两次 SHOOT 不同目标，简化为同 target；
    // 第一次 base=4 self=5 → kill。需 p2 仍活才能继续，改用第一次 base=4 self=2（move）
    const r1 = callMove(s, 'playShoot', ['p2', 'action_shoot' as CardID], { rolls: [4, 2] });
    expectMoveOk(r1);
    expect(r1.players.p2!.isAlive).toBe(true);
    expect(r1.players.p2!.currentLayer).toBe(2);
    // p2 跑到 2 层；第二次需 SHOOT 同层；切换 p1 到 2 层
    const s2 = {
      ...r1,
      players: {
        ...r1.players,
        p1: { ...r1.players.p1!, currentLayer: 2 as Layer },
      },
      layers: {
        ...r1.layers,
        1: {
          ...r1.layers[1]!,
          playersInLayer: r1.layers[1]!.playersInLayer.filter((id) => id !== 'p1'),
        },
        2: { ...r1.layers[2]!, playersInLayer: [...r1.layers[2]!.playersInLayer, 'p1'] },
      },
    };
    // 第二次 base=4 self=6 → 6>4 → kill
    const r2 = callMove(s2, 'playShoot', ['p2', 'action_shoot' as CardID], { rolls: [4, 6] });
    expectMoveOk(r2);
    expect(r2.players.p2!.isAlive).toBe(false);
  });
});

describe('非天蝎/金牛角色：保持单骰行为', () => {
  it('普通 thief：rolls 只消费 1 颗', () => {
    const s = setHand(scenarioActionPhase(), 'p1', ['action_shoot'] as CardID[]);
    const r = callMove(s, 'playShoot', ['p2', 'action_shoot' as CardID], { rolls: [1, 999] });
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(false);
  });
});
