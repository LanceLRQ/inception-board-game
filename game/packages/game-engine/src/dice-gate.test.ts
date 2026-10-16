// 掷骰闸门：玩家掷的骰子在被点名的人报到之前不存在，全员报到后才由引擎掷出并续接结算
// 对照：docs/manual/04-action-cards.md SHOOT；docs/manual/06-dream-master.md 港口、冥王星；docs/manual/07-nightmare-cards.md 深空坠落

import { describe, expect, it } from 'vitest';
import { checkInvariants } from './invariants.js';
import { checkStateInvariants } from './engine/stateInvariants.js';
import { denyAction } from './engine/actionRights.js';
import { viewFor } from './engine/matchView.js';
import { recordingRandom } from './moves/diceGate.js';
import { applyMove, type MatchState, type RandomSource } from './runner/matchRunner.js';
import type { SetupState } from './setup.js';
import { KICK, SHOOT, c, game, load, scene, withPlayer } from './testing/runnerHarness.js';

function queued(...rolls: number[]): RandomSource & { calls: () => number } {
  let n = 0;
  return {
    D6: () => {
      n++;
      return rolls.shift() ?? 6;
    },
    Die: () => 1,
    Shuffle: (arr) => arr,
    calls: () => n,
  };
}

function step(
  m: MatchState<SetupState>,
  playerID: string,
  move: string,
  args: unknown[] = [],
  random: RandomSource = queued(),
): MatchState<SetupState> {
  const res = applyMove(game, m, { playerID, move, args }, { random });
  if (!res.ok) throw new Error(`${move} by ${playerID} 被拒绝：${res.reason}`);
  expect(checkStateInvariants(res.state.G)).toEqual([]);
  expect(checkInvariants(res.state.G)).toEqual([]);
  return res.state;
}

function rejected(m: MatchState<SetupState>, playerID: string, move: string): boolean {
  return !applyMove(game, m, { playerID, move, args: [] }, { random: queued() }).ok;
}

/** p1（回合主人）与 p2 同在第 1 层，p1 手里有 SHOOT */
function shootScene(): SetupState {
  return scene(
    {
      p1: { layer: 1, hand: [SHOOT] },
      p2: { layer: 1, hand: [] },
      p3: { layer: 2, hand: [] },
      p4: { layer: 2, hand: [] },
      pM: { layer: 3, hand: [] },
    },
    { currentPlayerID: 'p1' },
  );
}

describe('SHOOT 的掷骰闸门', () => {
  it('出牌只开闸门：点名目标，还没有点数，牌留在手里等结算', () => {
    const random = queued(1);
    const m = step(load(shootScene()), 'p1', 'playShoot', ['p2', SHOOT], random);
    expect(random.calls()).toBe(0);
    expect(m.G.pendingDiceRoll).toMatchObject({
      id: 1,
      purpose: 'shoot',
      by: 'p1',
      target: 'p2',
      rollers: ['p2'],
      rolled: [],
    });
    expect(m.G.players.p2!.isAlive).toBe(true);
    expect(m.G.players.p1!.hand).toEqual([SHOOT]);
    expect(m.G.lastDiceRoll).toBeNull();
  });

  it('只有被点名的目标能掷；闸门开着时谁都不能做别的事', () => {
    const m = step(load(shootScene()), 'p1', 'playShoot', ['p2', SHOOT]);
    expect(rejected(m, 'p1', 'rollDice')).toBe(true);
    expect(rejected(m, 'p3', 'rollDice')).toBe(true);
    expect(denyAction(m.G, 'p1', 'endActionPhase')).toBe('awaiting_other');
    expect(denyAction(m.G, 'p2', 'rollDice')).toBeNull();
  });

  it('目标掷骰后结算：掷 1 击杀，牌进弃牌堆，点数记进 lastDiceRoll', () => {
    const opened = step(load(shootScene()), 'p1', 'playShoot', ['p2', SHOOT]);
    const m = step(opened, 'p2', 'rollDice', [], queued(1));
    expect(m.G.pendingDiceRoll).toBeNull();
    expect(m.G.players.p2!.isAlive).toBe(false);
    expect(m.G.players.p1!.hand).toEqual([]);
    expect(m.G.deck.discardPile).toContain(SHOOT);
    expect(m.G.lastShootRoll).toBe(1);
    expect(m.G.lastDiceRoll).toEqual({
      id: 1,
      purpose: 'shoot',
      by: 'p1',
      target: 'p2',
      rolls: [{ player: 'p2', dice: [1] }],
    });
  });

  it('天蝎·毒针的第二颗随同一次掷出，记在射手名下', () => {
    const G = withPlayer(shootScene(), 'p1', { characterId: c('thief_scorpius') });
    const opened = step(load(G), 'p1', 'playShoot', ['p2', SHOOT]);
    const m = step(opened, 'p2', 'rollDice', [], queued(5, 2));
    expect(m.G.lastDiceRoll!.rolls).toEqual([
      { player: 'p2', dice: [5] },
      { player: 'p1', dice: [2] },
    ]);
  });

  it('掷完前目标已不在场：不再结算，不会把人从迷失层挪走', () => {
    const opened = step(load(shootScene()), 'p1', 'playShoot', ['p2', SHOOT]);
    const p2 = { ...opened.G.players.p2!, isAlive: false, currentLayer: 0 as const, deathTurn: 5 };
    const layers = {
      ...opened.G.layers,
      0: { ...opened.G.layers[0]!, playersInLayer: ['p2'] },
      1: { ...opened.G.layers[1]!, playersInLayer: ['p1'] },
    };
    const G = { ...opened.G, players: { ...opened.G.players, p2 }, layers };
    const m = step({ ...opened, G }, 'p2', 'rollDice', [], queued(3));
    expect(m.G.players.p2!.currentLayer).toBe(0);
    expect(m.G.pendingDiceRoll).toBeNull();
  });

  it('下一次掷骰的编号接着上一次', () => {
    const G = { ...shootScene(), players: { ...shootScene().players } };
    G.players.p1 = { ...G.players.p1!, hand: [SHOOT, SHOOT] };
    let m = step(load(G), 'p1', 'playShoot', ['p2', SHOOT]);
    m = step(m, 'p2', 'rollDice', [], queued(6));
    m = step(m, 'p1', 'playShoot', ['p2', SHOOT]);
    expect(m.G.pendingDiceRoll!.id).toBe(2);
  });
});

describe('视图只公开闸门的名单，不公开续接参数', () => {
  it('金星·镜界复制 SHOOT：要弃的两张牌在掷完之前不进任何人的视图', () => {
    const G = scene(
      {
        pM: { layer: 1, hand: [c('action_unlock'), c('action_dream_transit')] },
        p1: { layer: 1, hand: [] },
        p2: { layer: 2, hand: [] },
        p3: { layer: 2, hand: [] },
        p4: { layer: 2, hand: [] },
      },
      { playedCardsThisTurn: [SHOOT] },
    );
    const venus = withPlayer(G, 'pM', { characterId: c('dm_venus_mirror') });
    const m = step(load(venus), 'pM', 'useVenusMirrorWorld', [
      'p1',
      [c('action_unlock'), c('action_dream_transit')],
    ]);
    expect(m.G.pendingDiceRoll?.purpose).toBe('venusMirror');
    const view = viewFor(m.G, 'p1', { gameOver: false });
    expect(view.pendingDiceRoll).toEqual({
      id: 1,
      purpose: 'venusMirror',
      by: 'pM',
      target: 'p1',
      rollers: ['p1'],
      rolled: [],
    });
    expect(JSON.stringify(view)).not.toContain('action_dream_transit');
  });

  it('金星·镜界复制 KICK 不掷骰，直接生效', () => {
    const G = scene(
      {
        pM: { layer: 1, hand: [KICK, KICK] },
        p1: { layer: 3, hand: [] },
        p2: { layer: 2, hand: [] },
        p3: { layer: 2, hand: [] },
        p4: { layer: 2, hand: [] },
      },
      { playedCardsThisTurn: [KICK] },
    );
    const venus = withPlayer(G, 'pM', { characterId: c('dm_venus_mirror') });
    const m = step(load(venus), 'pM', 'useVenusMirrorWorld', ['p1', [KICK, KICK]]);
    expect(m.G.pendingDiceRoll).toBeNull();
    expect(m.G.players.pM!.currentLayer).toBe(3);
  });
});

describe('多人掷骰：深空坠落', () => {
  function spaceFallScene(): SetupState {
    const base = scene({
      pM: { layer: 1, hand: [] },
      p1: { layer: 2, hand: [] },
      p2: { layer: 2, hand: [] },
      p3: { layer: 4, hand: [] },
      p4: { layer: 4, hand: [] },
    });
    return {
      ...base,
      layers: {
        ...base.layers,
        2: { ...base.layers[2]!, nightmareId: c('nightmare_space_fall'), nightmareRevealed: true },
      },
    };
  }

  it('该层盗梦者各自掷，不限先后；没掷齐之前谁都还没动', () => {
    let m = step(load(spaceFallScene()), 'pM', 'masterActivateNightmare', [2, {}]);
    expect(m.G.pendingDiceRoll).toMatchObject({ purpose: 'spaceFall', rollers: ['p1', 'p2'] });
    m = step(m, 'p2', 'rollDice');
    expect(m.G.pendingDiceRoll!.rolled).toEqual(['p2']);
    expect(rejected(m, 'p2', 'rollDice')).toBe(true);
    expect(m.G.players.p1!.currentLayer).toBe(2);
    m = step(m, 'p1', 'rollDice', [], queued(5, 3));
    expect(m.G.pendingDiceRoll).toBeNull();
    expect(m.G.players.p1!.isAlive).toBe(false);
    expect(m.G.players.p2!.currentLayer).toBe(3);
    expect(m.G.lastDiceRoll!.rolls).toEqual([
      { player: 'p1', dice: [5] },
      { player: 'p2', dice: [3] },
    ]);
  });

  it('掷完时已不在场的人不再结算（不会被从迷失层挪走）', () => {
    let m = step(load(spaceFallScene()), 'pM', 'masterActivateNightmare', [2, {}]);
    // 直接改状态模拟「掷完前 p1 已进迷失层」
    const p1 = { ...m.G.players.p1!, isAlive: false, currentLayer: 0 as const, deathTurn: 5 };
    const layers = {
      ...m.G.layers,
      0: { ...m.G.layers[0]!, playersInLayer: ['p1'] },
      2: { ...m.G.layers[2]!, playersInLayer: ['p2'] },
    };
    m = { ...m, G: { ...m.G, players: { ...m.G.players, p1 }, layers } };
    m = step(m, 'p1', 'rollDice');
    m = step(m, 'p2', 'rollDice', [], queued(3));
    expect(m.G.players.p1!.currentLayer).toBe(0);
    expect(m.G.players.p2!.currentLayer).toBe(3);
    expect(m.G.lastDiceRoll!.rolls).toEqual([{ player: 'p2', dice: [3] }]);
  });
});

describe('续接里再开闸门：殉道者 → 港口·海啸', () => {
  it('殉道者掷完把心锁减到 0、金库打开，接着开海啸的闸门', () => {
    // 第 2 层是金币金库（第 1 层的秘密金库打开即盗梦者获胜，不再有海啸）
    const base = scene({
      pM: { layer: 3, hand: [] },
      p1: { layer: 2, hand: [KICK] },
      p2: { layer: 1, hand: [] },
      p3: { layer: 4, hand: [] },
      p4: { layer: 4, hand: [] },
    });
    let G = withPlayer(base, 'p1', { characterId: c('thief_martyr') });
    G = withPlayer(G, 'pM', { characterId: c('dm_harbor') });
    G = {
      ...G,
      currentPlayerID: 'p1',
      layers: { ...G.layers, 2: { ...G.layers[2]!, heartLockValue: 2 } },
    };
    let m = step(load(G), 'p1', 'playMartyrSacrifice', ['decrease']);
    expect(m.G.pendingDiceRoll).toMatchObject({ purpose: 'martyr', rollers: ['p1'] });
    expect(m.G.turnPhase).toBe('action');
    m = step(m, 'p1', 'rollDice', [], queued(4));
    expect(m.G.layers[2]!.heartLockValue).toBe(0);
    expect(m.G.turnPhase).toBe('discard');
    // 殉道者自己进了迷失层，海啸只点名还活着的盗梦者
    expect(m.G.pendingDiceRoll).toMatchObject({
      id: 2,
      purpose: 'tsunami',
      rollers: ['p2', 'p3', 'p4'],
    });
    m = step(m, 'p2', 'rollDice');
    m = step(m, 'p3', 'rollDice');
    m = step(m, 'p4', 'rollDice', [], queued(6, 1, 6));
    expect(m.G.pendingDiceRoll).toBeNull();
    expect(m.G.players.p2!.isAlive).toBe(true);
    expect(m.G.players.p3!.isAlive).toBe(false);
    expect(m.G.lastDiceRoll!.rolls).toEqual([
      { player: 'p2', dice: [6] },
      { player: 'p3', dice: [1] },
      { player: 'p4', dice: [6] },
    ]);
  });
});

describe('本人掷：冥王星·地狱的抽牌', () => {
  it('抽牌时先开闸门，掷完按点数抽牌并结束抽牌阶段', () => {
    let G = scene({
      pM: { layer: 3, hand: [] },
      p1: { layer: 1, hand: [] },
      p2: { layer: 2, hand: [] },
      p3: { layer: 2, hand: [] },
      p4: { layer: 2, hand: [] },
    });
    G = withPlayer(G, 'pM', { characterId: c('dm_pluto_hell') });
    G = { ...G, currentPlayerID: 'p1', turnPhase: 'draw' };
    let m = step(load(G), 'p1', 'doDraw', []);
    expect(m.G.pendingDiceRoll).toMatchObject({ purpose: 'pluto', rollers: ['p1'] });
    expect(m.G.players.p1!.hand).toHaveLength(0);
    m = step(m, 'p1', 'rollDice', [], queued(5));
    expect(m.G.players.p1!.hand).toHaveLength(5);
    expect(m.G.turnPhase).toBe('action');
  });
});

describe('recordingRandom', () => {
  it('按归属函数把每颗 D6 记到对应的人名下，其余随机透传', () => {
    const rec = recordingRandom(queued(2, 3, 4), (i) => (i === 0 ? 'a' : 'b'));
    expect([rec.random.D6(), rec.random.D6(), rec.random.D6()]).toEqual([2, 3, 4]);
    expect(rec.random.Shuffle([1, 2])).toEqual([1, 2]);
    expect(rec.rolls()).toEqual([
      { player: 'a', dice: [2] },
      { player: 'b', dice: [3, 4] },
    ]);
  });
});
