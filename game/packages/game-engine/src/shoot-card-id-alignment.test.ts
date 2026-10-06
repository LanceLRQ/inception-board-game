// 刺客之王 / 爆甲螺旋的牌 id 与牌库一致：牌库按卡牌配置发牌（action_shoot_assassin / action_shoot_drill），
// 引擎的出牌 move、SHOOT 类判断、炸裂弹头的弃牌清单必须认这两个 id。
// 经对局运行器驱动真实 move。
// 对照：docs/manual/04-action-cards.md SHOOT·刺客之王 / SHOOT·爆甲螺旋 / SHOOT·炸裂弹头

import { describe, it, expect } from 'vitest';
import { ACTION_CARDS } from '@icgame/shared';
import type { CardID, Layer } from '@icgame/shared';
import { InceptionCityGame } from './game.js';
import type { SetupState } from './setup.js';
import { isShootClassCard } from './engine/skills.js';
import { createTestState, makePlayer } from './testing/fixtures.js';
import {
  applyMove,
  matchFromSnapshot,
  type GameDef,
  type MatchState,
  type RandomSource,
} from './runner/matchRunner.js';

const game: GameDef<SetupState> = InceptionCityGame;

const ASSASSIN = 'action_shoot_assassin' as CardID;
const DRILL = 'action_shoot_drill' as CardID;
const BURST = 'action_shoot_burst' as CardID;
const SHOOT = 'action_shoot' as CardID;
const UNLOCK = 'action_unlock' as CardID;
const KICK = 'action_kick' as CardID;

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

function scene(opts: {
  shooterHand: CardID[];
  targetHand: CardID[];
  shooterLayer: Layer;
  targetLayer: Layer;
}): SetupState {
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
        currentLayer: opts.shooterLayer,
        hand: opts.shooterHand,
      }),
      p2: makePlayer({
        id: 'p2',
        faction: 'thief',
        currentLayer: opts.targetLayer,
        hand: opts.targetHand,
      }),
    },
  };
}

function play(G: SetupState, move: string, args: unknown[], roll: number) {
  return applyMove(
    game,
    load(G),
    { playerID: G.currentPlayerID, move, args },
    { random: fixedRandom(roll) },
  );
}

describe('牌库里的刺客之王与爆甲螺旋', () => {
  it('uses the ids the card table deals', () => {
    const ids = ACTION_CARDS.map((c) => c.id);
    expect(ids).toContain(ASSASSIN);
    expect(ids).toContain(DRILL);
    // 曾经引擎认的另一套 id，从未进过牌库
    expect(ids).not.toContain(['action_shoot', 'king'].join('_'));
    expect(ids).not.toContain(['action_shoot', 'armor'].join('_'));
  });

  it('counts both as shoot-class cards', () => {
    expect(isShootClassCard(ASSASSIN)).toBe(true);
    expect(isShootClassCard(DRILL)).toBe(true);
  });
});

describe('刺客之王经 playShootKing 结算', () => {
  it('hits a player on another layer and kills on a 2', () => {
    const G = scene({ shooterHand: [ASSASSIN], targetHand: [], shooterLayer: 1, targetLayer: 4 });
    const res = play(G, 'playShootKing', ['p2', ASSASSIN], 2);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.G.players['p2']!.isAlive).toBe(false);
      expect(res.state.G.players['p1']!.hand).not.toContain(ASSASSIN);
    }
  });

  it('moves the target to the adjacent layer on a 5', () => {
    const G = scene({ shooterHand: [ASSASSIN], targetHand: [], shooterLayer: 1, targetLayer: 4 });
    const res = play(G, 'playShootKing', ['p2', ASSASSIN], 5);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.G.players['p2']!.isAlive).toBe(true);
      expect(res.state.G.players['p2']!.currentLayer).toBe(3);
    }
  });
});

describe('爆甲螺旋经 playShootArmor 结算', () => {
  it('kills on a 2', () => {
    const G = scene({ shooterHand: [DRILL], targetHand: [], shooterLayer: 1, targetLayer: 1 });
    const res = play(G, 'playShootArmor', ['p2', DRILL], 2);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state.G.players['p2']!.isAlive).toBe(false);
  });

  it('discards every unlock and moves the target on a 4', () => {
    const G = scene({
      shooterHand: [DRILL],
      targetHand: [UNLOCK, KICK, UNLOCK],
      shooterLayer: 1,
      targetLayer: 1,
    });
    const res = play(G, 'playShootArmor', ['p2', DRILL], 4);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const p2 = res.state.G.players['p2']!;
      expect(p2.hand).toEqual([KICK]);
      expect(p2.currentLayer).toBe(2);
    }
  });

  it('rejects a target on another layer', () => {
    const G = scene({ shooterHand: [DRILL], targetHand: [], shooterLayer: 1, targetLayer: 3 });
    const res = play(G, 'playShootArmor', ['p2', DRILL], 4);
    expect(res.ok).toBe(false);
  });
});

describe('炸裂弹头的弃牌清单', () => {
  it('discards assassin and drill along with the other shoot-class cards', () => {
    const G = scene({
      shooterHand: [BURST],
      targetHand: [ASSASSIN, DRILL, SHOOT, KICK],
      shooterLayer: 1,
      targetLayer: 1,
    });
    const res = play(G, 'playShootBurst', ['p2', BURST], 4);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state.G.players['p2']!.hand).toEqual([KICK]);
  });
});
