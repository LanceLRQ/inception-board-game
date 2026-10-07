// 处女·完美按 SHOOT 的最终结算点数判断（经 M4、狂热等修正之后），而不是原始 D6；
// 没有实际掷骰的结算（双鱼·游离躲开）不触发。全部经对局运行器驱动真实 move。
// 对照：docs/manual/05-dream-thieves.md 处女·完美 / 天蝎·毒针 / 哈雷·冲击
// 裁定 R-10：按修正后的最终结果判断

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

const game: GameDef<SetupState> = InceptionCityGame;

const c = (id: string) => id as CardID;
const SHOOT = c('action_shoot');
const KICK = c('action_kick');

function fixedRandom(...rolls: number[]): RandomSource {
  let i = 0;
  const next = () => rolls[Math.min(i++, rolls.length - 1)]!;
  return { D6: next, Die: next, Shuffle: (arr) => arr };
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

/**
 * p1 处女（第 1 层）；p2 目标（第 2 层，characterId 可换）；
 * shooterID 在第 2 层持有一张 SHOOT，是当前回合玩家。
 * 梦主 pM 在第 3 层，除非梦主自己就是 shooter。
 */
function scene(opts: {
  shooterID: 'p3' | 'pM';
  shooterCharacter?: string;
  targetCharacter?: string;
  targetHand?: CardID[];
}): SetupState {
  const base = createTestState({
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 5,
    currentPlayerID: opts.shooterID,
    dreamMasterID: 'pM',
    deck: { cards: Array<CardID>(30).fill(KICK), discardPile: [] },
  });
  const layerOf: Record<string, number> = { p1: 1, p2: 2, p3: 2, p4: 1, pM: 3 };
  layerOf[opts.shooterID] = 2;
  const players = { ...base.players };
  players.p1 = makePlayer({
    id: 'p1',
    faction: 'thief',
    characterId: c('thief_virgo'),
    currentLayer: 1 as Layer,
  });
  players.p2 = makePlayer({
    id: 'p2',
    faction: 'thief',
    characterId: c(opts.targetCharacter ?? 'thief_aquarius'),
    currentLayer: 2 as Layer,
    hand: opts.targetHand ?? [KICK],
  });
  players[opts.shooterID] = makePlayer({
    id: opts.shooterID,
    faction: opts.shooterID === 'pM' ? 'master' : 'thief',
    characterId: c(opts.shooterCharacter ?? 'thief_aquarius'),
    currentLayer: 2 as Layer,
    hand: [SHOOT],
  });
  const layers = { ...base.layers };
  for (const k of [1, 2, 3, 4]) layers[k] = makeLayer(k as Layer, { heartLockValue: 3 });
  for (const [id, l] of Object.entries(layerOf)) {
    players[id] = { ...players[id]!, currentLayer: l as Layer };
    layers[l] = { ...layers[l]!, playersInLayer: [...layers[l]!.playersInLayer, id] };
  }
  return { ...base, players, layers };
}

function shoot(G: SetupState, shooter: string, ...rolls: number[]) {
  const res = applyMove(
    game,
    load(G),
    { playerID: shooter, move: 'playShoot', args: ['p2', SHOOT] },
    { random: fixedRandom(...rolls) },
  );
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error('playShoot 被拒绝');
  return res.state;
}

describe('处女·完美 · 按最终结算点数判断', () => {
  it('盗梦者 SHOOT，原始 6 且无修正 → 触发', () => {
    const after = shoot(scene({ shooterID: 'p3' }), 'p3', 6);
    expect(after.G.pendingVirgoChoice?.virgoID).toBe('p1');
  });

  it('梦主 SHOOT，原始 6 经 M4 -1 变为 5 → 不触发', () => {
    const after = shoot(scene({ shooterID: 'pM' }), 'pM', 6);
    expect(after.G.lastShootRoll).toBe(6);
    expect(after.G.pendingVirgoChoice).toBeNull();
  });

  it('梦主 SHOOT，原始 5 / 其他值 → 不触发', () => {
    expect(shoot(scene({ shooterID: 'pM' }), 'pM', 5).G.pendingVirgoChoice).toBeNull();
  });

  it('恐怖分子·狂热罚 -1，6 变 5 → 不触发', () => {
    const initial = shoot(scene({ shooterID: 'p3', shooterCharacter: 'thief_terrorist' }), 'p3', 6);
    // 恐怖分子 SHOOT 先挂起狂热响应窗口，此时还没掷骰
    expect(initial.G.pendingShootResponse?.responseType).toBe('terrorist');
    const res = applyMove(
      game,
      initial,
      { playerID: 'p2', move: 'respondTerroristAccept', args: [] },
      { random: fixedRandom(6) },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.G.lastShootRoll).toBe(6);
    expect(res.state.G.pendingVirgoChoice).toBeNull();
  });

  it('恐怖分子·狂热目标弃牌（无罚），6 仍是 6 → 触发', () => {
    const initial = shoot(scene({ shooterID: 'p3', shooterCharacter: 'thief_terrorist' }), 'p3', 6);
    const res = applyMove(
      game,
      initial,
      { playerID: 'p2', move: 'respondTerroristDiscard', args: [KICK] },
      { random: fixedRandom(6) },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.G.pendingVirgoChoice?.virgoID).toBe('p1');
  });

  it('灵雕师·雕琢：目标手牌数就是最终点数，手牌 6 张 → 触发，原始 D6 为 6 但手牌 3 张 → 不触发', () => {
    const six = Array<CardID>(6).fill(KICK);
    const three = Array<CardID>(3).fill(KICK);
    const hit = shoot(
      scene({ shooterID: 'p3', shooterCharacter: 'thief_soul_sculptor', targetHand: six }),
      'p3',
      2,
    );
    expect(hit.G.pendingVirgoChoice?.virgoID).toBe('p1');
    const miss = shoot(
      scene({ shooterID: 'p3', shooterCharacter: 'thief_soul_sculptor', targetHand: three }),
      'p3',
      6,
    );
    expect(miss.G.pendingVirgoChoice).toBeNull();
  });

  it('双鱼·游离躲开 SHOOT：没有掷骰，不凭残留的旧骰值触发', () => {
    const G = { ...scene({ shooterID: 'p3', targetCharacter: 'thief_pisces' }), lastShootRoll: 6 };
    const pending = shoot(G, 'p3', 3);
    expect(pending.G.pendingShootResponse?.responseType).toBe('pisces');
    const res = applyMove(
      game,
      pending,
      { playerID: 'p2', move: 'respondShootEvade', args: [] },
      { random: fixedRandom(3) },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.G.pendingVirgoChoice).toBeNull();
  });
});
