// 海王星·泓洋「风暴」接线：每当心锁数减少、或时间风暴效果结算后，从牌库顶弃 5 张牌。
// 对照：docs/manual/06-dream-master.md 海王星·泓洋（32-39 行）：
//   「心锁减少一次则从牌库顶弃掉 5 张牌。如双子的技能【命运】减少 2 个心锁也只视为一次」
// 一律经真实 move 驱动（运行器），纯函数只测底层的边界。

import { describe, it, expect } from 'vitest';
import type { CardID } from '@icgame/shared';
import { SAGITTARIUS_KILLS_THIS_TURN_KEY } from './engine/death.js';
import { checkStateInvariants } from './engine/stateInvariants.js';
import { applyNeptuneStorm } from './engine/skills.js';
import type { SetupState } from './setup.js';
import { discardCard, setLayerHeartLock } from './stateOps.js';
import { applyMove } from './runner/matchRunner.js';
import { withBribes } from './testing/fixtures.js';
import {
  c,
  fixedRandom,
  game,
  KICK,
  load,
  scene,
  TIME_STORM,
  UNLOCK,
  withPlayer,
} from './testing/runnerHarness.js';

const NEPTUNE = c('dm_neptune_ocean');
const FORTRESS = c('dm_fortress');

/** 把梦主换成指定梦主，牌库换成 n 张可数的牌（c0, c1, ...） */
function withMaster(G: SetupState, characterId: CardID, deckSize = 30): SetupState {
  const cards = Array.from({ length: deckSize }, (_, i) => c(`card_${i}`));
  return { ...withPlayer(G, 'pM', { characterId }), deck: { cards, discardPile: [] } };
}

function baseScene(extra: Partial<SetupState> = {}): SetupState {
  return scene(
    {
      p1: { layer: 2, hand: [UNLOCK] },
      p2: { layer: 1, hand: [KICK] },
      p3: { layer: 1, hand: [KICK] },
      p4: { layer: 1, hand: [KICK] },
      pM: { layer: 3, hand: [KICK] },
    },
    { currentPlayerID: 'p1', turnPhase: 'action', ...extra },
  );
}

function setLock(G: SetupState, layer: number, value: number): SetupState {
  return { ...G, layers: { ...G.layers, [layer]: { ...G.layers[layer]!, heartLockValue: value } } };
}

/** 其余玩家都不在场：解封没有可响应者，当场结算 */
function soleUnlocker(G: SetupState): SetupState {
  return {
    ...G,
    players: Object.fromEntries(
      Object.entries(G.players).map(([id, p]) => [id, id === 'p1' ? p : { ...p, isAlive: false }]),
    ),
  };
}

function run(G: SetupState, playerID: string, move: string, args: unknown[] = [], roll = 3) {
  return applyMove(game, load(G), { playerID, move, args }, { random: fixedRandom(roll) });
}

function ok(G: SetupState, playerID: string, move: string, args: unknown[] = [], roll = 3) {
  const res = run(G, playerID, move, args, roll);
  expect(res.ok, `${move} 应被接受`).toBe(true);
  if (!res.ok) throw new Error(`${move} 被拒绝：${res.reason}`);
  return res.state.G;
}

describe('海王星·风暴 · 心锁减少（底层入口）', () => {
  it('减少 1 个心锁：弃 5 张，牌进弃牌堆', () => {
    const G = setLock(withMaster(baseScene(), NEPTUNE), 2, 3);
    const next = setLayerHeartLock(G, 2, 2);
    expect(next.deck.cards).toHaveLength(25);
    expect(next.deck.discardPile).toEqual(G.deck.cards.slice(0, 5));
  });

  it('一次减少 2 个心锁只算一次事件：只弃 5 张', () => {
    const G = setLock(withMaster(baseScene(), NEPTUNE), 2, 3);
    const next = setLayerHeartLock(G, 2, 1);
    expect(next.layers[2]!.heartLockValue).toBe(1);
    expect(next.deck.cards).toHaveLength(25);
  });

  it('心锁增加不触发', () => {
    const G = setLock(withMaster(baseScene(), NEPTUNE), 2, 3);
    const next = setLayerHeartLock(G, 2, 5);
    expect(next.deck).toEqual(G.deck);
  });

  it('心锁没有变化不触发', () => {
    const G = setLock(withMaster(baseScene(), NEPTUNE), 2, 3);
    const next = setLayerHeartLock(G, 2, 3);
    expect(next).toBe(G);
  });

  it('梦主不是海王星：心锁减少不弃牌', () => {
    const G = setLock(withMaster(baseScene(), FORTRESS), 2, 3);
    const next = setLayerHeartLock(G, 2, 2);
    expect(next.deck.cards).toHaveLength(30);
    expect(next.deck.discardPile).toHaveLength(0);
  });

  it('牌库不足 5 张：弃到空，不报错', () => {
    const G = setLock(withMaster(baseScene(), NEPTUNE, 3), 2, 3);
    const next = setLayerHeartLock(G, 2, 2);
    expect(next.deck.cards).toHaveLength(0);
    expect(next.deck.discardPile).toHaveLength(3);
  });

  it('心锁减到 0 翻开金库的同一次减少也触发一次', () => {
    const G = setLock(withMaster(baseScene(), NEPTUNE), 2, 1);
    const next = setLayerHeartLock(G, 2, 0, { actorID: 'p1' });
    expect(next.vaults.find((v) => v.layer === 2)!.isOpened).toBe(true);
    expect(next.deck.cards).toHaveLength(25);
  });

  it('applyNeptuneStorm 本身仍是纯函数：非海王星原样返回', () => {
    const G = withMaster(baseScene(), FORTRESS);
    expect(applyNeptuneStorm(G)).toBe(G);
  });
});

describe('海王星·风暴 · 时间风暴结算后', () => {
  it('从手中弃掉时间风暴：先翻 10 张，再因风暴弃 5 张，时间风暴移出游戏', () => {
    const G = withMaster(baseScene(), NEPTUNE);
    const next = discardCard(withPlayer(G, 'p1', { hand: [TIME_STORM] }), 'p1', TIME_STORM);
    expect(next.deck.cards).toHaveLength(15);
    expect(next.deck.discardPile).toHaveLength(15);
    expect(next.removedFromGame).toEqual([TIME_STORM]);
  });

  it('梦主不是海王星：只翻 10 张', () => {
    const G = withMaster(baseScene(), FORTRESS);
    const next = discardCard(withPlayer(G, 'p1', { hand: [TIME_STORM] }), 'p1', TIME_STORM);
    expect(next.deck.cards).toHaveLength(20);
  });

  it('牌库只剩 12 张：翻 10 张后再弃光剩下的 2 张', () => {
    const G = withMaster(baseScene(), NEPTUNE, 12);
    const next = discardCard(withPlayer(G, 'p1', { hand: [TIME_STORM] }), 'p1', TIME_STORM);
    expect(next.deck.cards).toHaveLength(0);
    expect(next.deck.discardPile).toHaveLength(12);
  });

  it('打出别的牌不算风暴：弃出一张 KICK 不弃牌库', () => {
    const G = withMaster(baseScene(), NEPTUNE);
    const next = discardCard(withPlayer(G, 'p1', { hand: [KICK] }), 'p1', KICK);
    expect(next.deck.cards).toHaveLength(30);
  });
});

describe('海王星·风暴 · 经对局流程', () => {
  it('playTimeStorm：10 + 5 张进弃牌堆、状态不变量成立', () => {
    const G = withPlayer(withMaster(baseScene(), NEPTUNE), 'p1', { hand: [TIME_STORM] });
    const after = ok(G, 'p1', 'playTimeStorm', [TIME_STORM]);
    expect(after.deck.cards).toHaveLength(15);
    expect(after.removedFromGame).toEqual([TIME_STORM]);
    expect(checkStateInvariants(after)).toEqual([]);
  });

  it('解封成功（心锁 -1）：只触发一次风暴', () => {
    const G = soleUnlocker(setLock(withMaster(baseScene(), NEPTUNE), 2, 3));
    const after = ok(G, 'p1', 'playUnlock', [UNLOCK]);
    expect(after.layers[2]!.heartLockValue).toBe(2);
    expect(after.deck.cards).toHaveLength(25);
    expect(after.deck.discardPile).toHaveLength(6);
  });

  it('解封被抵消（心锁没变）：不触发', () => {
    // 窗口里有人可响应：玩家 p2 手里有解封并打出效果②
    let G = setLock(withMaster(baseScene(), NEPTUNE), 2, 3);
    G = withPlayer(G, 'p2', { hand: [UNLOCK] });
    const opened = ok(G, 'p1', 'playUnlock', [UNLOCK]);
    expect(opened.pendingUnlock).not.toBeNull();
    const cancelled = ok(opened, 'p2', 'respondCancelUnlock', []);
    expect(cancelled.layers[2]!.heartLockValue).toBe(3);
    // 两张解封进弃牌堆，牌库一张没动
    expect(cancelled.deck.cards).toHaveLength(30);
  });

  function sagittariusScene(lock: number): SetupState {
    let G = withMaster(baseScene(), NEPTUNE);
    G = withPlayer(G, 'p1', {
      characterId: c('thief_sagittarius'),
      skillUsedThisTurn: { [SAGITTARIUS_KILLS_THIS_TURN_KEY]: 1 },
    });
    return setLock(G, 2, lock);
  }

  it('射手·穿心增加心锁：不触发', () => {
    const after = ok(sagittariusScene(2), 'p1', 'useSagittariusHeartLock', [2, 1]);
    expect(after.layers[2]!.heartLockValue).toBe(3);
    expect(after.deck.cards).toHaveLength(30);
  });

  it('射手·穿心减少心锁：触发', () => {
    const after = ok(sagittariusScene(3), 'p1', 'useSagittariusHeartLock', [2, -1]);
    expect(after.layers[2]!.heartLockValue).toBe(2);
    expect(after.deck.cards).toHaveLength(25);
  });

  it('双子·命运一次减 2 个心锁：只弃 5 张', () => {
    let G = withMaster(baseScene(), NEPTUNE);
    G = withPlayer(G, 'p1', { characterId: c('thief_gemini') });
    G = { ...G, turnPhase: 'discard' };
    G = setLock(G, 2, 4);
    // 梦主在更深的层（第 3 层），双子在第 2 层，掷出 5 → 减 2
    const after = ok(G, 'p1', 'playGeminiSync', [], 5);
    expect(after.layers[2]!.heartLockValue).toBe(2);
    expect(after.deck.cards).toHaveLength(25);
  });

  it('梦魇回响恢复心锁：不触发', () => {
    let G = withMaster(baseScene(), NEPTUNE);
    G = setLock(G, 2, 1);
    G = {
      ...G,
      currentPlayerID: 'pM',
      layers: {
        ...G.layers,
        2: { ...G.layers[2]!, nightmareId: c('nightmare_echo'), nightmareRevealed: true },
      },
    };
    G = withBribes(G, []);
    const after = ok(G, 'pM', 'masterActivateNightmare', [2, { targetLayer: 2, action: 'add' }]);
    expect(after.layers[2]!.heartLockValue).toBe(2);
    expect(after.deck.cards).toHaveLength(30);
  });
});
