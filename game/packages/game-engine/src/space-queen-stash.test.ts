// 空间女王·造物：任意玩家的弃牌阶段，你可以把 1 张手牌放置到牌库顶。
// 卡面没有写次数限制，所以每个弃牌阶段、每个玩家的回合都不限次数；它因此是回合外可以发起的 move。
// 经对局运行器驱动真实 move（发起者与回合主人分开传）。
// 对照：docs/manual/05-dream-thieves.md 空间女王（第 324 行技能、第 327-328 行详述
//   「可以在同伴的上位玩家弃牌阶段时，将1张【梦境穿梭剂】放置到牌库顶上」）；
//   docs/manual/03-game-flow.md「限一次」（只有技能后写着“限一次”才有次数限制）

import { describe, it, expect } from 'vitest';
import type { SetupState } from './setup.js';
import { applyMove, type MatchState } from './runner/matchRunner.js';
import { checkStateInvariants } from './engine/stateInvariants.js';
import { denyAction, OFF_TURN_MOVES } from './engine/actionRights.js';
import {
  c,
  fixedRandom,
  game,
  KICK,
  load,
  scene,
  SHOOT,
  TRANSIT,
  UNLOCK,
  withPlayer,
} from './testing/runnerHarness.js';

const QUEEN = c('thief_space_queen');

/** p1 是回合主人，处于 phase 阶段；p2 是空间女王（手里有穿梭剂和一张 KICK），梦主 pM */
function queenScene(
  phase: SetupState['turnPhase'] = 'discard',
  extra: Partial<SetupState> = {},
): SetupState {
  const G = scene(
    {
      p1: { layer: 1, hand: [KICK, SHOOT] },
      p2: { layer: 2, hand: [TRANSIT, KICK] },
      p3: { layer: 3, hand: [UNLOCK] },
      p4: { layer: 4, hand: [UNLOCK] },
      pM: { layer: 1, hand: [KICK] },
    },
    {
      currentPlayerID: 'p1',
      turnPhase: phase,
      deck: { cards: [UNLOCK, UNLOCK], discardPile: [] },
      ...extra,
    },
  );
  return withPlayer(G, 'p2', { characterId: QUEEN });
}

function stash(m: MatchState<SetupState> | SetupState, who: string, card: unknown) {
  const state = 'G' in m ? m : load(m);
  return applyMove(
    game,
    state,
    { playerID: who, move: 'useSpaceQueenStashTop', args: [card] },
    { random: fixedRandom(3) },
  );
}

function mustStash(m: MatchState<SetupState> | SetupState, who: string, card: unknown) {
  const res = stash(m, who, card);
  expect(res.ok, res.ok ? '' : `被拒绝：${res.reason}`).toBe(true);
  if (!res.ok) throw new Error('unreachable');
  expect(checkStateInvariants(res.state.G)).toEqual([]);
  return res.state;
}

describe('空间女王·造物：任意玩家的弃牌阶段', () => {
  it('别人（回合主人 p1）的弃牌阶段，空间女王以自己的名义把手牌放到牌库顶', () => {
    const before = queenScene();
    const after = mustStash(before, 'p2', TRANSIT);
    expect(after.G.players.p2!.hand).toEqual([KICK]);
    expect(after.G.deck.cards).toEqual([TRANSIT, UNLOCK, UNLOCK]);
    // 回合归属与阶段都不变，回合主人的手牌不受影响
    expect(after.ctx.currentPlayer).toBe('p1');
    expect(after.G.turnPhase).toBe('discard');
    expect(after.G.players.p1!.hand).toEqual([KICK, SHOOT]);
  });

  it('自己的弃牌阶段照旧可以', () => {
    const G = queenScene('discard', { currentPlayerID: 'p2' });
    const after = mustStash(G, 'p2', KICK);
    expect(after.G.deck.cards[0]).toBe(KICK);
  });

  it('梦主的弃牌阶段也可以', () => {
    const G = queenScene('discard', { currentPlayerID: 'pM' });
    const after = mustStash(G, 'p2', KICK);
    expect(after.G.deck.cards[0]).toBe(KICK);
    expect(after.ctx.currentPlayer).toBe('pM');
  });

  it('同一个弃牌阶段可以连续发动多次（卡面没有次数限制）', () => {
    let m = load(queenScene());
    m = mustStash(m, 'p2', KICK);
    m = mustStash(m, 'p2', TRANSIT);
    expect(m.G.players.p2!.hand).toEqual([]);
    expect(m.G.deck.cards).toEqual([TRANSIT, KICK, UNLOCK, UNLOCK]);
  });

  it('不同玩家的弃牌阶段分别可以发动：不按回合累计限次', () => {
    let m = load(queenScene());
    m = mustStash(m, 'p2', KICK);
    // 换到下一位玩家的弃牌阶段
    const next = withPlayer({ ...m.G, currentPlayerID: 'p3' }, 'p2', { hand: [TRANSIT, KICK] });
    const again = mustStash(load(next), 'p2', TRANSIT);
    expect(again.G.deck.cards[0]).toBe(TRANSIT);
  });

  it('不在弃牌阶段（抽牌、出牌、回合开始）一律被拒绝，回合主人自己也一样', () => {
    for (const phase of ['draw', 'action', 'turnStart'] as const) {
      expect(stash(queenScene(phase), 'p2', KICK).ok, `${phase} 非回合主人`).toBe(false);
      const own = queenScene(phase, { currentPlayerID: 'p2' });
      expect(stash(own, 'p2', KICK).ok, `${phase} 回合主人`).toBe(false);
    }
  });

  it('不是空间女王的玩家被拒绝', () => {
    expect(stash(queenScene(), 'p3', UNLOCK).ok).toBe(false);
    expect(stash(queenScene(), 'p1', KICK).ok).toBe(false);
  });

  it('已死亡的空间女王被拒绝', () => {
    expect(stash(withPlayer(queenScene(), 'p2', { isAlive: false }), 'p2', KICK).ok).toBe(false);
  });

  it('牌不在手里、参数畸形被拒绝', () => {
    expect(stash(queenScene(), 'p2', UNLOCK).ok).toBe(false);
    for (const bad of [undefined, null, 1, {}, ['action_kick']]) {
      expect(stash(queenScene(), 'p2', bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it('有阻塞型待结算时，回合外的空间女王不能发动', () => {
    const G = queenScene('discard', {
      pendingGraft: { playerID: 'p3', cardId: c('action_graft'), targetLayer: 3 } as never,
    });
    expect(stash(G, 'p2', KICK).ok).toBe(false);
  });

  it('行动权表登记为回合外可发的 move', () => {
    expect(OFF_TURN_MOVES).toContain('useSpaceQueenStashTop');
    expect(denyAction(queenScene(), 'p2', 'useSpaceQueenStashTop')).toBeNull();
    // 没有登记的技能 move 仍然只有回合主人能发
    expect(denyAction(queenScene(), 'p2', 'playGaiaShift')).toBe('not_turn_owner');
  });

  it('回合外发动之后，回合主人仍可正常完成弃牌阶段', () => {
    const m = mustStash(queenScene(), 'p2', TRANSIT);
    const res = applyMove(game, m, { playerID: 'p1', move: 'skipDiscard', args: [] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state.G.currentPlayerID).not.toBe('p1');
  });
});
