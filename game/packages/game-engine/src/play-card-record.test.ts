// 出牌记录对账：出牌 move 表（PLAY_MOVE_CARD_IDS）里的每个 move，
// 经对局定义成功打出之后，「本回合打出过的牌」恰好多出那一张牌。
// 对照：docs/manual/05-dream-thieves.md 水瓶（同名牌计数）；docs/manual/04-action-cards.md 各行动牌

import { describe, it, expect } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import { PLAY_MOVE_CARD_IDS } from './engine/playCardKinds.js';
import type { SetupState } from './setup.js';
import { callMove, createTestState, makePlayer, withBribes } from './testing/fixtures.js';

const id = (s: string) => s as CardID;

/**
 * 默认场景：p1 回合主人（盗梦者，第 1 层）、p2 同层盗梦者、p3 第 2 层盗梦者、pM 梦主；
 * 每层都有金库，第 1 层带一张梦魇牌，牌库有牌。
 */
function scene(hand: CardID[], extra: Partial<SetupState> = {}): SetupState {
  const base = createTestState({
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 3,
    currentPlayerID: 'p1',
    dreamMasterID: 'pM',
    playerOrder: ['p1', 'p2', 'p3', 'pM'],
    deck: { cards: Array<CardID>(30).fill(id('action_kick')), discardPile: [] },
  });
  const players: SetupState['players'] = {
    p1: makePlayer({ id: 'p1', faction: 'thief', currentLayer: 1 as Layer, hand }),
    p2: makePlayer({
      id: 'p2',
      faction: 'thief',
      currentLayer: 1 as Layer,
      hand: [id('action_kick')],
    }),
    p3: makePlayer({ id: 'p3', faction: 'thief', currentLayer: 2 as Layer }),
    pM: makePlayer({ id: 'pM', faction: 'master', currentLayer: 1 as Layer }),
  };
  const layers = {
    ...base.layers,
    1: {
      ...base.layers[1]!,
      playersInLayer: ['p1', 'p2', 'pM'],
      nightmareId: id('nightmare_despair_storm'),
    },
    2: { ...base.layers[2]!, playersInLayer: ['p3'] },
  };
  return { ...base, players, layers, ...extra };
}

interface Case {
  move: string;
  card: string;
  args: unknown[];
  /** 贿赂牌池（梦境窥视·梦主效果需要有人持有贿赂牌） */
  bribes?: Parameters<typeof withBribes>[1];
  /** 回合主人；缺省为 p1 */
  owner?: string;
  /** 这一条用例对应表里的哪个 move（同一个 move 有多条用例时用） */
  label?: string;
}

const CASES: Case[] = [
  { move: 'playShoot', card: 'action_shoot', args: ['p2', 'action_shoot'] },
  { move: 'playShootKing', card: 'action_shoot_assassin', args: ['p2', 'action_shoot_assassin'] },
  { move: 'playShootArmor', card: 'action_shoot_drill', args: ['p2', 'action_shoot_drill'] },
  { move: 'playShootBurst', card: 'action_shoot_burst', args: ['p2', 'action_shoot_burst'] },
  {
    move: 'playShootDreamTransit',
    card: 'action_shoot_dream_transit',
    args: ['action_shoot_dream_transit', 'shoot', 'p2'],
    label: '射击模式',
  },
  {
    move: 'playShootDreamTransit',
    card: 'action_shoot_dream_transit',
    args: ['action_shoot_dream_transit', 'transit', 2],
    label: '穿梭模式',
  },
  { move: 'playUnlock', card: 'action_unlock', args: ['action_unlock'] },
  { move: 'playKick', card: 'action_kick', args: ['action_kick', 'p3'] },
  { move: 'playDreamTransit', card: 'action_dream_transit', args: ['action_dream_transit', 2] },
  { move: 'playTelekinesis', card: 'action_telekinesis', args: ['action_telekinesis', 'p3'] },
  { move: 'playGravity', card: 'action_gravity', args: ['action_gravity', ['p2']] },
  { move: 'playCreation', card: 'action_creation', args: ['action_creation'] },
  { move: 'playGraft', card: 'action_graft', args: ['action_graft'] },
  { move: 'playResonance', card: 'action_resonance', args: ['action_resonance', 'p2'] },
  { move: 'playShift', card: 'action_shift', args: ['action_shift', 'p2'] },
  { move: 'playPeek', card: 'action_dream_peek', args: ['action_dream_peek', 1] },
  {
    move: 'playPeekMaster',
    card: 'action_dream_peek',
    args: ['action_dream_peek', 'p2'],
    owner: 'pM',
    bribes: [{ id: 'b-1', status: 'dealt', heldBy: 'p2' }],
  },
  { move: 'playTimeStorm', card: 'action_time_storm', args: ['action_time_storm'] },
  {
    move: 'playNightmareUnlock',
    card: 'action_nightmare_unlock',
    args: ['action_nightmare_unlock', 1],
  },
];

function runCase(c: Case): SetupState | 'INVALID_MOVE' {
  const owner = c.owner ?? 'p1';
  let s = scene([id(c.card)], { currentPlayerID: owner });
  if (owner !== 'p1') {
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, hand: [] },
        [owner]: { ...s.players[owner]!, hand: [id(c.card)] },
      },
    };
  }
  if (c.bribes) s = withBribes(s, c.bribes);
  return callMove(s, c.move, c.args, { currentPlayer: owner });
}

describe('出牌记录对账', () => {
  it('用例覆盖出牌 move 表里的每一个 move', () => {
    expect([...new Set(CASES.map((c) => c.move))].sort()).toEqual(
      Object.keys(PLAY_MOVE_CARD_IDS).sort(),
    );
    for (const c of CASES) {
      expect(PLAY_MOVE_CARD_IDS[c.move], c.move).toContain(c.card);
    }
  });

  for (const c of CASES) {
    const name = c.label ? `${c.move}（${c.label}）` : c.move;
    it(`${name} 成功打出后，本回合打出过的牌恰好多出这一张`, () => {
      const r = runCase(c);
      expect(r, `${name} 应当被接受`).not.toBe('INVALID_MOVE');
      const s = r as SetupState;
      expect(s.playedCardsThisTurn).toEqual([c.card]);
      expect(s.lastPlayedCardThisTurn).toBe(c.card);
    });
  }

  it('打出解封时没有可应答的人（直接结算）也记一次', () => {
    let s = scene([id('action_unlock')]);
    s = {
      ...s,
      players: Object.fromEntries(
        Object.entries(s.players).map(([pid, p]) => [
          pid,
          pid === 'p1' ? p : { ...p, isAlive: false },
        ]),
      ),
    };
    const r = callMove(s, 'playUnlock', ['action_unlock']);
    expect(r).not.toBe('INVALID_MOVE');
    expect((r as SetupState).pendingUnlock).toBeNull();
    expect((r as SetupState).playedCardsThisTurn).toEqual(['action_unlock']);
  });

  it('被拒绝的出牌不记录', () => {
    // 手里没有这张牌
    const s = scene([]);
    expect(callMove(s, 'playCreation', ['action_creation'])).toBe('INVALID_MOVE');
    expect(s.playedCardsThisTurn).toEqual([]);
  });

  it('同回合连续打出两张牌，按顺序各记一次', () => {
    let s = scene([id('action_creation'), id('action_graft')]);
    s = callMove(s, 'playCreation', ['action_creation']) as SetupState;
    s = callMove(s, 'playGraft', ['action_graft']) as SetupState;
    expect(s.playedCardsThisTurn).toEqual(['action_creation', 'action_graft']);
    expect(s.lastPlayedCardThisTurn).toBe('action_graft');
  });
});
