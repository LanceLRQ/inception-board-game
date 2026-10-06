// 背叛者对外仍是盗梦者：守卫与效果只按公开信息判断，对背叛者与普通盗梦者的行为必须一致，
// 从外部分辨不出谁被策反了。每条用例都有「背叛者 p3」与「持有失败贿赂牌的普通盗梦者 p2」的对照。
// 全部经对局运行器驱动真实 move。
// 对照：docs/manual/03-game-flow.md 贿赂&背叛者（38–43 行）；docs/manual/04-action-cards.md 移形换影、
//       梦境窥视、解封；docs/manual/07-nightmare-cards.md 深空坠落、邪念瘟疫；docs/manual/06-dream-master.md

import { describe, it, expect } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from './setup.js';
import { applyMove } from './runner/matchRunner.js';
import { viewFor } from './engine/matchView.js';
import { matchOutcome } from './engine/outcome.js';
import { checkStateInvariants } from './engine/stateInvariants.js';
import {
  applyApolloWorship,
  applyHarborTsunami,
  applyMercuryReverse,
  isDreamMaster,
  isOutwardThief,
} from './engine/skills.js';
import { sendToLimbo } from './engine/death.js';
import {
  c,
  fixedRandom,
  game,
  KICK,
  UNLOCK,
  load,
  scene,
  withPlayer,
} from './testing/runnerHarness.js';
import { withBribes } from './testing/fixtures.js';

const SHIFT = c('action_shift');
const PEEK = c('action_dream_peek');

/**
 * p3 是背叛者（faction 已转为 master，持有成功的贿赂牌）；
 * p2 是持有一张失败贿赂牌的普通盗梦者；池里还剩一张可派的失败贿赂牌。
 */
function table(
  extra: Partial<SetupState> = {},
  placements: Record<string, { layer: number; hand: CardID[] }> = {},
): SetupState {
  const base = scene(
    {
      p1: { layer: 1, hand: [KICK, KICK] },
      p2: { layer: 1, hand: [KICK, KICK] },
      p3: { layer: 1, hand: [KICK, KICK] },
      p4: { layer: 1, hand: [KICK, KICK] },
      pM: { layer: 1, hand: [KICK, KICK] },
      ...placements,
    },
    extra,
  );
  const marked = withPlayer(withPlayer(base, 'p3', { faction: 'master', bribeReceived: 1 }), 'p2', {
    bribeReceived: 1,
  });
  return withBribes(marked, [
    { id: 'held-deal', kind: 'deal', status: 'deal', heldBy: 'p3', originalOwnerId: 'p3' },
    { id: 'held-fail', kind: 'fail', status: 'dealt', heldBy: 'p2', originalOwnerId: 'p2' },
    { id: 'pool-fail', kind: 'fail', status: 'inPool' },
  ]);
}

function play(G: SetupState, playerID: string, move: string, args: unknown[], roll = 3) {
  return applyMove(game, load(G), { playerID, move, args }, { random: fixedRandom(roll) });
}

function okPlay(G: SetupState, playerID: string, move: string, args: unknown[], roll = 3) {
  const res = play(G, playerID, move, args, roll);
  expect(res.ok, `${move} 应被接受`).toBe(true);
  if (!res.ok) throw new Error(`${move} 被拒绝`);
  return res.state.G;
}

/** 对 p2 与 p3 各跑一遍，返回两边是否被接受 */
function acceptedFor(run: (target: string) => boolean): { thief: boolean; betrayer: boolean } {
  return { thief: run('p2'), betrayer: run('p3') };
}

describe('公开判断', () => {
  it('isDreamMaster 只认 dreamMasterID；isOutwardThief 包含背叛者、不含梦主', () => {
    const G = table();
    expect(isDreamMaster(G, 'pM')).toBe(true);
    expect(isDreamMaster(G, 'p3')).toBe(false);
    expect(isOutwardThief(G, 'p3')).toBe(true);
    expect(isOutwardThief(G, 'p2')).toBe(true);
    expect(isOutwardThief(G, 'pM')).toBe(false);
    expect(isOutwardThief(G, 'nobody')).toBe(false);
  });
});

describe('移形换影', () => {
  it('盗梦者对背叛者使用与对普通盗梦者一样被接受', () => {
    const G = table({ currentPlayerID: 'p1' }, { p1: { layer: 1, hand: [SHIFT] } });
    const r = acceptedFor((t) => play(G, 'p1', 'playShift', [SHIFT, t]).ok);
    expect(r).toEqual({ thief: true, betrayer: true });
  });

  it('对梦主一律被拒绝：普通盗梦者与背叛者作为使用者结果相同', () => {
    const asThief = table({ currentPlayerID: 'p2' }, { p2: { layer: 1, hand: [SHIFT] } });
    const asBetrayer = table({ currentPlayerID: 'p3' }, { p3: { layer: 1, hand: [SHIFT] } });
    expect(play(asThief, 'p2', 'playShift', [SHIFT, 'pM']).ok).toBe(false);
    expect(play(asBetrayer, 'p3', 'playShift', [SHIFT, 'pM']).ok).toBe(false);
  });

  it('梦主对背叛者与对普通盗梦者都可以使用', () => {
    const G = table({ currentPlayerID: 'pM' }, { pM: { layer: 1, hand: [SHIFT] } });
    const r = acceptedFor((t) => play(G, 'pM', 'playShift', [SHIFT, t]).ok);
    expect(r).toEqual({ thief: true, betrayer: true });
  });
});

describe('梦主对盗梦者的操作', () => {
  const masterTurn = () =>
    table({ currentPlayerID: 'pM' }, { pM: { layer: 1, hand: [PEEK, KICK] } });

  it('梦境窥视效果②：背叛者与普通盗梦者都可以作为目标', () => {
    const r = acceptedFor((t) => play(masterTurn(), 'pM', 'playPeekMaster', [PEEK, t]).ok);
    expect(r).toEqual({ thief: true, betrayer: true });
  });

  it('看完之后再派一张贿赂牌：背叛者与普通盗梦者都被接受，贿赂张数各加一', () => {
    for (const target of ['p2', 'p3']) {
      let G = okPlay(masterTurn(), 'pM', 'playPeekMaster', [PEEK, target]);
      G = okPlay(G, 'pM', 'peekerAcknowledge', []);
      const before = G.players[target]!.bribeReceived;
      G = okPlay(G, 'pM', 'masterDealBribe', [target]);
      expect(G.players[target]!.bribeReceived).toBe(before + 1);
      expect(checkStateInvariants(G)).toEqual([]);
    }
  });

  it('皇城·重金指定派发：背叛者与普通盗梦者都被接受', () => {
    const G = withPlayer(masterTurn(), 'pM', { characterId: c('dm_imperial_city') });
    const poolIndex = G.bribePool.findIndex((b) => b.status === 'inPool');
    const r = acceptedFor((t) => play(G, 'pM', 'masterDealBribeImperial', [t, poolIndex]).ok);
    expect(r).toEqual({ thief: true, betrayer: true });
  });

  it('梦主不能把贿赂牌派给自己', () => {
    expect(play(masterTurn(), 'pM', 'masterDealBribe', ['pM']).ok).toBe(false);
  });
});

describe('梦魇对「盗梦者」的筛选', () => {
  const NIGHTMARE_LAYER = 1 as Layer;

  function nightmareTable(nightmareId: string): SetupState {
    const G = table(
      { currentPlayerID: 'pM' },
      {
        p1: { layer: 2, hand: [KICK] },
        p4: { layer: 3, hand: [KICK] },
        pM: { layer: 2, hand: [KICK] },
      },
    );
    return {
      ...G,
      layers: {
        ...G.layers,
        1: { ...G.layers[1]!, nightmareId: c(nightmareId), nightmareRevealed: true },
      },
    };
  }

  const activate = (G: SetupState, roll: number) =>
    okPlay(G, 'pM', 'masterActivateNightmare', [NIGHTMARE_LAYER, { bribedTargets: [] }], roll);

  it('深空坠落：同层的背叛者与普通盗梦者都要掷骰（5 → 迷失层）', () => {
    const after = activate(nightmareTable('nightmare_space_fall'), 5);
    for (const id of ['p2', 'p3']) {
      expect(after.players[id]!.isAlive).toBe(false);
      expect(after.players[id]!.currentLayer).toBe(0);
    }
  });

  it('深空坠落：掷出 2 → 两人都移到第 2 层', () => {
    const after = activate(nightmareTable('nightmare_space_fall'), 2);
    for (const id of ['p2', 'p3']) {
      expect(after.players[id]!.isAlive).toBe(true);
      expect(after.players[id]!.currentLayer).toBe(2);
    }
  });

  it('邪念瘟疫：两人手里都有贿赂牌，都不受影响', () => {
    const after = activate(nightmareTable('nightmare_plague'), 1);
    for (const id of ['p2', 'p3']) {
      expect(after.players[id]!.isAlive).toBe(true);
      expect(after.players[id]!.currentLayer).toBe(1);
    }
  });
});

describe('【解封】效果①', () => {
  it('背叛者与普通盗梦者都可以打出', () => {
    for (const id of ['p2', 'p3']) {
      const G = table({ currentPlayerID: id }, { [id]: { layer: 1, hand: [UNLOCK, KICK] } });
      expect(play(G, id, 'playUnlock', [UNLOCK]).ok, `${id} 打出解封`).toBe(true);
    }
  });
});

describe('冥王星·地狱世界观', () => {
  it('抽牌阶段：背叛者与普通盗梦者都按骰值抽牌', () => {
    const drawn: Record<string, number> = {};
    for (const id of ['p2', 'p3']) {
      const base = table({ currentPlayerID: id, turnPhase: 'draw' });
      const G = withPlayer(base, 'pM', { characterId: c('dm_pluto_hell') });
      const before = G.players[id]!.hand.length;
      const after = okPlay(G, id, 'doDraw', [], 4);
      drawn[id] = after.players[id]!.hand.length - before;
    }
    expect(drawn.p3).toBe(drawn.p2);
    expect(drawn.p2).toBe(4);
  });
});

describe('梦主专属 move 不对背叛者开放', () => {
  it('背叛者在自己的回合发梦主的 move：与普通盗梦者一样全部被拒绝', () => {
    const moves: [string, unknown[]][] = [
      ['masterDealBribe', ['p1']],
      ['dreamMasterMove', [2]],
      ['masterRevealNightmare', [1]],
      ['masterActivateNightmare', [1, { bribedTargets: [] }]],
    ];
    for (const id of ['p2', 'p3']) {
      const G = table({ currentPlayerID: id });
      for (const [move, args] of moves) {
        expect(play(G, id, move, args).ok, `${id} 发 ${move}`).toBe(false);
      }
    }
  });

  it('背叛者在迷失层、回合开始时不会被当成梦主自动复活', () => {
    const base = table({ currentPlayerID: 'p2', turnPhase: 'discard' });
    const G = sendToLimbo(base, 'p3');
    const after = okPlay(G, 'p2', 'skipDiscard', []);
    expect(after.currentPlayerID).toBe('p3');
    expect(after.players.p3!.isAlive).toBe(false);
    expect(after.players.p3!.currentLayer).toBe(0);
  });
});

describe('只对盗梦者生效的技能', () => {
  it('港口·海啸：背叛者与普通盗梦者同样要掷骰', () => {
    const G = withPlayer(table(), 'pM', { characterId: c('dm_harbor') });
    const after = applyHarborTsunami(G, [1, 1, 1, 1]);
    for (const id of ['p1', 'p2', 'p3', 'p4']) expect(after.players[id]!.isAlive).toBe(false);
    expect(after.players.pM!.isAlive).toBe(true);
  });

  it('阿波罗·崇拜：背叛者与普通盗梦者（都有贿赂牌）都可以作为目标', () => {
    const G = withPlayer(table(), 'p1', { characterId: c('thief_apollo') });
    expect(applyApolloWorship(G, 'p1', 'p2', 0)).not.toBeNull();
    expect(applyApolloWorship(G, 'p1', 'p3', 0)).not.toBeNull();
  });
});

describe('水星·航路 · 逆流', () => {
  /** 梦主是水星·航路，p3 / p2 在梦主同层出牌，梦主被 KICK，牌已进弃牌堆顶 */
  function mercury(): SetupState {
    const G = withPlayer(table(), 'pM', { characterId: c('dm_mercury_route') });
    return { ...G, deck: { ...G.deck, discardPile: [KICK] } };
  }

  it('另一拥有贿赂牌的盗梦者对梦主出牌：背叛者与持有失败贿赂牌的盗梦者都触发', () => {
    for (const id of ['p2', 'p3']) {
      const after = applyMercuryReverse(mercury(), id, KICK, 'pM');
      expect(after, `${id} 对梦主出牌`).not.toBeNull();
      expect(after!.players.pM!.hand.length).toBe(3);
    }
  });

  it('没有贿赂牌的盗梦者不触发', () => {
    expect(applyMercuryReverse(mercury(), 'p1', KICK, 'pM')).toBeNull();
  });
});

describe('胜负归属仍按真实阵营', () => {
  it('牌库抽完：梦主阵营胜，背叛者的真实阵营在对局结束后公开、之前对旁人隐藏', () => {
    const G = table({ deck: { cards: [], discardPile: [KICK] } });
    const result = game.endIf?.({ G, ctx: { phase: 'playing' } } as never);
    expect(matchOutcome(result, G)).toEqual({ winner: 'master', reason: 'deck_exhausted' });
    expect(G.players.p3!.faction).toBe('master');
    expect(viewFor(G, 'p1', { gameOver: true }).players.p3!.faction).toBe('master');
    expect(viewFor(G, 'p1', { gameOver: false }).players.p3!.faction).toBe('thief');
    expect(viewFor(G, 'p3', { gameOver: false }).players.p3!.faction).toBe('master');
  });

  it('背叛者做完这些操作后 faction 仍是 master', () => {
    const G = table({ currentPlayerID: 'p3' }, { p3: { layer: 1, hand: [UNLOCK, KICK] } });
    const after = okPlay(G, 'p3', 'playUnlock', [UNLOCK]);
    expect(after.players.p3!.faction).toBe('master');
  });
});
