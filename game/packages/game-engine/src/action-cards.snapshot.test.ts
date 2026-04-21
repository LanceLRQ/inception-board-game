// 行动牌快照回归测试（W10 收尾）
// 对照：plans/tasks.md Phase 3 W10 · 20 种行动牌 × Fixture + 快照测试
// 对照：docs/manual/04-action-cards.md
//
// 目标：为 21 种行动牌 move 建立"单一真相"快照网。任意改动 move 行为 → 快照失效 → 强制 review。
//
// 设计纪律：
// - 单一真相场景：scenarioActionPhase()，所有 case 在该 state 上做局部 override
// - 固定 RNG：rngSeed='snapshot-seed'，D6 通过 callMove 的 rolls 选项注入
// - 切片快照：仅 pickRelevantState 输出的字段进入 snapshot
// - 每个 case 仅 1 个 happy path snapshot；边界场景由各 move 的专属 *.test.ts 负责

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from './setup.js';
import { callMove, expectMoveOk, pickRelevantState } from './testing/fixtures.js';
import { scenarioActionPhase } from './testing/scenarios.js';

// --- 共用工具 ---

/** 给某玩家手牌 + 同步重置 layer.playersInLayer */
function withHand(state: SetupState, playerID: string, hand: CardID[]): SetupState {
  const p = state.players[playerID];
  if (!p) return state;
  return {
    ...state,
    players: { ...state.players, [playerID]: { ...p, hand } },
  };
}

/** 把玩家挪到指定层（同步两端 layer.playersInLayer） */
function placePlayer(state: SetupState, playerID: string, layer: Layer): SetupState {
  const p = state.players[playerID];
  if (!p) return state;
  const oldLayer = p.currentLayer;
  if (oldLayer === layer) return state;
  const fromLayer = state.layers[oldLayer];
  const toLayer = state.layers[layer];
  if (!fromLayer || !toLayer) return state;
  return {
    ...state,
    players: { ...state.players, [playerID]: { ...p, currentLayer: layer } },
    layers: {
      ...state.layers,
      [oldLayer]: {
        ...fromLayer,
        playersInLayer: fromLayer.playersInLayer.filter((id) => id !== playerID),
      },
      [layer]: { ...toLayer, playersInLayer: [...toLayer.playersInLayer, playerID] },
    },
  };
}

// --- 共用 baseline ---

/**
 * 标准基线：p1（盗梦）/ p2（盗梦）/ pM（梦主）全在层 1，p1 当前回合 action 阶段。
 * 各测试再叠加自己的手牌/位置 override。
 */
function baseline(): SetupState {
  return scenarioActionPhase();
}

describe('行动牌快照回归 · 21 卡', () => {
  // -------------------------------------------------------------------------
  // 1. SHOOT · 默认（同层 1 死 2-5 移）
  // -------------------------------------------------------------------------
  it('1. playShoot · 同层目标，骰 1 → 杀死并入迷失层', () => {
    const s = withHand(baseline(), 'p1', ['action_shoot' as CardID]);
    const r = callMove(s, 'playShoot', ['p2', 'action_shoot' as CardID], { rolls: [1] });
    expectMoveOk(r);
    expect(pickRelevantState(r)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // 2-3. SHOOT · 梦境穿梭剂（双模式）
  // -------------------------------------------------------------------------
  it('2. playShootDreamTransit · mode=shoot · 骰 3 → 移动 target', () => {
    const s = withHand(baseline(), 'p1', ['action_shoot_dream_transit' as CardID]);
    const r = callMove(
      s,
      'playShootDreamTransit',
      ['action_shoot_dream_transit' as CardID, 'shoot', 'p2'],
      { rolls: [3] },
    );
    expectMoveOk(r);
    expect(pickRelevantState(r)).toMatchSnapshot();
  });

  it('3. playShootDreamTransit · mode=transit · 自己移到相邻层', () => {
    const s = withHand(baseline(), 'p1', ['action_shoot_dream_transit' as CardID]);
    const r = callMove(s, 'playShootDreamTransit', [
      'action_shoot_dream_transit' as CardID,
      'transit',
      2,
    ]);
    expectMoveOk(r);
    expect(pickRelevantState(r)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // 4. SHOOT · 刺客之王（任意层 · 1/2 死 · 3-5 移）
  // -------------------------------------------------------------------------
  it('4. playShootKing · 跨层 · 骰 1 → target 死亡', () => {
    let s = withHand(baseline(), 'p1', ['action_shoot_king' as CardID]);
    s = placePlayer(s, 'p2', 3 as Layer);
    const r = callMove(s, 'playShootKing', ['p2', 'action_shoot_king' as CardID], { rolls: [1] });
    expectMoveOk(r);
    expect(pickRelevantState(r)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // 5. SHOOT · 爆甲螺旋（同层 · 3-5 移 + 弃 target 解封）
  // -------------------------------------------------------------------------
  it('5. playShootArmor · 骰 4 → target 移层 + 弃所有解封', () => {
    let s = withHand(baseline(), 'p1', ['action_shoot_armor' as CardID]);
    s = withHand(s, 'p2', ['action_unlock', 'action_unlock', 'action_kick'] as CardID[]);
    const r = callMove(s, 'playShootArmor', ['p2', 'action_shoot_armor' as CardID], { rolls: [4] });
    expectMoveOk(r);
    expect(pickRelevantState(r)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // 6. SHOOT · 炸裂弹头（同层 · 3-5 移 + 弃 target 所有 SHOOT 类）
  // -------------------------------------------------------------------------
  it('6. playShootBurst · 骰 5 → target 移层 + 弃所有 SHOOT 类', () => {
    let s = withHand(baseline(), 'p1', ['action_shoot_burst' as CardID]);
    s = withHand(s, 'p2', [
      'action_shoot',
      'action_shoot_king',
      'action_shoot_armor',
      'action_unlock',
    ] as CardID[]);
    const r = callMove(s, 'playShootBurst', ['p2', 'action_shoot_burst' as CardID], { rolls: [5] });
    expectMoveOk(r);
    expect(pickRelevantState(r)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // 7. 基础解封（pendingUnlock 进入响应窗口）
  // -------------------------------------------------------------------------
  it('7. playUnlock · 盗梦者同层心锁 → 进入 pendingUnlock', () => {
    const s = withHand(baseline(), 'p1', ['action_unlock' as CardID]);
    const r = callMove(s, 'playUnlock', ['action_unlock' as CardID]);
    expectMoveOk(r);
    expect(pickRelevantState(r)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // 8. 梦境穿梭（移动相邻层）
  // -------------------------------------------------------------------------
  it('8. playDreamTransit · 自己 1→2', () => {
    const s = withHand(baseline(), 'p1', ['action_dream_transit' as CardID]);
    const r = callMove(s, 'playDreamTransit', ['action_dream_transit' as CardID, 2]);
    expectMoveOk(r);
    expect(pickRelevantState(r)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // 9. KICK · 与目标交换梦境层
  // -------------------------------------------------------------------------
  it('9. playKick · p1(L1) ↔ p2(L3)', () => {
    let s = withHand(baseline(), 'p1', ['action_kick' as CardID]);
    s = placePlayer(s, 'p2', 3 as Layer);
    const r = callMove(s, 'playKick', ['action_kick' as CardID, 'p2']);
    expectMoveOk(r);
    expect(pickRelevantState(r)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // 10. 念力牵引 · 拉目标到自己层
  // -------------------------------------------------------------------------
  it('10. playTelekinesis · p2 拉到 p1(L1)', () => {
    let s = withHand(baseline(), 'p1', ['action_telekinesis' as CardID]);
    s = placePlayer(s, 'p2', 3 as Layer);
    const r = callMove(s, 'playTelekinesis', ['action_telekinesis' as CardID, 'p2']);
    expectMoveOk(r);
    expect(pickRelevantState(r)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // 11. 梦境窥视 · 弃牌（MVP 简化）
  // -------------------------------------------------------------------------
  it('11. playPeek · 窥视层 1（含 v-secret）', () => {
    const s = withHand(baseline(), 'p1', ['action_peek' as CardID]);
    const r = callMove(s, 'playPeek', ['action_peek' as CardID, 1]);
    expectMoveOk(r);
    expect(pickRelevantState(r)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // 12. 嫁接 · 抽 3 返 2（仅 phase1：进入 pendingGraft）
  // -------------------------------------------------------------------------
  it('12. playGraft · phase1 → 抽 3 + pendingGraft', () => {
    const s = withHand(baseline(), 'p1', ['action_graft' as CardID]);
    const r = callMove(s, 'playGraft', ['action_graft' as CardID]);
    expectMoveOk(r);
    expect(pickRelevantState(r)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // 13. 万有引力 · 双目标手牌入池
  // -------------------------------------------------------------------------
  it('13. playGravity · 单目标 p2，进入 pendingGravity', () => {
    let s = withHand(baseline(), 'p1', ['action_gravity' as CardID]);
    s = withHand(s, 'p2', ['action_kick', 'action_unlock'] as CardID[]);
    const r = callMove(s, 'playGravity', ['action_gravity' as CardID, ['p2']]);
    expectMoveOk(r);
    expect(pickRelevantState(r)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // 14. 共鸣 · 取目标全部手牌
  // -------------------------------------------------------------------------
  it('14. playResonance · p1 拿 p2 全部手牌', () => {
    let s = withHand(baseline(), 'p1', ['action_resonance' as CardID]);
    s = withHand(s, 'p2', ['action_kick', 'action_unlock'] as CardID[]);
    const r = callMove(s, 'playResonance', ['action_resonance' as CardID, 'p2']);
    expectMoveOk(r);
    expect(pickRelevantState(r)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // 15. 时间风暴 · 弃牌库顶 10 张 + 该牌移出游戏
  // -------------------------------------------------------------------------
  it('15. playTimeStorm · 牌库顶 10 张 + 本牌移出游戏', () => {
    const s = withHand(baseline(), 'p1', ['action_time_storm' as CardID]);
    const r = callMove(s, 'playTimeStorm', ['action_time_storm' as CardID]);
    expectMoveOk(r);
    expect(pickRelevantState(r)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // 16. 凭空造物 · 抽 2 张
  // -------------------------------------------------------------------------
  it('16. playCreation · 抽 2 张', () => {
    const s = withHand(baseline(), 'p1', ['action_creation' as CardID]);
    const r = callMove(s, 'playCreation', ['action_creation' as CardID]);
    expectMoveOk(r);
    expect(pickRelevantState(r)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // 17. 移形换影 · 与目标交换 characterId（盗梦不可对梦主）
  // -------------------------------------------------------------------------
  it('17. playShift · p1 ↔ p2 角色互换 + shiftSnapshot 快照', () => {
    const s = withHand(baseline(), 'p1', ['action_shift' as CardID]);
    const r = callMove(s, 'playShift', ['action_shift' as CardID, 'p2']);
    expectMoveOk(r);
    expect(pickRelevantState(r)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // 18. 梦魇解封 · 翻开指定层面朝下梦魇
  // -------------------------------------------------------------------------
  it('18. playNightmareUnlock · 翻开层 2 梦魇', () => {
    let s = withHand(baseline(), 'p1', ['action_nightmare_unlock' as CardID]);
    // 在层 2 安排面朝下的梦魇
    s = {
      ...s,
      layers: {
        ...s.layers,
        2: {
          ...s.layers[2]!,
          nightmareId: 'nightmare_starfall' as CardID,
          nightmareRevealed: false,
        },
      },
    };
    const r = callMove(s, 'playNightmareUnlock', ['action_nightmare_unlock' as CardID, 2]);
    expectMoveOk(r);
    expect(pickRelevantState(r)).toMatchSnapshot();
  });

  // -------------------------------------------------------------------------
  // 19-21. 死亡宣言 3/4/5（修饰符：扩面）
  // 复用 playShoot，附带 decreeId；快照展现：弃牌堆同时含 SHOOT 牌（宣言保留手中）+ 命中骰面扩展
  // -------------------------------------------------------------------------
  it('19. 死亡宣言·3 + playShoot · 骰 3 → 扩面命中死亡', () => {
    const s = withHand(baseline(), 'p1', ['action_shoot', 'action_death_decree_3'] as CardID[]);
    const r = callMove(
      s,
      'playShoot',
      ['p2', 'action_shoot' as CardID, 'action_death_decree_3' as CardID],
      { rolls: [3] },
    );
    expectMoveOk(r);
    expect(pickRelevantState(r)).toMatchSnapshot();
  });

  it('20. 死亡宣言·4 + playShoot · 骰 4 → 扩面命中死亡', () => {
    const s = withHand(baseline(), 'p1', ['action_shoot', 'action_death_decree_4'] as CardID[]);
    const r = callMove(
      s,
      'playShoot',
      ['p2', 'action_shoot' as CardID, 'action_death_decree_4' as CardID],
      { rolls: [4] },
    );
    expectMoveOk(r);
    expect(pickRelevantState(r)).toMatchSnapshot();
  });

  it('21. 死亡宣言·5 + playShoot · 骰 5 → 扩面命中死亡', () => {
    const s = withHand(baseline(), 'p1', ['action_shoot', 'action_death_decree_5'] as CardID[]);
    const r = callMove(
      s,
      'playShoot',
      ['p2', 'action_shoot' as CardID, 'action_death_decree_5' as CardID],
      { rolls: [5] },
    );
    expectMoveOk(r);
    expect(pickRelevantState(r)).toMatchSnapshot();
  });
});
