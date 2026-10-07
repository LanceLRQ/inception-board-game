// 棋局世界观接线：使用【梦境窥视】时，使用者从牌库顶抽 2 张牌。
// 对照：docs/manual/06-dream-master.md 棋局（106-115 行）：
//   「使用【梦境窥视】时，从牌库顶抽2张牌」「在这个世界观里，每当使用【梦境窥视】，都必须从牌库顶抽2张牌」
// 世界观对所有玩家生效，两个出牌入口（盗梦者效果①、梦主效果②）都要接；经真实 move 驱动。

import { describe, it, expect } from 'vitest';
import type { CardID } from '@icgame/shared';
import { applyChessWorldViewPeek } from './engine/skills.js';
import { checkStateInvariants } from './engine/stateInvariants.js';
import type { SetupState } from './setup.js';
import { applyMove } from './runner/matchRunner.js';
import { withBribes } from './testing/fixtures.js';
import { c, fixedRandom, game, KICK, load, scene, withPlayer } from './testing/runnerHarness.js';

const PEEK = c('action_dream_peek');
const CHESS = c('dm_chess');
const FORTRESS = c('dm_fortress');

function peekScene(
  masterChar: CardID = CHESS,
  deckSize = 30,
  current: 'p1' | 'pM' = 'p1',
): SetupState {
  let G = scene(
    {
      p1: { layer: 1, hand: [PEEK] },
      p2: { layer: 1, hand: [KICK] },
      p3: { layer: 2, hand: [KICK] },
      p4: { layer: 2, hand: [KICK] },
      pM: { layer: 3, hand: [PEEK] },
    },
    { currentPlayerID: current, turnPhase: 'action' },
  );
  G = withPlayer(G, 'pM', { characterId: masterChar });
  const cards = Array.from({ length: deckSize }, (_, i) => c(`card_${i}`));
  return { ...G, deck: { cards, discardPile: [] } };
}

function ok(G: SetupState, playerID: string, move: string, args: unknown[] = []) {
  const res = applyMove(game, load(G), { playerID, move, args }, { random: fixedRandom(3) });
  expect(res.ok, `${move} 应被接受`).toBe(true);
  if (!res.ok) throw new Error(`${move} 被拒绝：${res.reason}`);
  return res;
}

describe('棋局世界观 · 盗梦者使用梦境窥视（效果①）', () => {
  it('使用者从牌库顶抽 2 张，窥视流程照常进行', () => {
    const G = withBribes(peekScene(), [{ id: 'bribe-0', kind: 'fail', status: 'inPool' }]);
    const after = ok(G, 'p1', 'playPeek', [PEEK, 2]).state.G;
    // 窥视牌弃掉，抽到牌库顶的 card_0、card_1
    expect(after.players.p1!.hand).toEqual([c('card_0'), c('card_1')]);
    expect(after.deck.cards).toHaveLength(28);
    expect(after.deck.discardPile).toEqual([PEEK]);
    expect(after.pendingPeekDecision).toEqual({ peekerID: 'p1', targetLayer: 2 });
    expect(checkStateInvariants(after)).toEqual([]);
  });

  it('贿赂池已空的无负担窥视也抽 2 张', () => {
    const after = ok(peekScene(), 'p1', 'playPeek', [PEEK, 2]).state.G;
    expect(after.players.p1!.hand).toHaveLength(2);
    expect(after.peekReveal).toEqual({ peekerID: 'p1', revealKind: 'vault', vaultLayer: 2 });
  });

  it('牌库只剩 1 张：抽到空为止', () => {
    const after = ok(peekScene(CHESS, 1), 'p1', 'playPeek', [PEEK, 2]).state.G;
    expect(after.players.p1!.hand).toEqual([c('card_0')]);
    expect(after.deck.cards).toHaveLength(0);
  });

  it('梦主不是棋局：不抽牌', () => {
    const after = ok(peekScene(FORTRESS), 'p1', 'playPeek', [PEEK, 2]).state.G;
    expect(after.players.p1!.hand).toEqual([]);
    expect(after.deck.cards).toHaveLength(30);
  });

  it('同一回合连续使用两张：各抽 2 张', () => {
    let G = peekScene();
    G = withPlayer(G, 'p1', { hand: [PEEK, PEEK] });
    let after = ok(G, 'p1', 'playPeek', [PEEK, 2]).state.G;
    after = ok(after, 'p1', 'peekerAcknowledge').state.G;
    after = ok(after, 'p1', 'playPeek', [PEEK, 3]).state.G;
    expect(after.players.p1!.hand).toHaveLength(4);
    expect(after.deck.cards).toHaveLength(26);
  });

  it('抽到的牌只出现在使用者本人的 cards_drawn 秘密里', () => {
    const res = ok(peekScene(), 'p1', 'playPeek', [PEEK, 2]);
    const drawn = res.events.filter((e) => e.kind === 'cards_drawn');
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.data).toEqual({ player: 'p1', count: 2 });
    expect(drawn[0]!.secret).toEqual({
      to: ['p1'],
      data: { cards: [c('card_0'), c('card_1')] },
    });
  });
});

describe('棋局世界观 · 梦主使用梦境窥视（效果②）', () => {
  function masterScene(masterChar: CardID = CHESS): SetupState {
    const G = peekScene(masterChar, 30, 'pM');
    return withBribes(G, [{ id: 'bribe-0', kind: 'fail', status: 'dealt', heldBy: 'p2' }]);
  }

  it('梦主使用者本人抽 2 张', () => {
    const after = ok(masterScene(), 'pM', 'playPeekMaster', [PEEK, 'p2']).state.G;
    expect(after.players.pM!.hand).toEqual([c('card_0'), c('card_1')]);
    expect(after.deck.cards).toHaveLength(28);
    expect(after.peekReveal).toMatchObject({ peekerID: 'pM', revealKind: 'bribe' });
    expect(checkStateInvariants(after)).toEqual([]);
  });

  it('梦主不是棋局：不抽牌', () => {
    const after = ok(masterScene(FORTRESS), 'pM', 'playPeekMaster', [PEEK, 'p2']).state.G;
    expect(after.players.pM!.hand).toEqual([]);
  });
});

describe('棋局世界观 · 纯函数', () => {
  it('谁使用谁抽：不限于梦主', () => {
    const G = peekScene();
    const next = applyChessWorldViewPeek(G, 'p3');
    expect(next.players.p3!.hand.slice(-2)).toEqual([c('card_0'), c('card_1')]);
    expect(next.players.pM!.hand).toEqual(G.players.pM!.hand);
  });

  it('梦主不是棋局时原样返回', () => {
    const G = peekScene(FORTRESS);
    expect(applyChessWorldViewPeek(G, 'p1')).toBe(G);
  });
});
