// 水星世界观 / 小丑·赌博 / 黑天鹅·巡演 接入测试
// 对照：docs/manual/06-dream-master.md 水星·航路 + docs/manual/05-dream-thieves.md 小丑/黑天鹅

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import { applyMercuryRouteExtraFailBribe } from './engine/skills.js';
import { scenarioStartOfGame3p } from './testing/scenarios.js';
import { callMove, expectMoveOk } from './testing/fixtures.js';

describe('applyMercuryRouteExtraFailBribe（水星世界观）', () => {
  it('非水星梦主 → bribePool 不变', () => {
    const s = scenarioStartOfGame3p();
    const before = s.bribePool.length;
    const r = applyMercuryRouteExtraFailBribe(s, 'dm_harbor' as CardID);
    expect(r.bribePool.length).toBe(before);
    expect(r).toBe(s); // 引用相等
  });

  it('masterCharacterID 为 null → bribePool 不变', () => {
    const s = scenarioStartOfGame3p();
    const r = applyMercuryRouteExtraFailBribe(s, null);
    expect(r).toBe(s);
  });

  it('水星梦主 → bribePool +1 fail 条目', () => {
    const s = scenarioStartOfGame3p();
    const before = s.bribePool.length;
    const r = applyMercuryRouteExtraFailBribe(s, 'dm_mercury_route' as CardID);
    expect(r.bribePool.length).toBe(before + 1);
    const added = r.bribePool[r.bribePool.length - 1]!;
    expect(added.id.startsWith('bribe-fail-')).toBe(true);
    expect(added.status).toBe('inPool');
    expect(added.heldBy).toBeNull();
    expect(added.originalOwnerId).toBeNull();
  });

  it('水星梦主 → fail 计数相对 +1（不影响 deal 计数）', () => {
    const s = scenarioStartOfGame3p();
    const beforeFail = s.bribePool.filter((b) => b.id.includes('fail')).length;
    const beforeDeal = s.bribePool.filter((b) => b.id.includes('deal')).length;
    const r = applyMercuryRouteExtraFailBribe(s, 'dm_mercury_route' as CardID);
    const afterFail = r.bribePool.filter((b) => b.id.includes('fail')).length;
    const afterDeal = r.bribePool.filter((b) => b.id.includes('deal')).length;
    expect(afterFail).toBe(beforeFail + 1);
    expect(afterDeal).toBe(beforeDeal);
  });

  it('重复调用 → id 不冲突（suffix 增量）', () => {
    const s = scenarioStartOfGame3p();
    const once = applyMercuryRouteExtraFailBribe(s, 'dm_mercury_route' as CardID);
    const twice = applyMercuryRouteExtraFailBribe(once, 'dm_mercury_route' as CardID);
    const ids = twice.bribePool.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(twice.bribePool.length).toBe(s.bribePool.length + 2);
  });
});

describe('playJokerGamble move', () => {
  it('非小丑角色 → INVALID_MOVE', () => {
    let s = scenarioStartOfGame3p();
    s = { ...s, turnPhase: 'draw', currentPlayerID: 'p1' };
    const r = callMove(s, 'playJokerGamble', []);
    expect(r).toBe('INVALID_MOVE');
  });

  it('非 draw 阶段 → INVALID_MOVE', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'action',
      currentPlayerID: 'p1',
      players: { ...s.players, p1: { ...s.players.p1!, characterId: 'thief_joker' as CardID } },
    };
    const r = callMove(s, 'playJokerGamble', []);
    expect(r).toBe('INVALID_MOVE');
  });

  it('小丑 + draw 阶段 + roll=4 → 抽 4 张 + 转 action', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'draw',
      currentPlayerID: 'p1',
      players: { ...s.players, p1: { ...s.players.p1!, characterId: 'thief_joker' as CardID } },
      deck: {
        ...s.deck,
        cards: [
          'action_unlock' as CardID,
          'action_shoot' as CardID,
          'action_shift' as CardID,
          'action_unlock' as CardID,
          'action_unlock' as CardID,
          'action_unlock' as CardID,
        ],
      },
    };
    const beforeHand = s.players.p1!.hand.length;
    const r = callMove(s, 'playJokerGamble', []); // 默认 D6=4
    expectMoveOk(r);
    expect(r.players.p1!.hand.length).toBe(beforeHand + 4);
    expect(r.turnPhase).toBe('action');
  });

  it('小丑 + roll=1 → 抽 1 张（下限）', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'draw',
      currentPlayerID: 'p1',
      players: { ...s.players, p1: { ...s.players.p1!, characterId: 'thief_joker' as CardID } },
      deck: { ...s.deck, cards: ['action_unlock' as CardID, 'action_shoot' as CardID] },
    };
    const beforeHand = s.players.p1!.hand.length;
    const r = callMove(s, 'playJokerGamble', [], { rolls: [1] });
    expectMoveOk(r);
    expect(r.players.p1!.hand.length).toBe(beforeHand + 1);
  });

  it('小丑 + 死亡 → INVALID_MOVE', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'draw',
      currentPlayerID: 'p1',
      players: {
        ...s.players,
        p1: { ...s.players.p1!, characterId: 'thief_joker' as CardID, isAlive: false },
      },
    };
    const r = callMove(s, 'playJokerGamble', []);
    expect(r).toBe('INVALID_MOVE');
  });
});

describe('playBlackSwanTour move', () => {
  it('非黑天鹅 → INVALID_MOVE', () => {
    let s = scenarioStartOfGame3p();
    s = { ...s, turnPhase: 'draw', currentPlayerID: 'p1' };
    const r = callMove(s, 'playBlackSwanTour', [{}]);
    expect(r).toBe('INVALID_MOVE');
  });

  it('非 draw 阶段 → INVALID_MOVE', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'action',
      currentPlayerID: 'p1',
      players: {
        ...s.players,
        p1: {
          ...s.players.p1!,
          characterId: 'thief_black_swan' as CardID,
          hand: ['action_unlock' as CardID],
        },
      },
    };
    const r = callMove(s, 'playBlackSwanTour', [{ p2: ['action_unlock' as CardID] }]);
    expect(r).toBe('INVALID_MOVE');
  });

  it('黑天鹅 + 合法分发 → 手牌清空 + 抽 4 + 转 action', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'draw',
      currentPlayerID: 'p1',
      players: {
        ...s.players,
        p1: {
          ...s.players.p1!,
          characterId: 'thief_black_swan' as CardID,
          hand: ['action_shoot' as CardID, 'action_unlock' as CardID],
        },
      },
      deck: {
        ...s.deck,
        cards: [
          'action_unlock' as CardID,
          'action_shift' as CardID,
          'action_shoot' as CardID,
          'action_unlock' as CardID,
        ],
      },
    };
    const r = callMove(s, 'playBlackSwanTour', [
      { p2: ['action_shoot' as CardID, 'action_unlock' as CardID] },
    ]);
    expectMoveOk(r);
    expect(r.players.p1!.hand.length).toBe(4); // 清空后抽 4
    expect(r.players.p2!.hand).toContain('action_shoot');
    expect(r.players.p2!.hand).toContain('action_unlock');
    expect(r.turnPhase).toBe('action');
  });

  it('黑天鹅 + 分发给梦主（阵营错） → INVALID_MOVE', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'draw',
      currentPlayerID: 'p1',
      players: {
        ...s.players,
        p1: {
          ...s.players.p1!,
          characterId: 'thief_black_swan' as CardID,
          hand: ['action_shoot' as CardID],
        },
      },
    };
    const r = callMove(s, 'playBlackSwanTour', [{ pM: ['action_shoot' as CardID] }]);
    expect(r).toBe('INVALID_MOVE');
  });

  it('黑天鹅 + 空手牌 → INVALID_MOVE', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'draw',
      currentPlayerID: 'p1',
      players: {
        ...s.players,
        p1: { ...s.players.p1!, characterId: 'thief_black_swan' as CardID, hand: [] },
      },
    };
    const r = callMove(s, 'playBlackSwanTour', [{}]);
    expect(r).toBe('INVALID_MOVE');
  });
});
