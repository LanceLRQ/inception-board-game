// 自动行动判定 · 黑洞·吞噬 / 达尔文·淘汰 / 雅典娜·急智 / 土星·律令 的待应答状态
// 状态在真实对局建出的局面上改写；Bot 座位以应答者本人的名义代答，真人座位等真人，代答的 move 必须被引擎接受。

import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from '@icgame/game-engine';
import type { SetupState } from '@icgame/game-engine/setup';
import { applyMove, createMatch, type GameDef, type MatchState } from '@icgame/game-engine/runner';
import { nextAutoAction } from './autoAction.js';

const game: GameDef<SetupState> = InceptionCityGame;
type State = MatchState<SetupState>;

const KICK = 'action_kick';
const SHOOT = 'action_shoot';
const UNLOCK = 'action_unlock';
const PEEK = 'action_dream_peek';
const GRAFT = 'action_graft';
const NO_HUMAN = { humanPlayerIDs: [] as string[] };

function must(state: State, request: { playerID: string; move: string; args: unknown[] }): State {
  const res = applyMove(game, state, request);
  if (!res.ok) throw new Error(`${request.move} 被拒绝：${res.reason}`);
  return res.state;
}

/** 推进到某个盗梦者（不是梦主）当回合主人的抽牌阶段，全员在第 1 层 */
function thiefTurn(seed: string): State {
  const created = createMatch(game, { numPlayers: 5, setupData: { rngSeed: seed }, seed });
  let s = must(created, { playerID: created.ctx.currentPlayer, move: 'completeSetup', args: [] });
  for (let i = 0; i < 80; i++) {
    if (s.ctx.currentPlayer !== s.G.dreamMasterID && s.G.turnPhase === 'draw') {
      if (s.G.playerOrder.every((id) => s.G.players[id]!.currentLayer === 1)) return s;
    }
    const action = nextAutoAction(s, NO_HUMAN);
    if (!action) break;
    s = must(s, action);
  }
  throw new Error('没有推进到盗梦者的抽牌阶段');
}

function patchPlayers(
  state: State,
  patches: Record<string, Partial<SetupState['players'][string]>>,
  rest: Partial<SetupState> = {},
): State {
  const players = { ...state.G.players };
  for (const [id, patch] of Object.entries(patches)) players[id] = { ...players[id]!, ...patch };
  return { ...state, G: { ...state.G, ...rest, players } };
}

describe('自动行动 · 黑洞·吞噬', () => {
  function levyState() {
    const base = thiefTurn('auto-levy');
    const owner = base.ctx.currentPlayer;
    const others = base.G.playerOrder.filter((id) => id !== owner);
    const patches: Record<string, Partial<SetupState['players'][string]>> = {
      [owner]: { characterId: 'thief_black_hole' as never, hand: [UNLOCK as never] },
    };
    others.forEach((id, i) => {
      patches[id] = { hand: (i === others.length - 1 ? [] : [KICK, SHOOT]) as never };
    });
    const s = must(patchPlayers(base, patches), {
      playerID: owner,
      move: 'playBlackHoleLevy',
      args: [],
    });
    return { s, owner, others };
  }

  it('全员 Bot：按名单里第一个人的名义代交手牌第 1 张，反复执行直到交齐，抽牌阶段结束', () => {
    const { s: start, owner, others } = levyState();
    let s = start;
    const waiting = [...s.G.pendingBlackHoleLevy!.waiting];
    expect(waiting).toEqual(others.slice(0, -1));
    const first = nextAutoAction(s, NO_HUMAN)!;
    expect(first).toMatchObject({
      playerID: waiting[0],
      move: 'respondBlackHoleLevy',
      args: [KICK],
    });
    for (let i = 0; i < waiting.length; i++) s = must(s, nextAutoAction(s, NO_HUMAN)!);
    expect(s.G.pendingBlackHoleLevy ?? null).toBeNull();
    expect(s.G.turnPhase).toBe('action');
    expect(s.G.players[owner]!.hand.length).toBe(1 + waiting.length);
  });

  it('名单里有真人：先替 Bot 交，只剩真人时等待', () => {
    const { s } = levyState();
    const [human, bot] = s.G.pendingBlackHoleLevy!.waiting as [string, string];
    const opts = { humanPlayerIDs: [human] };
    const next = nextAutoAction(s, opts)!;
    expect(next.playerID).not.toBe(human);
    expect(next.playerID).toBe(bot);
    let cursor = s;
    while (
      cursor.G.pendingBlackHoleLevy &&
      cursor.G.pendingBlackHoleLevy.waiting.some((id) => id !== human)
    ) {
      cursor = must(cursor, nextAutoAction(cursor, opts)!);
    }
    expect(cursor.G.pendingBlackHoleLevy!.waiting).toEqual([human]);
    expect(nextAutoAction(cursor, opts)).toBeNull();
  });

  it('超时代答（全员视为自动）：真人也被代交', () => {
    const { s } = levyState();
    const [human] = s.G.pendingBlackHoleLevy!.waiting as [string];
    const action = nextAutoAction(s, NO_HUMAN)!;
    expect(action.playerID).toBe(human);
    expect(applyMove(game, s, action).ok).toBe(true);
  });
});

describe('自动行动 · 达尔文·淘汰', () => {
  function darwinState() {
    const base = thiefTurn('auto-darwin');
    const owner = base.ctx.currentPlayer;
    let s = patchPlayers(base, {
      [owner]: { characterId: 'thief_darwin' as never, hand: [KICK, SHOOT, UNLOCK] as never },
    });
    s = must(s, { playerID: owner, move: 'doDraw', args: [] });
    s = {
      ...s,
      G: { ...s.G, deck: { ...s.G.deck, cards: [GRAFT, PEEK, ...s.G.deck.cards] as never } },
    };
    s = must(s, { playerID: owner, move: 'playDarwinEvolution', args: [] });
    return { s, owner };
  }

  it('达尔文是 Bot / 超时：以达尔文本人的名义选手牌前 2 张放回，引擎接受', () => {
    const { s, owner } = darwinState();
    const action = nextAutoAction(s, NO_HUMAN)!;
    expect(action).toMatchObject({ playerID: owner, move: 'respondDarwinReturn' });
    expect(action.args).toEqual([s.G.players[owner]!.hand.slice(0, 2)]);
    const next = must(s, action);
    expect(next.G.pendingDarwinReturn ?? null).toBeNull();
  });

  it('达尔文是真人：等他选，返回 null', () => {
    const { s, owner } = darwinState();
    expect(nextAutoAction(s, { humanPlayerIDs: [owner] })).toBeNull();
  });
});

describe('自动行动 · 雅典娜·急智', () => {
  function witState() {
    const base = thiefTurn('auto-wit');
    const owner = base.ctx.currentPlayer;
    const athena = base.G.playerOrder.find((id) => id !== owner && id !== base.G.dreamMasterID)!;
    let s = patchPlayers(base, {
      [owner]: { hand: [KICK] as never },
      [athena]: { characterId: 'thief_athena' as never, hand: [] },
    });
    s = must(s, { playerID: owner, move: 'doDraw', args: [] });
    s = { ...s, G: { ...s.G, deck: { ...s.G.deck, discardPile: [GRAFT, PEEK] as never } } };
    s = must(s, { playerID: owner, move: 'playKick', args: [KICK, athena] });
    return { s, owner, athena };
  }

  it('雅典娜是 Bot / 超时：以她本人的名义放弃，引擎接受并继续结算那张牌', () => {
    const { s, athena } = witState();
    expect(s.G.pendingAthenaWit).toMatchObject({ athenaID: athena });
    const action = nextAutoAction(s, NO_HUMAN)!;
    expect(action).toMatchObject({ playerID: athena, move: 'respondAthenaWit', args: [null] });
    const next = must(s, action);
    expect(next.G.pendingAthenaWit ?? null).toBeNull();
    expect(next.G.deck.discardPile).toContain(KICK);
  });

  it('雅典娜是真人：等她选，返回 null；出牌者是真人、雅典娜是 Bot 时 Bot 代答', () => {
    const { s, owner, athena } = witState();
    expect(nextAutoAction(s, { humanPlayerIDs: [athena] })).toBeNull();
    expect(nextAutoAction(s, { humanPlayerIDs: [owner] })).toMatchObject({ playerID: athena });
  });
});

describe('自动行动 · 土星·律令', () => {
  /** 梦主是土星、手里有一张 KICK；回合主人打出 KICK，挂起梦主的应答 */
  function decreeState(masterHand: string[] = [KICK]) {
    const base = thiefTurn('auto-decree');
    const owner = base.ctx.currentPlayer;
    const master = base.G.dreamMasterID;
    const target = base.G.playerOrder.find((id) => id !== owner && id !== master)!;
    let s = patchPlayers(base, {
      [owner]: { hand: [KICK] as never },
      [master]: { characterId: 'dm_saturn_territory' as never, hand: masterHand as never },
    });
    s = must(s, { playerID: owner, move: 'doDraw', args: [] });
    s = must(s, { playerID: owner, move: 'playKick', args: [KICK, target] });
    return { s, owner, master };
  }

  it('梦主是 Bot / 超时：缺省放过，以梦主本人的名义发，引擎接受并继续结算那张牌', () => {
    const { s, master } = decreeState();
    expect(s.G.pendingSaturnDecree).toMatchObject({ masterID: master, cardId: KICK });
    const action = nextAutoAction(s, NO_HUMAN)!;
    expect(action).toMatchObject({ playerID: master, move: 'respondSaturnDecree', args: [null] });
    const next = must(s, action);
    expect(next.G.pendingSaturnDecree ?? null).toBeNull();
    expect(next.G.players[master]!.hand).toEqual([KICK]);
    expect(next.G.deck.discardPile).toContain(KICK);
  });

  it('梦主手里没有同名牌时同样放过', () => {
    const { s, master } = decreeState([UNLOCK]);
    const action = nextAutoAction(s, NO_HUMAN)!;
    expect(action).toMatchObject({ playerID: master, move: 'respondSaturnDecree', args: [null] });
    expect(must(s, action).G.pendingSaturnDecree ?? null).toBeNull();
  });

  it('梦主是真人：等他选，返回 null；出牌者是真人、梦主是 Bot 时 Bot 代答', () => {
    const { s, owner, master } = decreeState();
    expect(nextAutoAction(s, { humanPlayerIDs: [master] })).toBeNull();
    expect(nextAutoAction(s, { humanPlayerIDs: [owner] })).toMatchObject({ playerID: master });
  });
});
