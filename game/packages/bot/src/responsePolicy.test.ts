// 回合外应答策略：解封响应窗口、土星·律令

import { describe, it, expect } from 'vitest';
import { viewFor } from '@icgame/game-engine';
import type { CardID } from '@icgame/shared';
import { applyMove } from '@icgame/game-engine/runner';
import { planResponses } from './actionPolicy.js';
import { actionScene, game, seatIds, type State } from './playScene.js';

const plan = (s: State, who: string) => planResponses(viewFor(s.G, who, { gameOver: false }), who);

function play(s: State, playerID: string, move: string, args: unknown[]): State {
  const r = applyMove(game, s, { playerID, move, args });
  if (!r.ok) throw new Error(`${move} 被拒绝：${r.reason}`);
  return r.state;
}

/** 盗梦者 t0 打出解封，窗口打开 */
function unlockWindow(hands: { master: string[]; t1: string[] }): {
  s: State;
  master: string;
  t0: string;
  t1: string;
} {
  const base = actionScene({
    actor: 0,
    seats: {
      t0: { layer: 2, hand: ['action_unlock'] },
      t1: { layer: 2, hand: hands.t1 },
      master: { layer: 3, hand: hands.master },
    },
  });
  const { master, thieves } = seatIds(base.G);
  const s = play(base, thieves[0]!, 'playUnlock', ['action_unlock']);
  return { s, master, t0: thieves[0]!, t1: thieves[1]! };
}

describe('planResponses · 解封响应窗口', () => {
  it('梦主手里有解封、解封者是盗梦者：抵消', () => {
    const { s, master } = unlockWindow({ master: ['action_unlock'], t1: ['action_unlock'] });
    expect(plan(s, master)).toMatchObject([{ move: 'respondCancelUnlock', args: [] }]);
  });

  it('同阵营的盗梦者不抵消同伴的解封', () => {
    const { s, t1 } = unlockWindow({ master: ['action_unlock'], t1: ['action_unlock'] });
    expect(plan(s, t1)).toEqual([]);
  });

  it('没有解封可抵消：不给候选', () => {
    const { s, master } = unlockWindow({ master: ['action_kick'], t1: ['action_unlock'] });
    expect(plan(s, master)).toEqual([]);
  });

  it('已翻开的对立阵营解封者：盗梦者抵消', () => {
    const { s, t0, t1 } = unlockWindow({ master: ['action_unlock'], t1: ['action_unlock'] });
    const revealed: State = {
      ...s,
      G: {
        ...s.G,
        players: {
          ...s.G.players,
          [t0]: { ...s.G.players[t0]!, faction: 'master', isRevealed: true },
        },
      },
    };
    expect(plan(revealed, t1)).toMatchObject([{ move: 'respondCancelUnlock' }]);
  });

  it('没有窗口、窗口不是解封：不给候选', () => {
    const s = actionScene({ actor: 0, seats: { master: { layer: 2, hand: ['action_unlock'] } } });
    expect(plan(s, seatIds(s.G).master)).toEqual([]);
  });
});

describe('planResponses · 土星·律令', () => {
  function decree(
    masterHand: string[],
    played = 'action_kick',
    target?: string,
  ): {
    s: State;
    master: string;
  } {
    const base = actionScene({
      actor: 0,
      saturn: true,
      seats: {
        t0: { layer: 2, hand: [played] },
        t1: { layer: 2, hand: [] },
        master: { layer: 3, hand: masterHand },
      },
    });
    const { master, thieves } = seatIds(base.G);
    const args =
      played === 'action_kick'
        ? [played, target ?? thieves[1]!]
        : played === 'action_dream_transit'
          ? [played, 3]
          : [thieves[1]!, played];
    const move =
      played === 'action_kick'
        ? 'playKick'
        : played === 'action_dream_transit'
          ? 'playDreamTransit'
          : 'playShoot';
    const s = play(base, thieves[0]!, move, args);
    expect(s.G.pendingSaturnDecree).not.toBeNull();
    return { s, master };
  }

  it('有同名牌：弃 1 张抵消', () => {
    const { s, master } = decree(['action_kick', 'action_unlock']);
    expect(plan(s, master)).toMatchObject([{ move: 'respondSaturnDecree', args: ['action_kick'] }]);
  });

  it('没有同名牌：不给候选（由放过兜底）', () => {
    const { s, master } = decree(['action_unlock', 'action_creation']);
    expect(plan(s, master)).toEqual([]);
  });

  it('跨名同名：SHOOT·梦境穿梭剂可抵消梦境穿梭剂，完全相同的 id 优先', () => {
    const { s, master } = decree(
      ['action_shoot_dream_transit', 'action_dream_transit'],
      'action_dream_transit',
    );
    const out = plan(s, master);
    expect(out.map((p) => p.args[0])).toEqual([
      'action_dream_transit',
      'action_shoot_dream_transit',
    ]);
  });

  it('SHOOT 同名牌：混合牌也算，普通 SHOOT 优先', () => {
    const { s, master } = decree(['action_shoot_dream_transit', 'action_shoot'], 'action_shoot');
    expect(plan(s, master).map((p) => p.args[0])).toEqual([
      'action_shoot',
      'action_shoot_dream_transit',
    ]);
  });

  it('只给梦主本人候选', () => {
    const { s } = decree(['action_kick']);
    expect(plan(s, seatIds(s.G).thieves[1]!)).toEqual([]);
  });

  it('改动他人手牌内容不改变决策', () => {
    const { s, master } = decree(['action_kick']);
    const { thieves } = seatIds(s.G);
    const altered: State = {
      ...s,
      G: {
        ...s.G,
        players: {
          ...s.G.players,
          [thieves[1]!]: { ...s.G.players[thieves[1]!]!, hand: ['action_graft'] as CardID[] },
        },
      },
    };
    expect(plan(altered, master)).toEqual(plan(s, master));
  });
});
