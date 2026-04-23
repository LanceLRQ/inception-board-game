// 水瓶 · 凝聚（skill_0）单测
// 对照：docs/manual/05-dream-thieves.md 水瓶 46-50 行
// 对照：plans/report/skill-development-status.md 批次 B · B1

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import type { SetupState } from './setup.js';
import {
  availableAquariusCoherence,
  applyAquariusCoherence,
  AQUARIUS_REUSE_SKILL_ID,
} from './engine/skills.js';
import { scenarioActionPhase } from './testing/scenarios.js';
import { callMove } from './testing/fixtures.js';

function setCharacter(state: SetupState, playerID: string, characterId: CardID): SetupState {
  const p = state.players[playerID];
  if (!p) return state;
  return { ...state, players: { ...state.players, [playerID]: { ...p, characterId } } };
}

function withPlayed(state: SetupState, played: CardID[]): SetupState {
  return { ...state, playedCardsThisTurn: played };
}

function withDiscard(state: SetupState, pile: CardID[]): SetupState {
  return { ...state, deck: { cards: state.deck.cards, discardPile: pile } };
}

describe('水瓶 · 凝聚 · 可触发次数', () => {
  it('0 张同名 → 0 次', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_aquarius');
    s = withPlayed(s, ['action_unlock', 'action_shoot'] as CardID[]);
    expect(availableAquariusCoherence(s, 'p1')).toBe(0);
  });

  it('2 张同名 → 1 次', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_aquarius');
    s = withPlayed(s, ['action_unlock', 'action_unlock'] as CardID[]);
    expect(availableAquariusCoherence(s, 'p1')).toBe(1);
  });

  it('4 张同名 → 2 次', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_aquarius');
    s = withPlayed(s, new Array(4).fill('action_unlock') as CardID[]);
    expect(availableAquariusCoherence(s, 'p1')).toBe(2);
  });

  it('两种同名 2+2 → 2 次（两对各算一次）', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_aquarius');
    s = withPlayed(s, [
      'action_unlock',
      'action_unlock',
      'action_shoot',
      'action_shoot',
    ] as CardID[]);
    expect(availableAquariusCoherence(s, 'p1')).toBe(2);
  });

  it('已使用计数扣除', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_aquarius');
    s = withPlayed(s, new Array(4).fill('action_unlock') as CardID[]);
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, skillUsedThisTurn: { [AQUARIUS_REUSE_SKILL_ID]: 1 } },
      },
    };
    expect(availableAquariusCoherence(s, 'p1')).toBe(1);
  });

  it('非水瓶 → 永 0', () => {
    let s = scenarioActionPhase();
    s = withPlayed(s, ['action_unlock', 'action_unlock'] as CardID[]);
    expect(availableAquariusCoherence(s, 'p1')).toBe(0);
  });
});

describe('水瓶 · 凝聚 · 取牌', () => {
  it('从弃牌堆取 1 张本回合未用过的牌', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_aquarius');
    s = withPlayed(s, ['action_unlock', 'action_unlock'] as CardID[]);
    s = withDiscard(s, ['action_kick', 'action_unlock'] as CardID[]);
    const res = applyAquariusCoherence(s, 'p1', 'action_kick' as CardID);
    expect(res).not.toBeNull();
    expect(res!.players.p1!.hand).toContain('action_kick');
    expect(res!.deck.discardPile).not.toContain('action_kick');
    // 已计一次
    expect(res!.players.p1!.skillUsedThisTurn[AQUARIUS_REUSE_SKILL_ID]).toBe(1);
  });

  it('取的牌本回合已使用过 → 拒绝', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_aquarius');
    s = withPlayed(s, ['action_unlock', 'action_unlock'] as CardID[]);
    s = withDiscard(s, ['action_unlock'] as CardID[]);
    const res = applyAquariusCoherence(s, 'p1', 'action_unlock' as CardID);
    expect(res).toBeNull();
  });

  it('弃牌堆无指定牌 → 拒绝', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_aquarius');
    s = withPlayed(s, ['action_unlock', 'action_unlock'] as CardID[]);
    s = withDiscard(s, []);
    expect(applyAquariusCoherence(s, 'p1', 'action_kick' as CardID)).toBeNull();
  });

  it('无触发额度 → 拒绝', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_aquarius');
    s = withPlayed(s, ['action_unlock'] as CardID[]);
    s = withDiscard(s, ['action_kick'] as CardID[]);
    expect(applyAquariusCoherence(s, 'p1', 'action_kick' as CardID)).toBeNull();
  });

  it('连用两次：4 张同名 → 可连续取 2 张', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_aquarius');
    s = withPlayed(s, new Array(4).fill('action_unlock') as CardID[]);
    s = withDiscard(s, ['action_kick', 'action_shoot'] as CardID[]);
    const r1 = applyAquariusCoherence(s, 'p1', 'action_kick' as CardID);
    expect(r1).not.toBeNull();
    const r2 = applyAquariusCoherence(r1!, 'p1', 'action_shoot' as CardID);
    expect(r2).not.toBeNull();
    // 第三次应拒绝
    const r3 = applyAquariusCoherence(r2!, 'p1', 'action_kick' as CardID);
    expect(r3).toBeNull();
  });
});

// ============================================================================
// W20.5 · BGIO move 集成测试（playAquariusCoherence）
// 对照：game.ts:2503 playAquariusCoherence move 入口
// ============================================================================

describe('水瓶 · 凝聚 · BGIO move 集成', () => {
  it('正确路径：调用 playAquariusCoherence 后弃牌堆 -1 + 手牌 +1', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_aquarius');
    s = withPlayed(s, ['action_unlock', 'action_unlock'] as CardID[]);
    s = withDiscard(s, ['action_kick'] as CardID[]);
    const handBefore = s.players.p1!.hand.length;
    const discardBefore = s.deck.discardPile.length;

    const result = callMove(s, 'playAquariusCoherence', ['action_kick' as CardID], {
      currentPlayer: 'p1',
    });
    expect(result).not.toBe('INVALID_MOVE');
    const next = result as SetupState;
    expect(next.players.p1!.hand.length).toBe(handBefore + 1);
    expect(next.deck.discardPile.length).toBe(discardBefore - 1);
    expect(next.players.p1!.hand).toContain('action_kick');
    // skill usage 已记录
    expect(next.players.p1!.skillUsedThisTurn[AQUARIUS_REUSE_SKILL_ID]).toBe(1);
  });

  it('拒绝：turnPhase ≠ action（draw 阶段调用）', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_aquarius');
    s = withPlayed(s, ['action_unlock', 'action_unlock'] as CardID[]);
    s = withDiscard(s, ['action_kick'] as CardID[]);
    s = { ...s, turnPhase: 'draw' };
    const result = callMove(s, 'playAquariusCoherence', ['action_kick' as CardID], {
      currentPlayer: 'p1',
    });
    expect(result).toBe('INVALID_MOVE');
  });

  it('拒绝：availableAquariusCoherence=0（未达 2 张同名）', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_aquarius');
    s = withPlayed(s, ['action_unlock'] as CardID[]); // 仅 1 张
    s = withDiscard(s, ['action_kick'] as CardID[]);
    const result = callMove(s, 'playAquariusCoherence', ['action_kick' as CardID], {
      currentPlayer: 'p1',
    });
    expect(result).toBe('INVALID_MOVE');
  });

  it('拒绝：pickCardId 不在弃牌堆', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_aquarius');
    s = withPlayed(s, ['action_unlock', 'action_unlock'] as CardID[]);
    s = withDiscard(s, [] as CardID[]); // 弃牌堆空
    const result = callMove(s, 'playAquariusCoherence', ['action_kick' as CardID], {
      currentPlayer: 'p1',
    });
    expect(result).toBe('INVALID_MOVE');
  });

  it('拒绝：pickCardId 是本回合已用过的牌', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_aquarius');
    s = withPlayed(s, ['action_unlock', 'action_unlock'] as CardID[]);
    s = withDiscard(s, ['action_unlock'] as CardID[]);
    const result = callMove(s, 'playAquariusCoherence', ['action_unlock' as CardID], {
      currentPlayer: 'p1',
    });
    expect(result).toBe('INVALID_MOVE');
  });

  it('拒绝：pendingShootMove 未消费时不得发动', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_aquarius');
    s = withPlayed(s, ['action_unlock', 'action_unlock'] as CardID[]);
    s = withDiscard(s, ['action_kick'] as CardID[]);
    s = {
      ...s,
      pendingShootMove: {
        shooterID: 'p1',
        targetPlayerID: 'p2',
        cardId: 'action_shoot' as CardID,
        extraOnMove: null,
        choices: [1, 3],
      },
    };
    const result = callMove(s, 'playAquariusCoherence', ['action_kick' as CardID], {
      currentPlayer: 'p1',
    });
    expect(result).toBe('INVALID_MOVE');
  });
});
