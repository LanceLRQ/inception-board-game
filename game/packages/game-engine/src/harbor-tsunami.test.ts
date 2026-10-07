// 港口·海啸接线：任一金库被打开、游戏没有结束时，所有盗梦者各掷一次骰子，结果 1-5 死亡。
// 对照：docs/manual/06-dream-master.md 港口（141-151 行）：
//   「所有盗梦者必须按游戏顺序各掷一次骰子，点数为 1-5 直接死亡，6 则无事发生」
//   「不能视为被梦主击杀……没有凶手与被害者，不用给予手牌」
// 经真实 move 驱动；骰值按调用顺序消费，每名存活盗梦者一颗。

import { describe, it, expect } from 'vitest';
import type { CardID } from '@icgame/shared';
import { SAGITTARIUS_KILLS_THIS_TURN_KEY } from './engine/death.js';
import { harborTsunamiTargets, applyHarborTsunami } from './engine/skills.js';
import { checkStateInvariants } from './engine/stateInvariants.js';
import type { SetupState } from './setup.js';
import { applyMove, type RandomSource } from './runner/matchRunner.js';
import { settleVaultOpened } from './moves/settlement.js';
import { withBribes } from './testing/fixtures.js';
import { c, game, KICK, load, scene, UNLOCK, withPlayer } from './testing/runnerHarness.js';

const HARBOR = c('dm_harbor');
const FORTRESS = c('dm_fortress');
const SHOOT_HAND: CardID[] = [KICK, KICK];

/** 按顺序给出骰值的随机源；记录一共被掷了几次 */
function queuedRandom(rolls: number[]): RandomSource & { calls: () => number } {
  const queue = [...rolls];
  let n = 0;
  return {
    D6: () => {
      n += 1;
      return queue.shift() ?? 6;
    },
    Die: () => queue.shift() ?? 1,
    Shuffle: (arr) => arr,
    calls: () => n,
  };
}

/** p1 在第 2 层、该层心锁 1、手里有解封；p2-p4 在第 1 层；梦主在第 3 层 */
function unlockScene(masterChar: CardID = HARBOR, extra: Partial<SetupState> = {}): SetupState {
  let G = scene(
    {
      p1: { layer: 2, hand: [UNLOCK] },
      p2: { layer: 1, hand: SHOOT_HAND },
      p3: { layer: 1, hand: SHOOT_HAND },
      p4: { layer: 1, hand: SHOOT_HAND },
      pM: { layer: 3, hand: SHOOT_HAND },
    },
    { currentPlayerID: 'p1', turnPhase: 'action', ...extra },
  );
  G = withPlayer(G, 'pM', { characterId: masterChar });
  return {
    ...G,
    layers: { ...G.layers, 2: { ...G.layers[2]!, heartLockValue: 1 } },
  };
}

/** 把秘密换到第 2 层（第 1 层改放金币），其余金库保持金币 */
function secretOnLayer2(G: SetupState): SetupState {
  return {
    ...G,
    vaults: G.vaults.map((v) => ({
      ...v,
      contentType: v.layer === 2 ? ('secret' as const) : ('coin' as const),
    })),
  };
}

function openVault(G: SetupState, layer: number): SetupState {
  return {
    ...G,
    vaults: G.vaults.map((v) => (v.layer === layer ? { ...v, isOpened: true, openedBy: 'p2' } : v)),
  };
}

/** 打出解封，其余玩家依次放弃响应，直到解封结算 */
function unlockThroughWindow(G: SetupState, random: RandomSource) {
  let res = applyMove(
    game,
    load(G),
    { playerID: 'p1', move: 'playUnlock', args: [UNLOCK] },
    { random },
  );
  if (!res.ok) throw new Error(`playUnlock 被拒绝：${res.reason}`);
  let m = res.state;
  const events = [...res.events];
  while (m.G.pendingResponseWindow) {
    const w = m.G.pendingResponseWindow;
    const next = w.responders.find((id) => !w.responded.includes(id))!;
    res = applyMove(game, m, { playerID: next, move: 'passResponse', args: [] }, { random });
    if (!res.ok) throw new Error(`passResponse 被拒绝：${res.reason}`);
    m = res.state;
    events.push(...res.events);
  }
  return { G: m.G, events };
}

const aliveOf = (G: SetupState) => ['p1', 'p2', 'p3', 'p4'].filter((id) => G.players[id]!.isAlive);

describe('港口·海啸 · 金库被打开后', () => {
  it('按座位顺序每名存活盗梦者各掷一颗，1-5 死亡、6 躲过', () => {
    const random = queuedRandom([6, 1, 5, 6]);
    const { G } = unlockThroughWindow(unlockScene(), random);
    expect(G.vaults.find((v) => v.layer === 2)!.isOpened).toBe(true);
    expect(random.calls()).toBe(4);
    // p1:6 躲过；p2:1 死；p3:5 死；p4:6 躲过
    expect(aliveOf(G)).toEqual(['p1', 'p4']);
    expect(checkStateInvariants(G)).toEqual([]);
  });

  it('全是 6：无人死亡', () => {
    const random = queuedRandom([6, 6, 6, 6]);
    const { G } = unlockThroughWindow(unlockScene(), random);
    expect(aliveOf(G)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('全是 1：所有盗梦者死亡（含打开金库的人），梦主不受影响', () => {
    const random = queuedRandom([1, 1, 1, 1]);
    const { G } = unlockThroughWindow(unlockScene(), random);
    expect(aliveOf(G)).toEqual([]);
    expect(G.players.pM!.isAlive).toBe(true);
  });

  it('死亡不是击杀：进迷失层、手牌留在原处、梦主没有收到牌', () => {
    const random = queuedRandom([6, 3, 6, 6]);
    const before = unlockScene();
    const { G } = unlockThroughWindow(before, random);
    const p2 = G.players.p2!;
    expect(p2.isAlive).toBe(false);
    expect(p2.currentLayer).toBe(0);
    expect(p2.hand).toEqual(SHOOT_HAND);
    expect(G.players.pM!.hand).toEqual(SHOOT_HAND);
    expect(G.players.pM!.shootCount).toBe(before.players.pM!.shootCount);
  });

  it('已经死亡的盗梦者不掷骰', () => {
    let G = unlockScene();
    G = withPlayer(G, 'p3', { isAlive: false, currentLayer: 0 });
    const random = queuedRandom([6, 1, 6]);
    const res = unlockThroughWindow(G, random);
    expect(random.calls()).toBe(3);
    // 三颗骰：p1 6、p2 1、p4 6
    expect(res.G.players.p2!.isAlive).toBe(false);
    expect(res.G.players.p4!.isAlive).toBe(true);
  });

  it('已被贿赂转阵营但身份未公开的背叛者也要掷骰', () => {
    let G = unlockScene();
    G = withPlayer(G, 'p2', { faction: 'master', bribeReceived: 1 });
    const random = queuedRandom([6, 2, 6, 6]);
    const { G: after } = unlockThroughWindow(G, random);
    expect(random.calls()).toBe(4);
    expect(after.players.p2!.isAlive).toBe(false);
  });

  it('梦主不是港口：不掷骰、无人死亡', () => {
    const random = queuedRandom([1, 1, 1, 1]);
    const { G } = unlockThroughWindow(unlockScene(FORTRESS), random);
    expect(random.calls()).toBe(0);
    expect(aliveOf(G)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('没有金库被打开（解封被抵消 / 心锁没减到 0）：不触发', () => {
    let G = unlockScene();
    G = { ...G, layers: { ...G.layers, 2: { ...G.layers[2]!, heartLockValue: 3 } } };
    const random = queuedRandom([1, 1, 1, 1]);
    const { G: after } = unlockThroughWindow(G, random);
    expect(random.calls()).toBe(0);
    expect(aliveOf(after)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
});

describe('港口·海啸 · 游戏已经结束时不结算', () => {
  it('打开的是秘密金库：盗梦者胜，不掷骰', () => {
    const G = secretOnLayer2(unlockScene());
    const random = queuedRandom([1, 1, 1, 1]);
    const { G: after } = unlockThroughWindow(G, random);
    expect(after.vaults.find((v) => v.layer === 2)!.contentType).toBe('secret');
    expect(random.calls()).toBe(0);
    expect(aliveOf(after)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('第二个金库打开仍没有秘密（港口世界观梦主胜）：不掷骰', () => {
    const G = openVault(unlockScene(), 3);
    const random = queuedRandom([1, 1, 1, 1]);
    const { G: after } = unlockThroughWindow(G, random);
    expect(after.vaults.filter((v) => v.isOpened)).toHaveLength(2);
    expect(random.calls()).toBe(0);
    expect(aliveOf(after)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('牌库已空：梦主按牌库耗尽获胜，不掷骰', () => {
    const before = {
      ...unlockScene(),
      deck: { cards: [] as CardID[], discardPile: [] as CardID[] },
    };
    const after = openVault(before, 2);
    const random = queuedRandom([1, 1, 1, 1]);
    const settled = settleVaultOpened(before, after, random);
    expect(random.calls()).toBe(0);
    expect(aliveOf(settled)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
});

describe('港口·海啸 · 其他能翻开金库的路径', () => {
  it('射手·穿心把心锁减到 0：同样触发', () => {
    let G = unlockScene();
    G = withPlayer(G, 'p1', {
      characterId: c('thief_sagittarius'),
      skillUsedThisTurn: { [SAGITTARIUS_KILLS_THIS_TURN_KEY]: 1 },
    });
    const random = queuedRandom([6, 1, 6, 6]);
    const res = applyMove(
      game,
      load(G),
      { playerID: 'p1', move: 'useSagittariusHeartLock', args: [2, -1] },
      { random },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(random.calls()).toBe(4);
    expect(res.state.G.players.p2!.isAlive).toBe(false);
    expect(res.state.G.players.p1!.isAlive).toBe(true);
  });

  it('双子·命运把心锁减到 0：同样触发', () => {
    let G = unlockScene();
    G = withPlayer(G, 'p1', { characterId: c('thief_gemini') });
    G = {
      ...G,
      turnPhase: 'discard',
      layers: { ...G.layers, 2: { ...G.layers[2]!, heartLockValue: 2 } },
    };
    // 第一颗是双子自己的骰（5 → 减 2 个心锁），其后四颗是海啸
    const random = queuedRandom([5, 6, 1, 6, 6]);
    const res = applyMove(
      game,
      load(G),
      { playerID: 'p1', move: 'playGeminiSync', args: [] },
      { random },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.G.vaults.find((v) => v.layer === 2)!.isOpened).toBe(true);
    expect(random.calls()).toBe(5);
    expect(res.state.G.players.p2!.isAlive).toBe(false);
  });
});

describe('港口·海啸 · 与梦主三选一的先后', () => {
  it('海啸先结算，随后仍挂起三选一；打开者已死亡也能收到贿赂牌', () => {
    let G = withBribes(unlockScene(), [{ id: 'bribe-0', kind: 'fail', status: 'inPool' }]);
    // 打开者 p1 掷出 1，被海啸带走
    const random = queuedRandom([1, 6, 6, 6]);
    const { G: after } = unlockThroughWindow(G, random);
    expect(after.players.p1!.isAlive).toBe(false);
    expect(after.pendingVaultDecision).toEqual({ layer: 2, openerID: 'p1' });
    G = { ...after, currentPlayerID: 'pM' };
    const res = applyMove(
      game,
      load(G),
      { playerID: 'pM', move: 'masterVaultDecision', args: ['bribe'] },
      { random: queuedRandom([]) },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.G.players.p1!.bribeReceived).toBe(1);
  });
});

describe('港口·海啸 · 事件', () => {
  it('死亡事件没有凶手（cause 为 null）', () => {
    const random = queuedRandom([6, 1, 6, 6]);
    const { events } = unlockThroughWindow(unlockScene(), random);
    const died = events.filter((e) => e.kind === 'player_died');
    expect(died).toHaveLength(1);
    expect(died[0]!.data).toMatchObject({ player: 'p2', cause: null });
  });
});

describe('港口·海啸 · 纯函数', () => {
  it('harborTsunamiTargets：按座位顺序、只含存活盗梦者；非港口为空', () => {
    const G = withPlayer(unlockScene(), 'p3', { isAlive: false });
    expect(harborTsunamiTargets(G)).toEqual(['p1', 'p2', 'p4']);
    expect(harborTsunamiTargets(unlockScene(FORTRESS))).toEqual([]);
  });

  it('applyHarborTsunami：骰值不足时按 6 处理（躲过）', () => {
    const G = unlockScene();
    const next = applyHarborTsunami(G, [1]);
    expect(aliveOf(next)).toEqual(['p2', 'p3', 'p4']);
  });
});
