// 双面角色（双子 / 双鱼 / 露娜）的技能按面区分：正面技能只在正面可用，背面技能只在背面可用，
// 发动后翻到另一面。全部经对局运行器驱动真实 move。
// 对照：docs/manual/05-dream-thieves.md 双子 / 双鱼 / 露娜；docs/manual/03-game-flow.md 双面角色牌

import { describe, it, expect } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import { InceptionCityGame } from './game.js';
import type { SetupState } from './setup.js';
import { createTestState, makeLayer, makePlayer } from './testing/fixtures.js';
import {
  applyMove,
  matchFromSnapshot,
  type GameDef,
  type MatchState,
  type RandomSource,
} from './runner/matchRunner.js';
import {
  getBaseCharacterId,
  getCharacterFace,
  isCharacterFace,
} from './engine/abilities/dual-faced.js';

const game: GameDef<SetupState> = InceptionCityGame;

const c = (id: string) => id as CardID;
const SHOOT = c('action_shoot');
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

/** 把玩家放到指定层（同步层内名单），其余玩家保持原位 */
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

function scene(
  characterId: string,
  turnPhase: SetupState['turnPhase'],
  hand: CardID[] = [],
): SetupState {
  const base = createTestState({
    phase: 'playing',
    turnPhase,
    turnNumber: 5,
    currentPlayerID: 'p1',
    dreamMasterID: 'pM',
    deck: { cards: Array<CardID>(30).fill(KICK), discardPile: [] },
  });
  return {
    ...base,
    players: {
      ...base.players,
      p1: makePlayer({ id: 'p1', faction: 'thief', characterId: c(characterId), hand }),
    },
  };
}

function run(G: SetupState, playerID: string, move: string, args: unknown[] = [], roll = 5) {
  return applyMove(game, load(G), { playerID, move, args }, { random: fixedRandom(roll) });
}

describe('双面角色工具函数', () => {
  it('识别当前是哪一面与基础 id', () => {
    expect(getCharacterFace(c('thief_gemini'))).toBe('front');
    expect(getCharacterFace(c('thief_gemini_back'))).toBe('back');
    expect(getCharacterFace(c('thief_aquarius'))).toBeNull();
    expect(getBaseCharacterId(c('thief_luna_back'))).toBe('thief_luna');
    expect(getBaseCharacterId(c('thief_luna'))).toBe('thief_luna');
    expect(getBaseCharacterId(c('thief_aquarius'))).toBe('thief_aquarius');
    expect(isCharacterFace(c('thief_pisces_back'), c('thief_pisces'), 'back')).toBe(true);
    expect(isCharacterFace(c('thief_pisces_back'), c('thief_pisces'), 'front')).toBe(false);
  });
});

describe('双子', () => {
  // 命运（正面）：弃牌阶段，梦主层数大于自己
  const fate = (id: string) => place(scene(id, 'discard'), 'pM', 2);
  // 抉择（背面）：出牌阶段，梦主层数小于自己
  const choice = (id: string) => place(place(scene(id, 'action'), 'p1', 2), 'pM', 1);

  it('背面不能发动正面技能·命运', () => {
    expect(run(fate('thief_gemini_back'), 'p1', 'playGeminiSync').ok).toBe(false);
  });

  it('正面发动命运：心锁 -2 并翻到背面', () => {
    const res = run(fate('thief_gemini'), 'p1', 'playGeminiSync', [], 5);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.G.players.p1!.characterId).toBe('thief_gemini_back');
    expect(res.state.G.layers[1]!.heartLockValue).toBe(3);
  });

  it('正面不能发动背面技能·抉择', () => {
    expect(run(choice('thief_gemini'), 'p1', 'playGeminiChoice').ok).toBe(false);
  });

  it('背面发动抉择：抽牌并翻回正面', () => {
    const res = run(choice('thief_gemini_back'), 'p1', 'playGeminiChoice', [], 3);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.G.players.p1!.characterId).toBe('thief_gemini');
    expect(res.state.G.players.p1!.hand).toHaveLength(6);
  });
});

describe('露娜', () => {
  const eclipse = (id: string) => scene(id, 'action', [SHOOT, SHOOT]);
  const fullMoon = (id: string) => {
    const G = scene(id, 'action', [KICK, UNLOCK]);
    return {
      ...G,
      players: { ...G.players, p2: { ...G.players.p2!, isAlive: false, deathTurn: 3 } },
    };
  };

  it('背面不能发动正面技能·月蚀', () => {
    expect(
      run(eclipse('thief_luna_back'), 'p1', 'playLunaEclipse', [[SHOOT, SHOOT], 'p3']).ok,
    ).toBe(false);
  });

  it('正面发动月蚀：击杀同层玩家并翻到背面', () => {
    const res = run(eclipse('thief_luna'), 'p1', 'playLunaEclipse', [[SHOOT, SHOOT], 'p3']);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.G.players.p3!.isAlive).toBe(false);
    expect(res.state.G.players.p1!.characterId).toBe('thief_luna_back');
  });

  it('正面不能发动背面技能·满月', () => {
    expect(run(fullMoon('thief_luna'), 'p1', 'playLunaFullMoon', [[KICK, UNLOCK], ['p2']]).ok).toBe(
      false,
    );
  });

  it('背面发动满月：复活玩家并翻回正面', () => {
    const res = run(fullMoon('thief_luna_back'), 'p1', 'playLunaFullMoon', [
      [KICK, UNLOCK],
      ['p2'],
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.G.players.p2!.isAlive).toBe(true);
    expect(res.state.G.players.p1!.characterId).toBe('thief_luna');
  });
});

describe('双鱼', () => {
  const blessing = (id: string) => scene(id, 'action');

  it('正面不能发动背面技能·洗礼', () => {
    expect(run(blessing('thief_pisces'), 'p1', 'playPiscesBlessing', [null]).ok).toBe(false);
  });

  it('背面发动洗礼：移到更大相邻层并翻回正面', () => {
    const res = run(blessing('thief_pisces_back'), 'p1', 'playPiscesBlessing', [null]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.G.players.p1!.currentLayer).toBe(2);
    expect(res.state.G.players.p1!.characterId).toBe('thief_pisces');
  });

  /** 梦主 pM 在第 2 层 SHOOT 同层的 p1（双鱼） */
  function shootScene(characterId: string): SetupState {
    let G = scene(characterId, 'action');
    G = { ...G, currentPlayerID: 'pM' };
    G = place(G, 'p1', 2);
    G = place(G, 'pM', 2);
    return { ...G, players: { ...G.players, pM: { ...G.players.pM!, hand: [SHOOT] } } };
  }

  it('正面双鱼被 SHOOT：挂起游离响应，应答后移到更小的层并翻到背面', () => {
    const shot = run(shootScene('thief_pisces'), 'pM', 'playShoot', ['p1', SHOOT], 3);
    expect(shot.ok).toBe(true);
    if (!shot.ok) return;
    expect(shot.state.G.pendingShootResponse?.targetPlayerID).toBe('p1');
    const evade = applyMove(
      game,
      shot.state,
      { playerID: 'p1', move: 'respondShootEvade', args: [] },
      { random: fixedRandom(3) },
    );
    expect(evade.ok).toBe(true);
    if (!evade.ok) return;
    expect(evade.state.G.players.p1!.currentLayer).toBe(1);
    expect(evade.state.G.players.p1!.characterId).toBe('thief_pisces_back');
  });

  it('背面双鱼被 SHOOT：不挂起游离响应，直接掷骰结算', () => {
    const shot = run(shootScene('thief_pisces_back'), 'pM', 'playShoot', ['p1', SHOOT], 3);
    expect(shot.ok).toBe(true);
    if (!shot.ok) return;
    expect(shot.state.G.pendingShootResponse).toBeNull();
  });
});
