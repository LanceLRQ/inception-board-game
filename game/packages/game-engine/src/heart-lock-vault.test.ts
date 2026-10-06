// 技能把心锁减到 0：该层金库同样被打开，之后的结算与解封打开一致；技能减心锁算本回合的成功解锁。
// 全部经对局运行器驱动真实 move。
// 对照：docs/manual/03-game-flow.md 解锁 / 金库；docs/manual/05-dream-thieves.md 殉道者 / 双子 / 射手

import { describe, it, expect } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import { InceptionCityGame } from './game.js';
import type { SetupState } from './setup.js';
import { SAGITTARIUS_KILLS_THIS_TURN_KEY } from './engine/death.js';
import { createTestState, makeLayer, makePlayer, withBribes } from './testing/fixtures.js';
import {
  applyMove,
  matchFromSnapshot,
  type GameDef,
  type MatchState,
  type RandomSource,
} from './runner/matchRunner.js';

const game: GameDef<SetupState> = InceptionCityGame;

const c = (id: string) => id as CardID;
const KICK = c('action_kick');
const UNLOCK = c('action_unlock');

function fixedRandom(roll: number): RandomSource {
  return { D6: () => roll, Die: () => roll, Shuffle: (arr) => arr };
}

function load(G: SetupState): MatchState<SetupState> {
  return matchFromSnapshot<SetupState>({
    G,
    ctx: {
      numPlayers: G.playerOrder.length,
      playOrder: G.playerOrder,
      playOrderPos: G.playerOrder.indexOf(G.currentPlayerID),
      currentPlayer: G.currentPlayerID,
      phase: 'playing',
      turn: 1,
    },
    rngState: 1,
    stateID: 0,
  });
}

function place(G: SetupState, id: string, layer: number): SetupState {
  const layers = { ...G.layers };
  for (const k of Object.keys(layers)) {
    const l = layers[Number(k)]!;
    layers[Number(k)] = { ...l, playersInLayer: l.playersInLayer.filter((p) => p !== id) };
  }
  const target = layers[layer] ?? makeLayer(layer as Layer);
  layers[layer] = { ...target, playersInLayer: [...target.playersInLayer, id] };
  return {
    ...G,
    layers,
    players: { ...G.players, [id]: { ...G.players[id]!, currentLayer: layer as Layer } },
  };
}

function withLock(G: SetupState, layer: number, value: number): SetupState {
  return {
    ...G,
    layers: { ...G.layers, [layer]: { ...G.layers[layer]!, heartLockValue: value } },
  };
}

/** p1 是 characterId，位于 layer；该层心锁为 lock；牌库与一张待发的贿赂牌就位 */
function scene(
  characterId: string,
  turnPhase: SetupState['turnPhase'],
  layer: number,
  lock: number,
  hand: CardID[] = [],
): SetupState {
  let G = createTestState({
    phase: 'playing',
    turnPhase,
    turnNumber: 5,
    currentPlayerID: 'p1',
    dreamMasterID: 'pM',
    deck: { cards: Array<CardID>(30).fill(KICK), discardPile: [] },
  });
  G = withBribes(G, [{ id: 'b-0', kind: 'fail', status: 'inPool' }]);
  G = {
    ...G,
    players: {
      ...G.players,
      p1: makePlayer({
        id: 'p1',
        faction: 'thief',
        characterId: c(characterId),
        hand,
        // 射手·穿心要本回合击杀过玩家才能发动：场景里把这个前提给足
        skillUsedThisTurn:
          characterId === 'thief_sagittarius' ? { [SAGITTARIUS_KILLS_THIS_TURN_KEY]: 1 } : {},
      }),
    },
  };
  G = place(G, 'p1', layer);
  return withLock(G, layer, lock);
}

function run(G: SetupState, move: string, args: unknown[] = [], roll = 5, playerID = 'p1') {
  return applyMove(game, load(G), { playerID, move, args }, { random: fixedRandom(roll) });
}

function vaultOf(G: SetupState, layer: number) {
  return G.vaults.find((v) => v.layer === layer)!;
}

describe('技能把心锁减到 0 · 翻开金库', () => {
  it('殉道者·牺牲：心锁 2 → 0，该层金币金库打开，openedBy 是殉道者', () => {
    const res = run(scene('thief_martyr', 'action', 2, 2), 'playMartyrSacrifice', ['decrease']);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.G.layers[2]!.heartLockValue).toBe(0);
    expect(vaultOf(res.state.G, 2).isOpened).toBe(true);
    expect(vaultOf(res.state.G, 2).openedBy).toBe('p1');
  });

  it('双子·命运：心锁 2 → 0，该层金库打开，openedBy 是双子', () => {
    const G = place(scene('thief_gemini', 'discard', 2, 2), 'pM', 3);
    const res = run(G, 'playGeminiSync', [], 5);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.G.layers[2]!.heartLockValue).toBe(0);
    expect(vaultOf(res.state.G, 2).isOpened).toBe(true);
    expect(vaultOf(res.state.G, 2).openedBy).toBe('p1');
  });

  it('射手·穿心：心锁 1 → 0，该层金库打开，openedBy 是射手', () => {
    const res = run(scene('thief_sagittarius', 'action', 2, 1), 'useSagittariusHeartLock', [2, -1]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.G.layers[2]!.heartLockValue).toBe(0);
    expect(vaultOf(res.state.G, 2).isOpened).toBe(true);
    expect(vaultOf(res.state.G, 2).openedBy).toBe('p1');
  });

  it('翻开的是秘密金库：对局以盗梦者胜结束', () => {
    const res = run(scene('thief_sagittarius', 'action', 1, 1), 'useSagittariusHeartLock', [1, -1]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(vaultOf(res.state.G, 1).contentType).toBe('secret');
    expect(vaultOf(res.state.G, 1).isOpened).toBe(true);
    expect(res.state.ctx.gameover).toMatchObject({ winner: 'thief' });
  });

  it('翻开的是金币金库：开启者与解封打开时一样拿到 1 张贿赂牌', () => {
    // 解封打开作为对照
    let U = scene('thief_aries', 'action', 2, 1, [UNLOCK]);
    // 其余玩家都不在场：解封没有可响应者，当场结算
    U = {
      ...U,
      players: Object.fromEntries(
        Object.entries(U.players).map(([id, p]) => [
          id,
          id === 'p1' ? p : { ...p, isAlive: false },
        ]),
      ),
    };
    const byUnlock = run(U, 'playUnlock', [UNLOCK]);
    expect(byUnlock.ok).toBe(true);
    if (!byUnlock.ok) return;
    expect(vaultOf(byUnlock.state.G, 2).isOpened).toBe(true);
    expect(byUnlock.state.G.players.p1!.bribeReceived).toBe(1);

    const bySkill = run(
      scene('thief_sagittarius', 'action', 2, 1),
      'useSagittariusHeartLock',
      [2, -1],
    );
    expect(bySkill.ok).toBe(true);
    if (!bySkill.ok) return;
    expect(bySkill.state.G.players.p1!.bribeReceived).toBe(1);
    expect(bySkill.state.G.bribePool[0]!.heldBy).toBe('p1');
  });

  it('减到 0 之外的心锁变化不翻金库（增加、没减到 0）', () => {
    const inc = run(scene('thief_sagittarius', 'action', 2, 1), 'useSagittariusHeartLock', [2, 1]);
    expect(inc.ok).toBe(true);
    if (!inc.ok) return;
    expect(vaultOf(inc.state.G, 2).isOpened).toBe(false);
    const dec = run(scene('thief_sagittarius', 'action', 2, 3), 'useSagittariusHeartLock', [2, -1]);
    expect(dec.ok).toBe(true);
    if (!dec.ok) return;
    expect(vaultOf(dec.state.G, 2).isOpened).toBe(false);
  });

  it('技能不触发「解封成功」的被动：不计解封次数', () => {
    const res = run(scene('thief_sagittarius', 'action', 2, 1), 'useSagittariusHeartLock', [2, -1]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.G.players.p1!.successfulUnlocksThisTurn).toBe(0);
    expect(res.state.G.players.p1!.unlockCount).toBe(0);
  });

  it('心锁已归零的层，【解封】仍被拒绝', () => {
    const G = scene('thief_aries', 'action', 2, 0, [UNLOCK]);
    expect(run(G, 'playUnlock', [UNLOCK]).ok).toBe(false);
  });
});

describe('裁定 R-23 · 技能减心锁算本回合的成功解锁', () => {
  it('射手减少心锁之后，本回合不能再【解封】', () => {
    const G = scene('thief_sagittarius', 'action', 2, 3, [UNLOCK]);
    const reduced = run(G, 'useSagittariusHeartLock', [2, -1]);
    expect(reduced.ok).toBe(true);
    if (!reduced.ok) return;
    const unlock = applyMove(
      game,
      reduced.state,
      { playerID: 'p1', move: 'playUnlock', args: [UNLOCK] },
      { random: fixedRandom(5) },
    );
    expect(unlock.ok).toBe(false);
  });

  it('射手增加心锁不占用解锁次数：之后仍可【解封】', () => {
    const G = scene('thief_sagittarius', 'action', 2, 3, [UNLOCK]);
    const raised = run(G, 'useSagittariusHeartLock', [2, 1]);
    expect(raised.ok).toBe(true);
    if (!raised.ok) return;
    const unlock = applyMove(
      game,
      raised.state,
      { playerID: 'p1', move: 'playUnlock', args: [UNLOCK] },
      { random: fixedRandom(5) },
    );
    expect(unlock.ok).toBe(true);
  });

  it('本回合已成功解锁：射手不能再减少心锁，但可以增加', () => {
    const G = scene('thief_sagittarius', 'action', 2, 3);
    const unlocked = {
      ...G,
      players: { ...G.players, p1: { ...G.players.p1!, successfulUnlocksThisTurn: 1 } },
    };
    expect(run(unlocked, 'useSagittariusHeartLock', [2, -1]).ok).toBe(false);
    expect(run(unlocked, 'useSagittariusHeartLock', [2, 1]).ok).toBe(true);
  });

  it('本回合已成功解锁：殉道者不能选择减少心锁', () => {
    const G = scene('thief_martyr', 'action', 2, 3);
    const unlocked = {
      ...G,
      players: { ...G.players, p1: { ...G.players.p1!, successfulUnlocksThisTurn: 1 } },
    };
    expect(run(unlocked, 'playMartyrSacrifice', ['decrease']).ok).toBe(false);
    expect(run(unlocked, 'playMartyrSacrifice', ['increase']).ok).toBe(true);
  });

  it('本回合已成功解锁：双子·命运不能发动', () => {
    const G = place(scene('thief_gemini', 'discard', 2, 3), 'pM', 3);
    const unlocked = {
      ...G,
      players: { ...G.players, p1: { ...G.players.p1!, successfulUnlocksThisTurn: 1 } },
    };
    expect(run(unlocked, 'playGeminiSync', [], 5).ok).toBe(false);
  });

  it('殉道者掷骰失败、心锁没有减少：不占用解锁次数', () => {
    const res = run(scene('thief_martyr', 'action', 2, 3), 'playMartyrSacrifice', ['decrease'], 1);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.G.layers[2]!.heartLockValue).toBe(3);
    const p = res.state.G.players.p1!;
    expect(
      (p.skillUsedThisTurn['heartLockReducedBySkill'] ?? 0) + p.successfulUnlocksThisTurn,
    ).toBe(0);
  });
});
