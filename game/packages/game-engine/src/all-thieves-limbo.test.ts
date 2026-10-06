// 盗梦者全部在迷失层不是终局：胜负只看秘密金库与牌库；迷失层的玩家仍可在自己回合复活自己。
// 经对局运行器驱动真实 move。
// 对照：docs/manual/03-game-flow.md 胜负条件（19–20 行）与迷失层、复活

import { describe, it, expect } from 'vitest';
import type { CardID } from '@icgame/shared';
import type { SetupState } from './setup.js';
import { applyMove } from './runner/matchRunner.js';
import { sendToLimbo } from './engine/death.js';
import { checkStateInvariants } from './engine/stateInvariants.js';
import { fixedRandom, game, KICK, load, scene } from './testing/runnerHarness.js';

const endIf = (G: SetupState) => game.endIf?.({ G, ctx: { phase: 'playing' } } as never);

/** 四名盗梦者全在迷失层，轮到 p1 的抽牌阶段；梦主在第 2 层 */
function allInLimbo(extra: Partial<SetupState> = {}): SetupState {
  let G = scene(
    {
      p1: { layer: 1, hand: [KICK, KICK, KICK] },
      p2: { layer: 1, hand: [KICK] },
      p3: { layer: 2, hand: [KICK] },
      p4: { layer: 3, hand: [KICK] },
      pM: { layer: 2, hand: [KICK] },
    },
    { currentPlayerID: 'p1', turnPhase: 'draw', ...extra },
  );
  for (const id of ['p1', 'p2', 'p3', 'p4']) G = sendToLimbo(G, id);
  return G;
}

describe('盗梦者全部在迷失层', () => {
  it('不结束对局', () => {
    expect(endIf(allInLimbo())).toBeUndefined();
  });

  it('牌库耗尽时仍判梦主胜', () => {
    const G = allInLimbo({ deck: { cards: [], discardPile: [KICK] } });
    expect(endIf(G)).toEqual({ winner: 'master', reason: 'deck_exhausted' });
  });

  it('轮到其中一人：抽牌、出牌阶段复活自己、结束回合，回合顺延到下一个座位', () => {
    const rnd = { random: fixedRandom(3) };
    let m = load(allInLimbo());
    const step = (playerID: string, move: string, args: unknown[] = []) => {
      const res = applyMove(game, m, { playerID, move, args }, rnd);
      expect(res.ok, `${move} 应被接受`).toBe(true);
      if (!res.ok) throw new Error(`${move} 被拒绝`);
      m = res.state;
    };
    const handBefore = m.G.players.p1!.hand.length;
    step('p1', 'doDraw');
    expect(m.G.turnPhase).toBe('action');
    expect(m.G.players.p1!.hand.length).toBeGreaterThan(handBefore);
    step('p1', 'playRevive', [null, [KICK, KICK] as CardID[]]);
    expect(m.G.players.p1!.isAlive).toBe(true);
    expect(m.G.players.p1!.currentLayer).toBe(1);
    step('p1', 'endActionPhase');
    expect(m.G.turnPhase).toBe('discard');
    step('p1', 'skipDiscard');
    expect(m.ctx.currentPlayer).toBe('p2');
    expect(m.ctx.gameover).toBeUndefined();
    expect(checkStateInvariants(m.G)).toEqual([]);
  });

  it('梦主的回合照常：全员迷失层时轮到梦主可抽牌并结束回合', () => {
    const rnd = { random: fixedRandom(3) };
    let m = load(allInLimbo({ currentPlayerID: 'pM', turnPhase: 'draw' }));
    for (const move of ['doDraw', 'endActionPhase', 'skipDiscard']) {
      const res = applyMove(game, m, { playerID: 'pM', move, args: [] }, rnd);
      expect(res.ok, `${move} 应被接受`).toBe(true);
      if (!res.ok) throw new Error(`${move} 被拒绝`);
      m = res.state;
    }
    expect(m.ctx.currentPlayer).toBe('p1');
    expect(m.ctx.gameover).toBeUndefined();
  });
});
