// 意念判官·定罪沿用 SHOOT 的目标限制：只有刺客之王可以跨层，其余 SHOOT 类牌必须同层。
// 经对局运行器驱动真实 move。
// 对照：docs/manual/05-dream-thieves.md 意念判官；docs/manual/04-action-cards.md SHOOT / SHOOT·刺客之王

import { describe, it, expect } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import { InceptionCityGame } from './game.js';
import type { SetupState } from './setup.js';
import { createTestState, makePlayer } from './testing/fixtures.js';
import {
  applyMove,
  matchFromSnapshot,
  type GameDef,
  type RandomSource,
} from './runner/matchRunner.js';

const game: GameDef<SetupState> = InceptionCityGame;

const SHOOT = 'action_shoot' as CardID;
const ASSASSIN = 'action_shoot_assassin' as CardID;
const DRILL = 'action_shoot_drill' as CardID;

const rolls: RandomSource = { D6: () => 3, Die: () => 3, Shuffle: (arr) => arr };

function scene(card: CardID, targetLayer: Layer): SetupState {
  const base = createTestState({
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 1,
    currentPlayerID: 'p1',
    dreamMasterID: 'pM',
  });
  return {
    ...base,
    players: {
      ...base.players,
      p1: makePlayer({
        id: 'p1',
        faction: 'thief',
        characterId: 'thief_sudger_of_mind' as CardID,
        currentLayer: 1 as Layer,
        hand: [card],
      }),
      p2: makePlayer({ id: 'p2', faction: 'thief', currentLayer: targetLayer }),
    },
  };
}

function convict(G: SetupState, card: CardID) {
  const s = matchFromSnapshot<SetupState>({
    G,
    ctx: {
      numPlayers: G.playerOrder.length,
      playOrder: G.playerOrder,
      playOrderPos: G.playerOrder.indexOf('p1'),
      currentPlayer: 'p1',
      phase: 'playing',
      turn: 1,
    },
    rngState: 1,
    stateID: 0,
  });
  const res = applyMove(
    game,
    s,
    { playerID: 'p1', move: 'playShootSudger', args: ['p2', card] },
    { random: rolls },
  );
  return { s, res };
}

describe('意念判官·定罪的同层限制', () => {
  it('rejects a plain SHOOT aimed at another layer', () => {
    const { s, res } = convict(scene(SHOOT, 3 as Layer), SHOOT);
    expect(res.ok).toBe(false);
    expect(res.state).toBe(s);
  });

  it('rejects a drill aimed at another layer', () => {
    const { res } = convict(scene(DRILL, 4 as Layer), DRILL);
    expect(res.ok).toBe(false);
  });

  it('rolls two dice for a target on the same layer', () => {
    const { res } = convict(scene(SHOOT, 1 as Layer), SHOOT);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.G.pendingSudgerRolls).toMatchObject({
        targetPlayerID: 'p2',
        cardId: SHOOT,
      });
    }
  });

  it('lets the assassin reach another layer', () => {
    const { res } = convict(scene(ASSASSIN, 4 as Layer), ASSASSIN);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state.G.pendingSudgerRolls).not.toBeNull();
  });
});
