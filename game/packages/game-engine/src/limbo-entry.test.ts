// 进入迷失层：击杀与非击杀两种来源都以「已死亡」收口，之后都能被复活；只有击杀才交手牌。
// 全部经对局运行器驱动真实 move。
// 对照：docs/manual/03-game-flow.md 死亡 / 迷失层 / 复活；docs/manual/07-nightmare-cards.md；
//       docs/manual/06-dream-master.md 冥王星·地狱 / 密道

import { describe, it, expect } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import { InceptionCityGame } from './game.js';
import type { SetupState } from './setup.js';
import { createTestState, makeLayer } from './testing/fixtures.js';
import { checkStateInvariants } from './engine/stateInvariants.js';
import { makeTestRng, pickLegalMove } from './runner/moveFuzzer.js';
import {
  applyMove,
  createMatch,
  matchFromSnapshot,
  type GameDef,
  type MatchState,
  type RandomSource,
} from './runner/matchRunner.js';

const game: GameDef<SetupState> = InceptionCityGame;

const c = (id: string) => id as CardID;
const KICK = c('action_kick');
const UNLOCK = c('action_unlock');
const SHOOT = c('action_shoot');
const KING = c('action_shoot_assassin');
const TRANSIT = c('action_dream_transit');
const TURN = 5;

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

interface Placement {
  layer: number;
  hand: CardID[];
}

/** 按摆放表建局：层内名单与玩家所在层保持一致，梦魇放在第 2 层并已翻开 */
function scene(
  placements: Record<string, Placement>,
  extra: Partial<SetupState> & { nightmareId?: string } = {},
): SetupState {
  const { nightmareId, ...rest } = extra;
  const base = createTestState({
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: TURN,
    currentPlayerID: 'pM',
    dreamMasterID: 'pM',
    deck: { cards: Array<CardID>(30).fill(KICK), discardPile: [] },
  });
  const players = { ...base.players };
  const layers = {
    1: makeLayer(1 as Layer, { heartLockValue: 3 }),
    2: makeLayer(2 as Layer, {
      heartLockValue: 3,
      nightmareId: nightmareId ? c(nightmareId) : null,
      nightmareRevealed: nightmareId !== undefined,
    }),
    3: makeLayer(3 as Layer),
    4: makeLayer(4 as Layer),
  };
  for (const [id, place] of Object.entries(placements)) {
    players[id] = {
      ...players[id]!,
      currentLayer: place.layer as Layer,
      hand: place.hand,
    };
    layers[place.layer as 1 | 2 | 3 | 4].playersInLayer.push(id);
  }
  return { ...base, players, layers, ...rest };
}

/** 梦魇场景：p1 p2 在第 2 层，p3 在第 1 层，p4 在第 3 层，梦主在第 1 层 */
function nightmareScene(nightmareId: string): SetupState {
  return scene(
    {
      p1: { layer: 2, hand: [KICK, KICK] },
      p2: { layer: 2, hand: [KICK, UNLOCK] },
      p3: { layer: 1, hand: [UNLOCK, KICK, KICK] },
      p4: { layer: 3, hand: [KICK] },
      pM: { layer: 1, hand: [KICK] },
    },
    { nightmareId },
  );
}

function activate(G: SetupState, roll = 5): SetupState {
  const res = applyMove(
    game,
    load(G),
    { playerID: 'pM', move: 'masterActivateNightmare', args: [2, { bribedTargets: [] }] },
    { random: fixedRandom(roll) },
  );
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error('masterActivateNightmare 被拒绝');
  return res.state.G;
}

function asTurn(G: SetupState, playerID: string, turnPhase: SetupState['turnPhase'] = 'action') {
  return { ...G, currentPlayerID: playerID, turnPhase, turnNumber: TURN + 1 };
}

function expectLimbo(G: SetupState, id: string, hand: CardID[]) {
  const p = G.players[id]!;
  expect(p.isAlive).toBe(false);
  expect(p.deathTurn).toBe(TURN);
  expect(p.currentLayer).toBe(0);
  expect(p.hand).toEqual(hand);
  expect(G.layers[0]?.playersInLayer).toContain(id);
  for (const l of [1, 2, 3, 4]) expect(G.layers[l]!.playersInLayer).not.toContain(id);
}

const NIGHTMARES: Array<{ id: string; roll: number; victims: Record<string, CardID[]> }> = [
  // 深空坠落：掷 5 / 6 或等于当前层数 → 迷失层
  { id: 'nightmare_space_fall', roll: 5, victims: { p1: [KICK, KICK], p2: [KICK, UNLOCK] } },
  // 致命漩涡：当层玩家进迷失层，保留手牌
  { id: 'nightmare_vortex', roll: 3, victims: { p1: [KICK, KICK], p2: [KICK, UNLOCK] } },
  // 邪念瘟疫：当层盗梦者未派到贿赂的进迷失层
  { id: 'nightmare_plague', roll: 3, victims: { p1: [KICK, KICK], p2: [KICK, UNLOCK] } },
  // 饥饿撕咬：不足 3 张手牌的进迷失层，保留手牌
  { id: 'nightmare_hunger_bite', roll: 3, victims: { p1: [KICK, KICK], p2: [KICK, UNLOCK] } },
];

describe.each(NIGHTMARES)('梦魇 $id 送进迷失层', ({ id, roll, victims }) => {
  it('受害者被标记为已死亡，不交手牌', () => {
    const G = activate(nightmareScene(id), roll);
    for (const [pid, hand] of Object.entries(victims)) expectLimbo(G, pid, hand);
    // 没人拿到牌：击杀计数不动，其余玩家仍活着
    expect(G.players.p3!.isAlive).toBe(true);
    for (const pid of G.playerOrder) expect(G.players[pid]!.shootCount).toBe(0);
  });

  it('自己回合可以复活自己', () => {
    const G = asTurn(activate(nightmareScene(id), roll), 'p1');
    const res = applyMove(game, load(G), {
      playerID: 'p1',
      move: 'playRevive',
      args: [null, [KICK, KICK]],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const p = res.state.G.players.p1!;
    expect(p.isAlive).toBe(true);
    expect(p.deathTurn).toBeNull();
    expect(p.currentLayer).toBe(1);
    expect(res.state.G.layers[0]?.playersInLayer ?? []).not.toContain('p1');
  });

  it('同伴可以复活他人，被复活者出现在同伴所在层', () => {
    const after = activate(nightmareScene(id), roll);
    // 致命漩涡会把其他层的人拖到当层并弃光手牌，所以复活者的手牌与所在层在这里重新指定
    const reviverLayer = after.players.p3!.currentLayer;
    const G = asTurn(
      {
        ...after,
        players: { ...after.players, p3: { ...after.players.p3!, hand: [KICK, KICK] } },
      },
      'p3',
    );
    const res = applyMove(game, load(G), {
      playerID: 'p3',
      move: 'playRevive',
      args: ['p1', [KICK, KICK]],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const p = res.state.G.players.p1!;
    expect(p.isAlive).toBe(true);
    expect(p.currentLayer).toBe(reviverLayer);
    expect(res.state.G.layers[reviverLayer]!.playersInLayer).toContain('p1');
  });
});

describe('迷失层里的人不再被当作活人', () => {
  it('不出现在【解封】响应窗口的响应者名单里', () => {
    const after = activate(nightmareScene('nightmare_vortex'), 3);
    // 致命漩涡会把其他层的人拖到当层并弃光手牌，p3 的手牌这里重新指定
    const G = asTurn(
      { ...after, players: { ...after.players, p3: { ...after.players.p3!, hand: [UNLOCK] } } },
      'p3',
    );
    const res = applyMove(game, load(G), { playerID: 'p3', move: 'playUnlock', args: [UNLOCK] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const responders = res.state.G.pendingResponseWindow?.responders ?? [];
    expect(responders).not.toContain('p1');
    expect(responders).not.toContain('p2');
    expect(responders).toEqual(expect.arrayContaining(['p4', 'pM']));
  });

  it('不能被选为 SHOOT 目标（刺客之王不限层）', () => {
    const base = activate(nightmareScene('nightmare_vortex'), 3);
    const G: SetupState = {
      ...asTurn(base, 'p3'),
      players: { ...base.players, p3: { ...base.players.p3!, hand: [KING] } },
    };
    const res = applyMove(
      game,
      load(G),
      { playerID: 'p3', move: 'playShootKing', args: ['p1', KING] },
      { random: fixedRandom(1) },
    );
    expect(res.ok).toBe(false);
  });
});

describe('冥王星·地狱世界观', () => {
  it('回合结束时手牌不少于 6 张，进迷失层且视为已死亡，之后可复活', () => {
    const hand6 = Array<CardID>(6).fill(KICK);
    const base = scene({
      p1: { layer: 1, hand: hand6 },
      p2: { layer: 1, hand: [KICK, KICK] },
      p3: { layer: 1, hand: [KICK] },
      p4: { layer: 3, hand: [KICK] },
      pM: { layer: 1, hand: [KICK] },
    });
    const G: SetupState = {
      ...base,
      currentPlayerID: 'p1',
      turnPhase: 'discard',
      players: {
        ...base.players,
        pM: { ...base.players.pM!, characterId: c('dm_pluto_hell') },
        // 巨蟹·庇佑生效时弃牌不受上限限制，手牌才能带着 6 张结束回合
        p3: { ...base.players.p3!, characterId: c('thief_cancer') },
      },
    };
    const res = applyMove(game, load(G), { playerID: 'p1', move: 'doDiscard', args: [[]] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const p = res.state.G.players.p1!;
    expect(p.isAlive).toBe(false);
    expect(p.deathTurn).toBe(TURN);
    expect(p.currentLayer).toBe(0);
    expect(p.hand).toEqual(hand6);

    const revive = applyMove(game, load(asTurn(res.state.G, 'p1')), {
      playerID: 'p1',
      move: 'playRevive',
      args: [null, [KICK, KICK]],
    });
    expect(revive.ok).toBe(true);
    if (revive.ok) expect(revive.state.G.players.p1!.isAlive).toBe(true);
  });
});

describe('密道·传送', () => {
  function passage(): SetupState {
    const base = scene({
      p1: { layer: 2, hand: [KICK, KICK, UNLOCK] },
      p2: { layer: 2, hand: [KICK] },
      p3: { layer: 1, hand: [KICK] },
      p4: { layer: 3, hand: [KICK] },
      pM: { layer: 1, hand: [TRANSIT, KICK] },
    });
    return {
      ...base,
      players: {
        ...base.players,
        pM: { ...base.players.pM!, characterId: c('dm_secret_passage') },
      },
    };
  }

  it('目标进迷失层并视为已死亡，手牌留在原处，梦主不拿牌', () => {
    const res = applyMove(game, load(passage()), {
      playerID: 'pM',
      move: 'playSecretPassageTeleport',
      args: ['p1', TRANSIT],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expectLimbo(res.state.G, 'p1', [KICK, KICK, UNLOCK]);
    expect(res.state.G.players.pM!.hand).toEqual([KICK]);
    expect(res.state.G.players.pM!.shootCount).toBe(0);
  });

  it('被送走的人在密道世界观下弃 1 张穿梭剂即可复活', () => {
    const sent = applyMove(game, load(passage()), {
      playerID: 'pM',
      move: 'playSecretPassageTeleport',
      args: ['p1', TRANSIT],
    });
    if (!sent.ok) throw new Error('密道传送被拒绝');
    const G = asTurn(sent.state.G, 'p3');
    const withTransit: SetupState = {
      ...G,
      players: { ...G.players, p3: { ...G.players.p3!, hand: [TRANSIT] } },
    };
    const res = applyMove(game, load(withTransit), {
      playerID: 'p3',
      move: 'playRevive',
      args: ['p1', [TRANSIT]],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state.G.players.p1!.isAlive).toBe(true);
  });
});

describe('SHOOT 击杀交手牌', () => {
  function duel(targetHand: CardID[]): SetupState {
    return scene(
      {
        p1: { layer: 1, hand: [SHOOT] },
        p2: { layer: 1, hand: targetHand },
        p3: { layer: 1, hand: [KICK] },
        p4: { layer: 3, hand: [KICK] },
        pM: { layer: 1, hand: [KICK] },
      },
      { currentPlayerID: 'p1' },
    );
  }
  const shoot = (G: SetupState) =>
    applyMove(
      game,
      load(G),
      { playerID: 'p1', move: 'playShoot', args: ['p2', SHOOT] },
      { random: fixedRandom(1) },
    );

  it('被击杀者把手牌前 2 张交给击杀者，进迷失层并视为已死亡', () => {
    const res = shoot(duel([KICK, UNLOCK, SHOOT]));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const G = res.state.G;
    expect(G.players.p1!.hand).toEqual([KICK, UNLOCK]);
    expect(G.players.p2!.hand).toEqual([SHOOT]);
    expect(G.players.p2!.isAlive).toBe(false);
    expect(G.players.p2!.currentLayer).toBe(0);
    expect(G.layers[0]?.playersInLayer).toContain('p2');
    expect(G.layers[1]!.playersInLayer).not.toContain('p2');
  });

  it('手牌只有 1 张时只交 1 张', () => {
    const res = shoot(duel([UNLOCK]));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.G.players.p1!.hand).toEqual([UNLOCK]);
    expect(res.state.G.players.p2!.hand).toEqual([]);
    expect(res.state.G.players.p2!.isAlive).toBe(false);
  });
});

describe('随机对局', () => {
  it('每一步都满足：在迷失层当且仅当已死亡，层内名单与所在层一致', () => {
    let limboSeen = 0;
    for (let n = 4; n <= 10; n++) {
      for (const k of [1, 2, 3]) {
        const seed = `limbo-${n}-${k}`;
        const start = applyMove(
          game,
          createMatch(game, { numPlayers: n, setupData: { rngSeed: seed }, seed }),
          { playerID: '0', move: 'completeSetup', args: [] },
        );
        if (!start.ok) throw new Error('completeSetup 被拒绝');
        let s = start.state;
        const rnd = makeTestRng(n * 17 + k);
        for (let step = 0; step < 250 && s.ctx.gameover === undefined; step++) {
          expect(checkStateInvariants(s.G)).toEqual([]);
          if (Object.values(s.G.players).some((p) => p.currentLayer === 0)) limboSeen++;
          const cand = pickLegalMove(game, s, rnd, { preferSettle: false });
          if (!cand) break;
          const res = applyMove(game, s, cand);
          if (!res.ok) break;
          s = res.state;
        }
      }
    }
    // 局面里确实出现过迷失层，否则这条检查什么也没守住
    expect(limboSeen).toBeGreaterThan(0);
  }, 120_000);
});
