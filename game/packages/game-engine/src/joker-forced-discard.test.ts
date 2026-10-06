// 小丑·失控：略过抽牌阶段、掷骰抽牌，则在发动当回合的弃牌阶段必须弃掉所有手牌。
// 全部经对局运行器驱动真实 move。
// 对照：docs/manual/05-dream-thieves.md 小丑

import { describe, it, expect } from 'vitest';
import type { CardID } from '@icgame/shared';
import { InceptionCityGame } from './game.js';
import type { SetupState } from './setup.js';
import { createTestState } from './testing/fixtures.js';
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

const fixedRandom = (roll: number): RandomSource => ({
  D6: () => roll,
  Die: () => roll,
  Shuffle: (arr) => arr,
});

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

function jokerScene(): SetupState {
  const base = createTestState({
    phase: 'playing',
    turnPhase: 'draw',
    turnNumber: 5,
    currentPlayerID: 'p1',
    dreamMasterID: 'pM',
    deck: { cards: Array<CardID>(30).fill(KICK), discardPile: [] },
  });
  return {
    ...base,
    players: {
      ...base.players,
      p1: { ...base.players.p1!, characterId: c('thief_joker'), hand: [KICK, KICK, KICK] },
    },
  };
}

function run(s: MatchState<SetupState>, move: string, args: unknown[] = [], roll = 1) {
  return applyMove(game, s, { playerID: 'p1', move, args }, { random: fixedRandom(roll) });
}

/** 发动失控并走到弃牌阶段，返回弃牌阶段的对局 */
function toDiscard(): MatchState<SetupState> {
  const gamble = run(load(jokerScene()), 'playJokerGamble');
  expect(gamble.ok).toBe(true);
  if (!gamble.ok) throw new Error('playJokerGamble 被拒绝');
  const end = run(gamble.state, 'endActionPhase');
  expect(end.ok).toBe(true);
  if (!end.ok) throw new Error('endActionPhase 被拒绝');
  expect(end.state.G.turnPhase).toBe('discard');
  return end.state;
}

describe('小丑·失控的全弃罚则落在发动当回合', () => {
  it('当回合弃牌阶段不能跳过', () => {
    const s = toDiscard();
    expect(s.G.players.p1!.hand.length).toBeGreaterThan(0);
    expect(run(s, 'skipDiscard').ok).toBe(false);
  });

  it('当回合弃牌阶段少弃被拒', () => {
    const s = toDiscard();
    const hand = s.G.players.p1!.hand;
    expect(run(s, 'doDiscard', [[hand[0]]]).ok).toBe(false);
  });

  it('当回合弃牌阶段全弃通过，罚则随之清除', () => {
    const s = toDiscard();
    const hand = s.G.players.p1!.hand;
    const res = run(s, 'doDiscard', [[...hand]]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.G.players.p1!.hand).toEqual([]);
    expect(res.state.G.players.p1!.forcedDiscardArmedAtTurn ?? null).toBeNull();
  });

  it('下一个自己的回合不再被强制', () => {
    const s = toDiscard();
    // 同一名玩家的下一个回合：回合号前进，不再受罚
    const next: SetupState = {
      ...s.G,
      turnPhase: 'discard',
      turnNumber: s.G.turnNumber + 5,
      players: { ...s.G.players, p1: { ...s.G.players.p1!, hand: [KICK, KICK] } },
    };
    expect(run(load(next), 'skipDiscard').ok).toBe(true);
    expect(run(load(next), 'doDiscard', [[KICK]]).ok).toBe(true);
  });
});
