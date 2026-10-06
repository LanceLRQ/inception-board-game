// 出牌 move 校验「这张牌就是这个 move 对应的牌」：拿别的牌冒充会被拒绝、状态不变。
// 全部经对局运行器驱动真实 move。
// 对照：docs/manual/04-action-cards.md 各行动牌的使用时机与效果

import { describe, it, expect } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import { InceptionCityGame } from './game.js';
import type { SetupState } from './setup.js';
import { PLAY_MOVE_CARD_IDS, isCardForPlayMove } from './engine/playCardKinds.js';
import { createTestState, makePlayer } from './testing/fixtures.js';
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

/** p1 手里只有 hand，p2 与 p1 同层；p1 默认盗梦者，asMaster 时 p1 是梦主 */
function scene(hand: CardID[], asMaster = false): SetupState {
  const base = createTestState({
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 1,
    currentPlayerID: 'p1',
    dreamMasterID: asMaster ? 'p1' : 'pM',
    deck: { cards: Array<CardID>(30).fill(KICK), discardPile: [] },
  });
  return {
    ...base,
    players: {
      ...base.players,
      p1: makePlayer({
        id: 'p1',
        faction: asMaster ? 'master' : 'thief',
        currentLayer: 1 as Layer,
        hand,
      }),
      p2: makePlayer({
        id: 'p2',
        faction: 'thief',
        currentLayer: 1 as Layer,
        hand: [KICK],
      }),
    },
  };
}

function attempt(G: SetupState, move: string, args: unknown[], roll = 3) {
  const s = load(G);
  const res = applyMove(
    game,
    s,
    { playerID: G.currentPlayerID, move, args },
    { random: fixedRandom(roll) },
  );
  return { s, res };
}

// move 名 → 用「该牌」打出时的参数（冒充时把 card 换成别的牌）
const CALLS: Array<{ move: string; right: string; args: (card: CardID) => unknown[] }> = [
  { move: 'playShoot', right: 'action_shoot', args: (cd) => ['p2', cd] },
  { move: 'playShootKing', right: 'action_shoot_assassin', args: (cd) => ['p2', cd] },
  { move: 'playShootArmor', right: 'action_shoot_drill', args: (cd) => ['p2', cd] },
  { move: 'playShootBurst', right: 'action_shoot_burst', args: (cd) => ['p2', cd] },
  {
    move: 'playShootDreamTransit',
    right: 'action_shoot_dream_transit',
    args: (cd) => [cd, 'shoot', 'p2'],
  },
  { move: 'playUnlock', right: 'action_unlock', args: (cd) => [cd] },
  { move: 'playKick', right: 'action_kick', args: (cd) => [cd, 'p2'] },
  { move: 'playDreamTransit', right: 'action_dream_transit', args: (cd) => [cd, 2] },
  { move: 'playTelekinesis', right: 'action_telekinesis', args: (cd) => [cd, 'p2'] },
  { move: 'playGravity', right: 'action_gravity', args: (cd) => [cd, ['p2']] },
  { move: 'playCreation', right: 'action_creation', args: (cd) => [cd] },
  { move: 'playGraft', right: 'action_graft', args: (cd) => [cd] },
  { move: 'playResonance', right: 'action_resonance', args: (cd) => [cd, 'p2'] },
  { move: 'playShift', right: 'action_shift', args: (cd) => [cd, 'p2'] },
  { move: 'playPeek', right: 'action_dream_peek', args: (cd) => [cd, 1] },
  { move: 'playTimeStorm', right: 'action_time_storm', args: (cd) => [cd] },
  { move: 'playNightmareUnlock', right: 'action_nightmare_unlock', args: (cd) => [cd, 1] },
];

describe('出牌 move 与牌的对应表', () => {
  it('maps every play move to exactly the card it is named after', () => {
    for (const { move, right } of CALLS) {
      expect(PLAY_MOVE_CARD_IDS[move], move).toEqual([right]);
      expect(isCardForPlayMove(move, c(right)), move).toBe(true);
    }
  });

  it('does not accept another card for a move', () => {
    expect(isCardForPlayMove('playShoot', c('action_shoot_assassin'))).toBe(false);
    expect(isCardForPlayMove('playKick', SHOOT)).toBe(false);
  });
});

describe('拿别的牌冒充会被拒绝、状态不变', () => {
  for (const { move, right, args } of CALLS) {
    // 冒充牌：对 playShoot 用 KICK，其余都用 SHOOT；对 playKick 等同理
    const fake = move === 'playShoot' ? KICK : SHOOT;
    it(`${move} rejects ${fake} in hand`, () => {
      const hand = [fake, c(right)].filter((x, i, a) => a.indexOf(x) === i);
      // 手里同时有真牌也不行：冒充的那张牌作为参数传入必须被拒
      const G = scene(hand);
      const { s, res } = attempt(G, move, args(fake));
      expect(res.ok).toBe(false);
      expect(res.state).toBe(s);
    });
  }
});

describe('正确的牌仍然能打出', () => {
  it('playShoot with action_shoot', () => {
    const { res } = attempt(scene([SHOOT]), 'playShoot', ['p2', SHOOT], 1);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state.G.players['p2']!.isAlive).toBe(false);
  });

  it('playKick with action_kick', () => {
    const { res } = attempt(scene([KICK]), 'playKick', [KICK, 'p2']);
    expect(res.ok).toBe(true);
  });

  it('playCreation with action_creation draws two cards', () => {
    const cd = c('action_creation');
    const { res } = attempt(scene([cd]), 'playCreation', [cd]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state.G.players['p1']!.hand).toHaveLength(2);
  });

  it('playDreamTransit with action_dream_transit', () => {
    const cd = c('action_dream_transit');
    const { res } = attempt(scene([cd]), 'playDreamTransit', [cd, 2]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state.G.players['p1']!.currentLayer).toBe(2);
  });

  it('playUnlock with action_unlock', () => {
    const { res } = attempt(scene([UNLOCK]), 'playUnlock', [UNLOCK]);
    expect(res.ok).toBe(true);
  });

  it('playGraft with action_graft', () => {
    const cd = c('action_graft');
    const { res } = attempt(scene([cd]), 'playGraft', [cd]);
    expect(res.ok).toBe(true);
  });

  it('playTelekinesis with action_telekinesis', () => {
    const cd = c('action_telekinesis');
    const { res } = attempt(scene([cd]), 'playTelekinesis', [cd, 'p2']);
    expect(res.ok).toBe(true);
  });
});
