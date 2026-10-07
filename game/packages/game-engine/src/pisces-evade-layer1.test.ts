// 双鱼·游离在第 1 层也能发动：从第 1 层游离就是进入迷失层，不算被击杀。
// 全部经对局运行器驱动真实 move。
// 对照：docs/manual/05-dream-thieves.md 双鱼（详述：「当你在第一层梦境时，同样能启动【游离】进入迷失层」）

import { describe, it, expect } from 'vitest';
import type { CardID } from '@icgame/shared';
import type { SetupState } from './setup.js';
import { applyMove } from './runner/matchRunner.js';
import { checkStateInvariants } from './engine/stateInvariants.js';
import {
  c,
  game,
  KICK,
  SHOOT,
  TURN,
  fixedRandom,
  load,
  scene,
  withPlayer,
} from './testing/runnerHarness.js';

function duelScene(pisceslayer: 1 | 2, piscesHand: CardID[]): SetupState {
  const base = scene(
    {
      p1: { layer: pisceslayer, hand: piscesHand },
      p2: { layer: 3, hand: [KICK] },
      p3: { layer: 1, hand: [KICK] },
      p4: { layer: 3, hand: [KICK] },
      pM: { layer: pisceslayer, hand: [SHOOT, KICK] },
    },
    { currentPlayerID: 'pM' },
  );
  return withPlayer(base, 'p1', { characterId: c('thief_pisces') });
}

describe('双鱼·游离：第 1 层', () => {
  it('被 SHOOT 获得应答机会，游离后进入迷失层，不交牌、攻击者不增加手牌、角色翻面', () => {
    const hand = [KICK, UNLOCK_CARD, KICK];
    const start = duelScene(1, hand);
    const shoot = applyMove(
      game,
      load(start),
      { playerID: 'pM', move: 'playShoot', args: ['p1', SHOOT] },
      { random: fixedRandom(1) },
    );
    expect(shoot.ok).toBe(true);
    if (!shoot.ok) return;
    // 没掷骰：先挂起应答窗口
    expect(shoot.state.G.pendingShootResponse?.targetPlayerID).toBe('p1');
    expect(shoot.state.G.pendingShootResponse?.responseType).toBe('pisces');

    const evade = applyMove(game, shoot.state, {
      playerID: 'p1',
      move: 'respondShootEvade',
      args: [],
    });
    expect(evade.ok).toBe(true);
    if (!evade.ok) return;
    const G = evade.state.G;
    const p = G.players.p1!;
    expect(p.isAlive).toBe(false);
    expect(p.currentLayer).toBe(0);
    expect(p.deathTurn).toBe(TURN);
    expect(p.hand).toEqual(hand);
    expect(G.layers[0]?.playersInLayer).toContain('p1');
    expect(G.layers[1]!.playersInLayer).not.toContain('p1');
    // 攻击者：手牌只少了打出的 SHOOT，没拿到任何牌，也没有击杀计数
    expect(G.players.pM!.hand).toEqual([KICK]);
    expect(G.players.pM!.shootCount).toBe(0);
    // 翻到背面
    expect(p.characterId).not.toBe('thief_pisces');
    expect(checkStateInvariants(G)).toEqual([]);
  });

  it('第 2 层游离仍是移到第 1 层（原有行为不变）', () => {
    const start = duelScene(2, [KICK]);
    const shoot = applyMove(
      game,
      load(start),
      { playerID: 'pM', move: 'playShoot', args: ['p1', SHOOT] },
      { random: fixedRandom(1) },
    );
    expect(shoot.ok).toBe(true);
    if (!shoot.ok) return;
    const evade = applyMove(game, shoot.state, {
      playerID: 'p1',
      move: 'respondShootEvade',
      args: [],
    });
    expect(evade.ok).toBe(true);
    if (!evade.ok) return;
    const p = evade.state.G.players.p1!;
    expect(p.isAlive).toBe(true);
    expect(p.currentLayer).toBe(1);
  });
});

const UNLOCK_CARD = c('action_unlock');
