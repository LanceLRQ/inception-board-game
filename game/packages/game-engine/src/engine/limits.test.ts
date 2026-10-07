// 手牌上限、回合抽牌数、解封次数上限的纯函数单测
// 对照：docs/manual/03-game-flow.md 回合流程 / docs/manual/05-dream-thieves.md 巨蟹 / docs/manual/06-dream-master.md 盛夏、冥王星、黑洞

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import { BASE_DRAW_COUNT, HAND_LIMIT } from '../config.js';
import type { SetupState } from '../setup.js';
import { scenarioActionPhase } from '../testing/scenarios.js';
import {
  getDiscardRequired,
  getEffectiveMaxUnlockPerTurn,
  getHandLimit,
  getTurnDrawCount,
  needsPlutoHellRoll,
} from './limits.js';

function setCharacter(state: SetupState, playerID: string, characterId: CardID): SetupState {
  const p = state.players[playerID]!;
  return { ...state, players: { ...state.players, [playerID]: { ...p, characterId } } };
}

function setHandSize(state: SetupState, playerID: string, size: number): SetupState {
  const p = state.players[playerID]!;
  const hand = Array.from({ length: size }, () => 'action_unlock' as CardID);
  return { ...state, players: { ...state.players, [playerID]: { ...p, hand } } };
}

/** 把某人挪到另一层，并同步两层的在场名单 */
function moveToLayer(state: SetupState, playerID: string, layer: Layer): SetupState {
  const p = state.players[playerID]!;
  const from = state.layers[p.currentLayer]!;
  const to = state.layers[layer]!;
  return {
    ...state,
    players: { ...state.players, [playerID]: { ...p, currentLayer: layer } },
    layers: {
      ...state.layers,
      [p.currentLayer]: {
        ...from,
        playersInLayer: from.playersInLayer.filter((id) => id !== playerID),
      },
      [layer]: { ...to, playersInLayer: [...to.playersInLayer, playerID] },
    },
  };
}

function killPlayer(state: SetupState, playerID: string): SetupState {
  const p = state.players[playerID]!;
  return { ...state, players: { ...state.players, [playerID]: { ...p, isAlive: false } } };
}

/** p1（盗梦者）、p2（盗梦者）、pM（梦主）同在第 1 层；p2 是巨蟹 */
function withCancer(): SetupState {
  return setCharacter(scenarioActionPhase(), 'p2', 'thief_cancer');
}

function unfilledPool(count: number): SetupState['bribePool'] {
  return Array.from({ length: count }, (_, i) => ({
    id: `b${i}`,
    kind: 'fail' as const,
    status: 'inPool' as const,
    heldBy: null,
    originalOwnerId: null,
  }));
}

describe('getHandLimit', () => {
  it('没有庇佑时是手牌上限常量', () => {
    expect(getHandLimit(scenarioActionPhase(), 'p1')).toBe(HAND_LIMIT);
  });

  it('与活着的巨蟹同层 → 无上限，返回 null（可序列化，不用 Infinity）', () => {
    const limit = getHandLimit(withCancer(), 'p1');
    expect(limit).toBeNull();
    expect(JSON.parse(JSON.stringify({ limit }))).toEqual({ limit: null });
  });

  it('巨蟹本人也在庇佑之下', () => {
    expect(getHandLimit(withCancer(), 'p2')).toBeNull();
  });

  it('不同层的玩家不受庇佑', () => {
    const s = moveToLayer(withCancer(), 'p1', 3 as Layer);
    expect(getHandLimit(s, 'p1')).toBe(HAND_LIMIT);
  });

  it('巨蟹死亡后庇佑失效', () => {
    expect(getHandLimit(killPlayer(withCancer(), 'p2'), 'p1')).toBe(HAND_LIMIT);
  });

  it('玩家不存在时按常规上限处理', () => {
    expect(getHandLimit(scenarioActionPhase(), 'nobody')).toBe(HAND_LIMIT);
  });
});

describe('getDiscardRequired', () => {
  it('手牌不超限 → 0', () => {
    const s = setHandSize(scenarioActionPhase(), 'p1', HAND_LIMIT);
    expect(getDiscardRequired(s, 'p1')).toBe(0);
  });

  it('手牌超限 → 超出的张数', () => {
    const s = setHandSize(scenarioActionPhase(), 'p1', HAND_LIMIT + 2);
    expect(getDiscardRequired(s, 'p1')).toBe(2);
  });

  it('被庇佑时手牌再多也不用弃', () => {
    const s = setHandSize(withCancer(), 'p1', HAND_LIMIT + 4);
    expect(getDiscardRequired(s, 'p1')).toBe(0);
  });

  it('空手牌与不存在的玩家都是 0', () => {
    const s = scenarioActionPhase();
    expect(getDiscardRequired(s, 'p1')).toBe(0);
    expect(getDiscardRequired(s, 'nobody')).toBe(0);
  });

  // 对照：docs/manual/05-dream-thieves.md 小丑「则你在弃牌阶段必须弃掉所有手牌」
  describe('小丑·失控罚则', () => {
    function armed(state: SetupState, playerID: string, turn: number): SetupState {
      const p = state.players[playerID]!;
      return {
        ...state,
        players: { ...state.players, [playerID]: { ...p, forcedDiscardArmedAtTurn: turn } },
      };
    }

    it('当回合发动过 → 必须弃光，即使手牌没超限', () => {
      const base = setHandSize(scenarioActionPhase(), 'p1', 3);
      expect(getDiscardRequired(armed(base, 'p1', base.turnNumber), 'p1')).toBe(3);
    });

    it('手牌已空 → 0', () => {
      const base = setHandSize(scenarioActionPhase(), 'p1', 0);
      expect(getDiscardRequired(armed(base, 'p1', base.turnNumber), 'p1')).toBe(0);
    });

    it('巨蟹·庇佑不免除罚则', () => {
      const base = setHandSize(withCancer(), 'p1', HAND_LIMIT + 2);
      expect(getDiscardRequired(armed(base, 'p1', base.turnNumber), 'p1')).toBe(HAND_LIMIT + 2);
    });

    it('别的回合留下的标记不算', () => {
      const base = setHandSize(scenarioActionPhase(), 'p1', 3);
      expect(getDiscardRequired(armed(base, 'p1', base.turnNumber - 1), 'p1')).toBe(0);
    });
  });
});

describe('needsPlutoHellRoll', () => {
  it('冥王星·地狱在场时，盗梦者抽牌要掷骰', () => {
    const s = setCharacter(scenarioActionPhase(), 'pM', 'dm_pluto_hell');
    expect(needsPlutoHellRoll(s, 'p1')).toBe(true);
  });

  it('梦主本人不掷骰', () => {
    const s = setCharacter(scenarioActionPhase(), 'pM', 'dm_pluto_hell');
    expect(needsPlutoHellRoll(s, 'pM')).toBe(false);
  });

  it('其他梦主在场时不掷骰', () => {
    expect(needsPlutoHellRoll(scenarioActionPhase(), 'p1')).toBe(false);
  });
});

describe('getTurnDrawCount', () => {
  it('没有任何加成时是基础抽牌数', () => {
    const s = scenarioActionPhase();
    expect(getTurnDrawCount(s, 'p1', null)).toBe(BASE_DRAW_COUNT);
    expect(getTurnDrawCount(s, 'pM', null)).toBe(BASE_DRAW_COUNT);
  });

  it('巨蟹·气场：同层 +1', () => {
    expect(getTurnDrawCount(withCancer(), 'p1', null)).toBe(BASE_DRAW_COUNT + 1);
  });

  it('巨蟹·气场：不同层不加', () => {
    const s = moveToLayer(withCancer(), 'p1', 3 as Layer);
    expect(getTurnDrawCount(s, 'p1', null)).toBe(BASE_DRAW_COUNT);
  });

  it('盛夏·世界观：盗梦者 +1，梦主不吃这条', () => {
    const s = setCharacter(scenarioActionPhase(), 'pM', 'dm_midsummer');
    expect(getTurnDrawCount(s, 'p1', null)).toBe(BASE_DRAW_COUNT + 1);
  });

  it('盛夏·充盈：梦主按未派发的贿赂牌张数多抽', () => {
    const s = {
      ...setCharacter(scenarioActionPhase(), 'pM', 'dm_midsummer'),
      bribePool: unfilledPool(3),
    };
    expect(getTurnDrawCount(s, 'pM', null)).toBe(BASE_DRAW_COUNT + 3);
    // 盗梦者只吃世界观的 +1，不吃充盈
    expect(getTurnDrawCount(s, 'p1', null)).toBe(BASE_DRAW_COUNT + 1);
  });

  it('盛夏与气场叠加', () => {
    const s = setCharacter(withCancer(), 'pM', 'dm_midsummer');
    expect(getTurnDrawCount(s, 'p1', null)).toBe(BASE_DRAW_COUNT + 1 + 1);
  });

  it('冥王星·地狱：盗梦者的基础抽牌数被骰子结果取代', () => {
    const s = setCharacter(scenarioActionPhase(), 'pM', 'dm_pluto_hell');
    expect(getTurnDrawCount(s, 'p1', 5)).toBe(5);
    expect(getTurnDrawCount(s, 'p1', 1)).toBe(1);
  });

  it('冥王星·地狱：骰子结果与气场叠加，梦主不受骰子影响', () => {
    const s = setCharacter(withCancer(), 'pM', 'dm_pluto_hell');
    expect(getTurnDrawCount(s, 'p1', 4)).toBe(4 + 1);
    expect(getTurnDrawCount(s, 'pM', 4)).toBe(BASE_DRAW_COUNT + 1);
  });

  it('没有冥王星时，传入的骰子结果不起作用', () => {
    expect(getTurnDrawCount(scenarioActionPhase(), 'p1', 6)).toBe(BASE_DRAW_COUNT);
  });
});

describe('getEffectiveMaxUnlockPerTurn', () => {
  it('黑洞世界观：至少 2 次', () => {
    const s = setCharacter(scenarioActionPhase(), 'pM', 'dm_black_hole');
    expect(getEffectiveMaxUnlockPerTurn(s, 1)).toBe(2);
    expect(getEffectiveMaxUnlockPerTurn(s, 3)).toBe(3);
  });

  it('其他梦主：沿用原始值', () => {
    expect(getEffectiveMaxUnlockPerTurn(scenarioActionPhase(), 1)).toBe(1);
  });
});
