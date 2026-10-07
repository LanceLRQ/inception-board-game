// 梦主本人以 dreamMasterID 为准：盗梦者被贿赂转阵营后 faction 也是 master，
// 座次排在梦主前面时，按「第一个 master 阵营的玩家」去找梦主会认错人。
// 经对局运行器驱动真实 move。
// 对照：docs/manual/06-dream-master.md 盛夏；docs/manual/03-game-flow.md M4 卡宾枪

import { describe, it, expect } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import { InceptionCityGame } from './game.js';
import type { SetupState } from './setup.js';
import { findMasterID, getMasterCharacterID } from './engine/skills.js';
import { createTestState, makePlayer } from './testing/fixtures.js';
import {
  applyMove,
  matchFromSnapshot,
  type GameDef,
  type RandomSource,
} from './runner/matchRunner.js';

const game: GameDef<SetupState> = InceptionCityGame;

const KICK = 'action_kick' as CardID;
const SHOOT = 'action_shoot' as CardID;

function fixedRandom(roll: number): RandomSource {
  return { D6: () => roll, Die: () => roll, Shuffle: (arr) => arr };
}

/** 座次 [背叛者(原盗梦者，faction 已转 master), 梦主(盛夏), 盗梦者] */
function betrayerFirst(current: string, turnPhase: SetupState['turnPhase']): SetupState {
  const base = createTestState({
    phase: 'playing',
    turnPhase,
    turnNumber: 1,
    currentPlayerID: current,
    dreamMasterID: 'pM',
    playerOrder: ['bt', 'pM', 'th'],
    deck: { cards: Array<CardID>(30).fill(KICK), discardPile: [] },
    bribePool: [0, 1, 2].map((i) => ({
      id: `bribe-${i}`,
      kind: 'fail' as const,
      status: 'inPool' as const,
      heldBy: null,
      originalOwnerId: null,
    })),
  });
  const mk = (id: string, faction: 'thief' | 'master', characterId: string, hand: CardID[] = []) =>
    makePlayer({
      id,
      faction,
      characterId: characterId as CardID,
      currentLayer: 1 as Layer,
      hand,
    });
  return {
    ...base,
    players: {
      bt: mk('bt', 'master', 'thief_joker', [SHOOT]),
      pM: mk('pM', 'master', 'dm_midsummer', [SHOOT]),
      th: mk('th', 'thief', 'thief_aries'),
    },
  };
}

function load(G: SetupState) {
  return matchFromSnapshot<SetupState>({
    G,
    ctx: {
      numPlayers: 3,
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

function run(G: SetupState, move: string, args: unknown[], roll = 3) {
  return applyMove(
    game,
    load(G),
    { playerID: G.currentPlayerID, move, args },
    { random: fixedRandom(roll) },
  );
}

describe('背叛者排在梦主前面时认梦主', () => {
  it('findMasterID returns dreamMasterID', () => {
    const G = betrayerFirst('th', 'draw');
    expect(findMasterID(G)).toBe('pM');
  });

  it('findMasterID returns null when dreamMasterID is empty or unknown', () => {
    const G = betrayerFirst('th', 'draw');
    expect(findMasterID({ ...G, dreamMasterID: '' })).toBeNull();
    expect(findMasterID({ ...G, dreamMasterID: 'ghost' })).toBeNull();
  });

  it('getMasterCharacterID returns the dream master character', () => {
    expect(getMasterCharacterID(betrayerFirst('th', 'draw'))).toBe('dm_midsummer');
  });

  it('Midsummer world view still gives the thief an extra draw', () => {
    const res = run(betrayerFirst('th', 'draw'), 'doDraw', []);
    expect(res.ok).toBe(true);
    // 基础 2 张 + 盛夏世界观 +1
    if (res.ok) expect(res.state.G.players['th']!.hand).toHaveLength(3);
  });

  it('Midsummer fullness skill goes to the dream master, not the betrayer', () => {
    const betrayer = run(betrayerFirst('bt', 'draw'), 'doDraw', []);
    expect(betrayer.ok).toBe(true);
    // 背叛者没有盛夏·充盈；对外他是盗梦者，与普通盗梦者一样吃世界观的 +1：基础 2 + 1（原手牌 1 张）
    if (betrayer.ok) expect(betrayer.state.G.players['bt']!.hand).toHaveLength(1 + 2 + 1);

    const master = run(betrayerFirst('pM', 'draw'), 'doDraw', []);
    expect(master.ok).toBe(true);
    // 梦主：基础 2 + 未派发贿赂 3（原手牌 1 张）
    if (master.ok) expect(master.state.G.players['pM']!.hand).toHaveLength(1 + 2 + 3);
  });
});

describe('M4 卡宾枪只属于梦主本人', () => {
  it('lowers the target roll when the dream master shoots', () => {
    const res = run(betrayerFirst('pM', 'action'), 'playShoot', ['th', SHOOT], 2);
    expect(res.ok).toBe(true);
    // 2 点 -1 = 1 点：死亡
    if (res.ok) expect(res.state.G.players['th']!.isAlive).toBe(false);
  });

  it('does not apply when a betrayer shoots', () => {
    const res = run(betrayerFirst('bt', 'action'), 'playShoot', ['th', SHOOT], 2);
    expect(res.ok).toBe(true);
    // 2 点不修饰：移动，不死
    if (res.ok) expect(res.state.G.players['th']!.isAlive).toBe(true);
  });
});
