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

  it('小丑 → forcedDiscardArmedAtTurn 记录当前 turnNumber', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'draw',
      currentPlayerID: 'p1',
      turnNumber: 3,
      players: { ...s.players, p1: { ...s.players.p1!, characterId: 'thief_joker' as CardID } },
      deck: { ...s.deck, cards: ['action_unlock' as CardID, 'action_shoot' as CardID] },
    };
    const r = callMove(s, 'playJokerGamble', [], { rolls: [2] });
    expectMoveOk(r);
    expect(r.players.p1!.forcedDiscardArmedAtTurn).toBe(3);
  });
});

describe('小丑罚则 · 下回合 discard 强制全弃', () => {
  it('同回合 discard（armed===turnNumber）→ 不强制，允许部分弃', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'discard',
      currentPlayerID: 'p1',
      turnNumber: 5,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1!,
          hand: ['action_unlock' as CardID, 'action_shoot' as CardID],
          forcedDiscardArmedAtTurn: 5, // 同回合设防
        },
      },
    };
    const r = callMove(s, 'doDiscard', [['action_unlock' as CardID]]);
    expectMoveOk(r);
    // 未过期 → armed 保留
    expect(r.players.p1!.forcedDiscardArmedAtTurn).toBe(5);
  });

  it('下回合 discard + 仅弃部分 → INVALID_MOVE', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'discard',
      currentPlayerID: 'p1',
      turnNumber: 6,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1!,
          hand: ['action_unlock' as CardID, 'action_shoot' as CardID, 'action_shift' as CardID],
          forcedDiscardArmedAtTurn: 5, // 上回合设防
        },
      },
    };
    const r = callMove(s, 'doDiscard', [['action_unlock' as CardID]]);
    expect(r).toBe('INVALID_MOVE');
  });

  it('下回合 discard + 弃全部 → 成功 + armed 清除', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'discard',
      currentPlayerID: 'p1',
      turnNumber: 6,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1!,
          hand: ['action_unlock' as CardID, 'action_shoot' as CardID],
          forcedDiscardArmedAtTurn: 5,
        },
      },
    };
    const r = callMove(s, 'doDiscard', [['action_unlock' as CardID, 'action_shoot' as CardID]]);
    expectMoveOk(r);
    expect(r.players.p1!.hand).toEqual([]);
    expect(r.players.p1!.forcedDiscardArmedAtTurn).toBeNull();
  });

  it('下回合 skipDiscard 但手牌 > 0 → INVALID_MOVE（不得跳过）', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'discard',
      currentPlayerID: 'p1',
      turnNumber: 6,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1!,
          hand: ['action_unlock' as CardID],
          forcedDiscardArmedAtTurn: 5,
        },
      },
    };
    const r = callMove(s, 'skipDiscard', []);
    expect(r).toBe('INVALID_MOVE');
  });

  it('下回合 skipDiscard + 手牌=0 → 允许（已自然满足全弃）', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'discard',
      currentPlayerID: 'p1',
      turnNumber: 6,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1!,
          hand: [],
          forcedDiscardArmedAtTurn: 5,
        },
      },
    };
    const r = callMove(s, 'skipDiscard', []);
    expectMoveOk(r);
  });

  it('无 armed（字段 undefined）→ 正常 skipDiscard 不受影响', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'discard',
      currentPlayerID: 'p1',
      turnNumber: 6,
      players: { ...s.players, p1: { ...s.players.p1!, hand: ['action_unlock' as CardID] } },
    };
    const r = callMove(s, 'skipDiscard', []);
    expectMoveOk(r);
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
