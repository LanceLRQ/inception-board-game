// 出牌追踪基础设施测试（Phase 3 坑③子系统）
// 验证 recordCardPlayed + turn.onBegin 重置 + 代表性 play moves 接入
// 对照：plans/design/02-game-rules-spec.md §2.4 · setup.ts playedCardsThisTurn

import { describe, it, expect } from 'vitest';
import { recordCardPlayed, beginTurn } from './moves.js';
import { createTestState } from './testing/fixtures.js';
import type { CardID } from '@icgame/shared';

describe('出牌追踪 · recordCardPlayed', () => {
  it('首次记录时追加到 playedCardsThisTurn 末尾', () => {
    const s0 = createTestState();
    expect(s0.playedCardsThisTurn).toEqual([]);
    expect(s0.lastPlayedCardThisTurn).toBeNull();

    const s1 = recordCardPlayed(s0, 'action_shoot' as CardID);
    expect(s1.playedCardsThisTurn).toEqual(['action_shoot']);
    expect(s1.lastPlayedCardThisTurn).toBe('action_shoot');
  });

  it('多次记录按时序追加，lastPlayedCardThisTurn 始终是最新', () => {
    let s = createTestState();
    s = recordCardPlayed(s, 'action_shoot' as CardID);
    s = recordCardPlayed(s, 'action_unlock' as CardID);
    s = recordCardPlayed(s, 'action_kick' as CardID);
    expect(s.playedCardsThisTurn).toEqual(['action_shoot', 'action_unlock', 'action_kick']);
    expect(s.lastPlayedCardThisTurn).toBe('action_kick');
  });

  it('不修改源 state（immutability）', () => {
    const s0 = createTestState();
    const s1 = recordCardPlayed(s0, 'action_shoot' as CardID);
    expect(s0.playedCardsThisTurn).toEqual([]);
    expect(s0.lastPlayedCardThisTurn).toBeNull();
    expect(s1).not.toBe(s0);
  });

  it('defensive：字段缺失时 fallback 空数组，不抛错', () => {
    const s0 = createTestState();
    // 模拟旧 schema：字段未初始化
    const legacy = { ...s0, playedCardsThisTurn: undefined as unknown as CardID[] };
    const s1 = recordCardPlayed(legacy as typeof s0, 'action_shoot' as CardID);
    expect(s1.playedCardsThisTurn).toEqual(['action_shoot']);
  });
});

describe('出牌追踪 · beginTurn 清零', () => {
  it('新回合开始时 playedCardsThisTurn 清空、lastPlayedCardThisTurn 归 null', () => {
    let s = createTestState({
      phase: 'playing',
      turnPhase: 'turnEnd',
      currentPlayerID: 'p1',
    });
    s = recordCardPlayed(s, 'action_shoot' as CardID);
    s = recordCardPlayed(s, 'action_unlock' as CardID);
    expect(s.playedCardsThisTurn).toHaveLength(2);

    const next = beginTurn(s, 'p2');
    expect(next.playedCardsThisTurn).toEqual([]);
    expect(next.lastPlayedCardThisTurn).toBeNull();
    expect(next.turnPhase).toBe('draw');
    expect(next.currentPlayerID).toBe('p2');
  });

  it('beginTurn 不影响除 play 追踪外的其他字段', () => {
    const s0 = createTestState({ phase: 'playing', turnNumber: 5 });
    const s1 = recordCardPlayed(s0, 'action_shoot' as CardID);
    const next = beginTurn(s1, s0.currentPlayerID);
    expect(next.turnNumber).toBe(6);
    expect(next.players).toBeDefined();
  });
});
