// 雅典娜 · 急智（thief_athena.skill_0）BGIO move 集成单测
// 对照：docs/manual/05-dream-thieves.md 雅典娜
// 对照：plans/tasks.md W20.5 · Phase 3 遗留 · 响应窗口技能（5 项）批次 E
//
// 规则："当其他盗梦者对你使用行动牌时，你可以先从弃牌堆顶部摸 1 张牌"
//
// 实装策略：主动 move（不强制响应窗口），雅典娜玩家在他人回合任意时机可发起；
// perTurn 限制（每回合 1 次）由 turn.onBegin 重置 skillUsedThisTurn 自然实现
// "每个对手回合限 1 次"
//
// 覆盖范围：
//   A. happy path（他人回合 + 弃牌堆有牌 + 未用过）
//   B. 拒绝路径（自己回合 / 已用 / 死亡 / 角色不匹配 / 弃牌堆空）
//   C. 限制：每回合 1 次（连用 2 次第二次拒）

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from './setup.js';
import { callMove, createTestState, makePlayer } from './testing/fixtures.js';
import { ATHENA_WIT_SKILL_ID } from './engine/skills.js';

const KICK: CardID = 'action_kick' as CardID;
const SHOOT: CardID = 'action_shoot' as CardID;

/**
 * 标准场景：
 *   - p1 当前回合（盗梦者）
 *   - p2 雅典娜（thief_athena），手牌空，存活
 *   - p3 普通盗梦者
 *   - 弃牌堆有 [KICK, SHOOT]（顶部 = 末尾元素 SHOOT）
 *
 * 用于回合外 move 测试：currentPlayer 从 p1 切到 p2 模拟"他人回合内雅典娜响应"
 */
function sceneAthenaOffTurn(): SetupState {
  const base = createTestState({
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 1,
    currentPlayerID: 'p1',
    dreamMasterID: 'pM',
  });
  return {
    ...base,
    players: {
      ...base.players,
      p1: makePlayer({
        id: 'p1',
        nickname: 'P1',
        faction: 'thief',
        currentLayer: 1 as Layer,
        hand: [KICK],
      }),
      p2: makePlayer({
        id: 'p2',
        nickname: 'P2',
        faction: 'thief',
        characterId: 'thief_athena' as CardID,
        currentLayer: 1 as Layer,
        hand: [],
      }),
      p3: makePlayer({
        id: 'p3',
        nickname: 'P3',
        faction: 'thief',
        currentLayer: 1 as Layer,
      }),
      pM: makePlayer({
        id: 'pM',
        nickname: 'PM',
        faction: 'master',
        currentLayer: 0 as Layer,
      }),
    },
    deck: { cards: base.deck.cards, discardPile: [KICK, SHOOT] },
  };
}

// ============================================================================
// A. happy path
// ============================================================================

describe('雅典娜 · 急智 · useAthenaWit happy path', () => {
  it('正确路径：他人回合（p1）+ p2 调用 → 弃牌堆顶 SHOOT 入手 + skill 计数 +1', () => {
    const s = sceneAthenaOffTurn();
    const handBefore = s.players.p2!.hand.length;
    const discardBefore = s.deck.discardPile.length;

    const result = callMove(s, 'useAthenaWit', [], { currentPlayer: 'p2' });
    expect(result).not.toBe('INVALID_MOVE');
    const next = result as SetupState;

    // 弃牌堆顶（末尾）SHOOT 入 p2 手牌
    expect(next.players.p2!.hand.length).toBe(handBefore + 1);
    expect(next.players.p2!.hand).toContain(SHOOT);
    expect(next.deck.discardPile.length).toBe(discardBefore - 1);
    expect(next.deck.discardPile).toEqual([KICK]);
    // skill 已记录使用
    expect(next.players.p2!.skillUsedThisTurn[ATHENA_WIT_SKILL_ID]).toBe(1);
  });
});

// ============================================================================
// B. 拒绝路径
// ============================================================================

describe('雅典娜 · 急智 · useAthenaWit 拒绝路径', () => {
  it('拒绝：雅典娜自己回合（currentPlayer === currentPlayerID）', () => {
    let s = sceneAthenaOffTurn();
    s = { ...s, currentPlayerID: 'p2' };
    const result = callMove(s, 'useAthenaWit', [], { currentPlayer: 'p2' });
    expect(result).toBe('INVALID_MOVE');
  });

  it('拒绝：非雅典娜角色', () => {
    const s = sceneAthenaOffTurn();
    const result = callMove(s, 'useAthenaWit', [], { currentPlayer: 'p3' });
    expect(result).toBe('INVALID_MOVE');
  });

  it('拒绝：雅典娜死亡', () => {
    let s = sceneAthenaOffTurn();
    s = {
      ...s,
      players: {
        ...s.players,
        p2: { ...s.players.p2!, isAlive: false, deathTurn: 1, currentLayer: 0 as Layer },
      },
    };
    const result = callMove(s, 'useAthenaWit', [], { currentPlayer: 'p2' });
    expect(result).toBe('INVALID_MOVE');
  });

  it('拒绝：弃牌堆为空', () => {
    let s = sceneAthenaOffTurn();
    s = { ...s, deck: { cards: s.deck.cards, discardPile: [] } };
    const result = callMove(s, 'useAthenaWit', [], { currentPlayer: 'p2' });
    expect(result).toBe('INVALID_MOVE');
  });

  it('拒绝：phase ≠ playing', () => {
    let s = sceneAthenaOffTurn();
    s = { ...s, phase: 'setup' };
    const result = callMove(s, 'useAthenaWit', [], { currentPlayer: 'p2' });
    expect(result).toBe('INVALID_MOVE');
  });
});

// ============================================================================
// C. 限制：每回合 1 次
// ============================================================================

describe('雅典娜 · 急智 · 每回合 1 次限制', () => {
  it('连续 2 次：第二次拒（perTurn=1）', () => {
    const s = sceneAthenaOffTurn();
    const r1 = callMove(s, 'useAthenaWit', [], { currentPlayer: 'p2' });
    expect(r1).not.toBe('INVALID_MOVE');
    const after1 = r1 as SetupState;
    expect(after1.players.p2!.skillUsedThisTurn[ATHENA_WIT_SKILL_ID]).toBe(1);

    // 第二次必须拒（perTurn 限制）
    const r2 = callMove(after1, 'useAthenaWit', [], { currentPlayer: 'p2' });
    expect(r2).toBe('INVALID_MOVE');
  });

  it('skillUsedThisTurn 重置后可再次使用（模拟新回合）', () => {
    const s = sceneAthenaOffTurn();
    const r1 = callMove(s, 'useAthenaWit', [], { currentPlayer: 'p2' });
    let after1 = r1 as SetupState;

    // 模拟回合切换：手动重置 p2 的 skillUsedThisTurn + 重新填弃牌堆
    after1 = {
      ...after1,
      players: {
        ...after1.players,
        p2: { ...after1.players.p2!, skillUsedThisTurn: {} },
      },
      deck: { ...after1.deck, discardPile: [KICK] },
    };

    const r2 = callMove(after1, 'useAthenaWit', [], { currentPlayer: 'p2' });
    expect(r2).not.toBe('INVALID_MOVE');
    const after2 = r2 as SetupState;
    expect(after2.players.p2!.hand).toContain(KICK);
  });
});
