// 水星世界观 / 小丑·赌博 / 黑天鹅·巡演 接入测试
// 对照：docs/manual/06-dream-master.md 水星·航路 + docs/manual/05-dream-thieves.md 小丑/黑天鹅

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import { applyMercuryRouteExtraFailBribe, applyVenusDouble } from './engine/skills.js';
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

// 固定顺序 shuffle（测试确定性）
const identityShuffle = <T>(arr: readonly T[]): T[] => [...arr];

describe('applyVenusDouble（金星·重影纯函数）', () => {
  function setVenusMaster(
    state: ReturnType<typeof scenarioStartOfGame3p>,
  ): ReturnType<typeof scenarioStartOfGame3p> {
    const mid = 'pM';
    return {
      ...state,
      players: {
        ...state.players,
        [mid]: { ...state.players[mid]!, characterId: 'dm_venus_mirror' as CardID },
      },
    };
  }

  it('非金星梦主 → null', () => {
    const s = scenarioStartOfGame3p();
    const r = applyVenusDouble(s, 'pM', [], identityShuffle);
    expect(r).toBeNull();
  });

  it('展示手牌不在手中 → null', () => {
    let s = setVenusMaster(scenarioStartOfGame3p());
    s = {
      ...s,
      players: { ...s.players, pM: { ...s.players.pM!, hand: ['action_unlock' as CardID] } },
    };
    const r = applyVenusDouble(s, 'pM', ['action_shoot' as CardID], identityShuffle);
    expect(r).toBeNull();
  });

  it('牌库顶无同名 → 全部混洗回顶 + 手牌不变', () => {
    let s = setVenusMaster(scenarioStartOfGame3p());
    s = {
      ...s,
      players: { ...s.players, pM: { ...s.players.pM!, hand: ['action_unlock' as CardID] } },
      deck: {
        ...s.deck,
        cards: ['action_shoot' as CardID, 'action_shift' as CardID, 'action_kick' as CardID],
      },
    };
    // aliveThieves = p1 + p2 = 2
    const r = applyVenusDouble(s, 'pM', ['action_unlock' as CardID], identityShuffle);
    expect(r).not.toBeNull();
    expect(r!.players.pM!.hand).toEqual(['action_unlock']); // 未增加
    // 前 2 张（非同名）混洗回顶，原第 3 张保留
    expect(r!.deck.cards).toEqual(['action_shoot', 'action_shift', 'action_kick']);
  });

  it('牌库顶有 1 张同名 → 入梦主手 + 剩余回顶', () => {
    let s = setVenusMaster(scenarioStartOfGame3p());
    s = {
      ...s,
      players: { ...s.players, pM: { ...s.players.pM!, hand: ['action_shoot' as CardID] } },
      deck: {
        ...s.deck,
        cards: ['action_shoot' as CardID, 'action_shift' as CardID, 'action_kick' as CardID],
      },
    };
    const r = applyVenusDouble(s, 'pM', ['action_shoot' as CardID], identityShuffle);
    expect(r).not.toBeNull();
    // 同名 shoot 入手 → 梦主手牌 +1 shoot
    expect(r!.players.pM!.hand.sort()).toEqual(['action_shoot', 'action_shoot']);
    // 剩余（shift）回顶 + 原第 3 张（kick）保留
    expect(r!.deck.cards).toEqual(['action_shift', 'action_kick']);
  });

  it('牌库顶两张同名 → 全部入手', () => {
    let s = setVenusMaster(scenarioStartOfGame3p());
    s = {
      ...s,
      players: { ...s.players, pM: { ...s.players.pM!, hand: ['action_unlock' as CardID] } },
      deck: {
        ...s.deck,
        cards: ['action_unlock' as CardID, 'action_unlock' as CardID, 'action_shift' as CardID],
      },
    };
    const r = applyVenusDouble(s, 'pM', ['action_unlock' as CardID], identityShuffle);
    expect(r).not.toBeNull();
    expect(r!.players.pM!.hand.length).toBe(3); // 原 1 + 2 同名
    expect(r!.deck.cards).toEqual(['action_shift']);
  });

  it('梦主死亡 → null', () => {
    let s = setVenusMaster(scenarioStartOfGame3p());
    s = { ...s, players: { ...s.players, pM: { ...s.players.pM!, isAlive: false } } };
    const r = applyVenusDouble(s, 'pM', [], identityShuffle);
    expect(r).toBeNull();
  });

  it('活盗梦者 = 0 → null', () => {
    let s = setVenusMaster(scenarioStartOfGame3p());
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, isAlive: false },
        p2: { ...s.players.p2!, isAlive: false },
      },
    };
    const r = applyVenusDouble(s, 'pM', [], identityShuffle);
    expect(r).toBeNull();
  });

  it('牌库不足 N → 按实际 take 数量处理', () => {
    let s = setVenusMaster(scenarioStartOfGame3p());
    s = {
      ...s,
      players: { ...s.players, pM: { ...s.players.pM!, hand: ['action_shoot' as CardID] } },
      deck: { ...s.deck, cards: ['action_shoot' as CardID] }, // 仅 1 张，但 N=2
    };
    const r = applyVenusDouble(s, 'pM', ['action_shoot' as CardID], identityShuffle);
    expect(r).not.toBeNull();
    expect(r!.players.pM!.hand.length).toBe(2); // 收了 1 张同名
    expect(r!.deck.cards).toEqual([]);
  });

  it('第二次调用 → null（回合限 1 次）', () => {
    let s = setVenusMaster(scenarioStartOfGame3p());
    s = {
      ...s,
      players: { ...s.players, pM: { ...s.players.pM!, hand: ['action_shoot' as CardID] } },
      deck: { ...s.deck, cards: ['action_shoot' as CardID, 'action_shift' as CardID] },
    };
    const once = applyVenusDouble(s, 'pM', ['action_shoot' as CardID], identityShuffle);
    expect(once).not.toBeNull();
    const twice = applyVenusDouble(once!, 'pM', [], identityShuffle);
    expect(twice).toBeNull();
  });
});

describe('useVenusDouble move', () => {
  it('非梦主回合 → INVALID_MOVE', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'action',
      currentPlayerID: 'p1', // 非梦主
      players: {
        ...s.players,
        pM: { ...s.players.pM!, characterId: 'dm_venus_mirror' as CardID },
      },
    };
    const r = callMove(s, 'useVenusDouble', [[]]);
    expect(r).toBe('INVALID_MOVE');
  });

  it('非 action 阶段 → INVALID_MOVE', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'draw',
      currentPlayerID: 'pM',
      players: {
        ...s.players,
        pM: { ...s.players.pM!, characterId: 'dm_venus_mirror' as CardID },
      },
    };
    const r = callMove(s, 'useVenusDouble', [[]], { currentPlayer: 'pM' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('金星梦主 + action + 牌库有同名 → 入手成功', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'action',
      currentPlayerID: 'pM',
      players: {
        ...s.players,
        pM: {
          ...s.players.pM!,
          characterId: 'dm_venus_mirror' as CardID,
          hand: ['action_shoot' as CardID],
        },
      },
      deck: {
        ...s.deck,
        cards: ['action_shoot' as CardID, 'action_shift' as CardID],
      },
    };
    const r = callMove(s, 'useVenusDouble', [['action_shoot' as CardID]], {
      currentPlayer: 'pM',
    });
    expectMoveOk(r);
    expect(r.players.pM!.hand.length).toBe(2);
  });

  it('参数非数组 → INVALID_MOVE', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'action',
      currentPlayerID: 'pM',
      players: {
        ...s.players,
        pM: { ...s.players.pM!, characterId: 'dm_venus_mirror' as CardID },
      },
    };
    const r = callMove(s, 'useVenusDouble', ['not-array'], { currentPlayer: 'pM' });
    expect(r).toBe('INVALID_MOVE');
  });
});
