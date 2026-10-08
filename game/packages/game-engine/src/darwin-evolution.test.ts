// 达尔文（thief_darwin.skill_0，卡面「淘汰」）：先抽牌库顶 2 张，挂起；达尔文从抽牌后的手牌里选刚好 2 张按顺序放回牌库顶
// 卡面：「你的出牌阶段，你可以将牌库顶2张牌收为手牌，然后将2张手牌按任意顺序放回牌库顶。每回合仅可使用一次。」
// （扩展角色，说明书没有收录，规则以卡面为准；对照 docs/manual/05-dream-thieves.md 其余角色的同类写法）
//
// 全部经对局运行器驱动真实 move。

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import { listAwaiting } from './engine/actionRights.js';
import { viewFor } from './engine/matchView.js';
import { DARWIN_SKILL_ID } from './engine/skills.js';
import { applyMove, eventsFor, type MatchState } from './runner/matchRunner.js';
import type { SetupState } from './setup.js';
import { fixedRandom, game, load, scene, withPlayer } from './testing/runnerHarness.js';

const c = (id: string) => id as CardID;
const KICK = c('action_kick');
const UNLOCK = c('action_unlock');
const SHOOT = c('action_shoot');
const GRAFT = c('action_graft');
const RESONANCE = c('action_resonance');
const CREATION = c('action_creation');
const PEEK = c('action_dream_peek');

/** 达尔文 p1 是回合主人，出牌阶段；手牌 [KICK, SHOOT]；牌库顶依次是 GRAFT、RESONANCE、CREATION、…… */
function darwinScene(): SetupState {
  const G = scene(
    {
      p1: { layer: 1, hand: [KICK, SHOOT] },
      p2: { layer: 1, hand: [PEEK] },
      p3: { layer: 2, hand: [PEEK] },
      pM: { layer: 1, hand: [] },
    },
    {
      turnPhase: 'action',
      currentPlayerID: 'p1',
      deck: {
        cards: [GRAFT, RESONANCE, CREATION, ...Array<CardID>(20).fill(UNLOCK)],
        discardPile: [],
      },
    },
  );
  return withPlayer(G, 'p1', { characterId: c('thief_darwin') });
}

function run(state: MatchState<SetupState>, playerID: string, move: string, args: unknown[] = []) {
  return applyMove(game, state, { playerID, move, args }, { random: fixedRandom(3) });
}

function mustRun(
  state: MatchState<SetupState>,
  playerID: string,
  move: string,
  args: unknown[] = [],
) {
  const res = run(state, playerID, move, args);
  if (!res.ok) throw new Error(`${move} by ${playerID} 被拒绝：${res.reason}`);
  return res;
}

function started(): MatchState<SetupState> {
  return mustRun(load(darwinScene()), 'p1', 'playDarwinEvolution').state;
}

describe('达尔文 · 发动（第 1 步：抽牌并挂起）', () => {
  it('发动不带任何牌：先抽牌库顶 2 张收入手牌，挂起等达尔文选牌，记一次使用', () => {
    const res = mustRun(load(darwinScene()), 'p1', 'playDarwinEvolution');
    const G = res.state.G;
    expect(G.players.p1!.hand).toEqual([KICK, SHOOT, GRAFT, RESONANCE]);
    expect(G.deck.cards.slice(0, 2)).toEqual([CREATION, UNLOCK]);
    expect(G.pendingDarwinReturn).toEqual({ playerID: 'p1' });
    expect(G.players.p1!.skillUsedThisTurn[DARWIN_SKILL_ID]).toBe(1);
    expect(G.turnPhase).toBe('action');
    expect(listAwaiting(G)).toContainEqual({
      field: 'pendingDarwinReturn',
      actors: ['p1'],
      moves: ['respondDarwinReturn'],
      blocking: true,
    });
  });

  it('牌库不足 2 张 / 不是达尔文 / 不在出牌阶段 / 已死亡 / 本回合已用过：不能发动，状态不变', () => {
    const base = darwinScene();
    const cases: SetupState[] = [
      { ...base, deck: { cards: [GRAFT], discardPile: [] } },
      withPlayer(base, 'p1', { characterId: c('thief_architect') }),
      { ...base, turnPhase: 'draw' },
      withPlayer(base, 'p1', { isAlive: false }),
      withPlayer(base, 'p1', { skillUsedThisTurn: { [DARWIN_SKILL_ID]: 1 } }),
    ];
    for (const G of cases) {
      const s = load(G);
      const res = run(s, 'p1', 'playDarwinEvolution');
      expect(res.ok).toBe(false);
      expect(res.state).toBe(s);
    }
  });

  it('旧的「放回哪两张」实参被忽略：发动那一步不会放回任何牌', () => {
    const res = mustRun(load(darwinScene()), 'p1', 'playDarwinEvolution', [[KICK, SHOOT]]);
    expect(res.state.G.players.p1!.hand).toEqual([KICK, SHOOT, GRAFT, RESONANCE]);
    expect(res.state.G.pendingDarwinReturn).toEqual({ playerID: 'p1' });
  });
});

describe('达尔文 · 选牌放回（第 2 步）', () => {
  it('可以选刚抽到的牌：选的先后就是放回顺序，第一张在最上面', () => {
    const s = started();
    const res = mustRun(s, 'p1', 'respondDarwinReturn', [[RESONANCE, KICK]]);
    const G = res.state.G;
    expect(G.deck.cards.slice(0, 3)).toEqual([RESONANCE, KICK, CREATION]);
    expect(G.players.p1!.hand).toEqual([SHOOT, GRAFT]);
    expect(G.pendingDarwinReturn).toBeNull();
    expect(res.state.ctx.currentPlayer).toBe('p1');
    // 之后正常出牌阶段继续
    expect(mustRun(res.state, 'p1', 'endActionPhase').ok).toBe(true);
  });

  it('两张都选刚抽到的牌也可以，原封不动放回', () => {
    const res = mustRun(started(), 'p1', 'respondDarwinReturn', [[GRAFT, RESONANCE]]);
    expect(res.state.G.deck.cards.slice(0, 2)).toEqual([GRAFT, RESONANCE]);
    expect(res.state.G.players.p1!.hand).toEqual([KICK, SHOOT]);
  });

  it('手里有同名牌时按张数计：同名的两张可以都放回，超出张数不行', () => {
    let G = darwinScene();
    G = withPlayer(G, 'p1', { hand: [KICK, KICK, SHOOT] });
    const s = mustRun(load(G), 'p1', 'playDarwinEvolution').state;
    expect(run(s, 'p1', 'respondDarwinReturn', [[KICK, KICK]]).ok).toBe(true);
    const bad = run(s, 'p1', 'respondDarwinReturn', [[GRAFT, GRAFT]]);
    expect(bad.ok).toBe(false);
  });

  it('必须刚好 2 张、都在手里；不对一律被拒绝，状态不变', () => {
    const s = started();
    for (const picks of [[], [KICK], [KICK, SHOOT, GRAFT], [KICK, CREATION], [PEEK, KICK]]) {
      const res = run(s, 'p1', 'respondDarwinReturn', [picks]);
      expect(res.ok, JSON.stringify(picks)).toBe(false);
      if (!res.ok) expect(res.reason).toBe('invalid_move');
      expect(res.state).toBe(s);
    }
    expect(run(s, 'p1', 'respondDarwinReturn', [KICK]).ok).toBe(false);
    expect(run(s, 'p1', 'respondDarwinReturn').ok).toBe(false);
  });

  it('只有达尔文本人能选牌，其他座位被拒绝，状态不变', () => {
    const s = started();
    for (const who of ['p2', 'p3', 'pM']) {
      const res = run(s, who, 'respondDarwinReturn', [[PEEK, PEEK]]);
      expect(res.ok, who).toBe(false);
      if (!res.ok) expect(res.reason).toBe('not_active');
      expect(res.state).toBe(s);
    }
  });

  it('没有挂起时发应答被拒绝', () => {
    const res = run(load(darwinScene()), 'p1', 'respondDarwinReturn', [[KICK, SHOOT]]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not_active');
  });
});

describe('达尔文 · 挂起期间的闸门与回合限次', () => {
  it('挂起期间其他 move 都被挡住：达尔文不能出牌 / 结束阶段 / 再次发动，别人也不能行动', () => {
    const s = started();
    for (const [who, move, args] of [
      ['p1', 'endActionPhase', []],
      ['p1', 'playKick', [KICK, 'p2']],
      ['p1', 'playDarwinEvolution', []],
      ['p2', 'endActionPhase', []],
      ['pM', 'endActionPhase', []],
    ] as const) {
      const res = run(s, who, move, [...args]);
      expect(res.ok, `${who} ${move}`).toBe(false);
      expect(res.state).toBe(s);
    }
  });

  it('选完牌后同一回合不能再发动', () => {
    const done = mustRun(started(), 'p1', 'respondDarwinReturn', [[GRAFT, RESONANCE]]).state;
    expect(run(done, 'p1', 'playDarwinEvolution').ok).toBe(false);
  });
});

describe('达尔文 · 信息隔离', () => {
  const options = { gameOver: false };

  it('挂起中：所有座位看到同样的 { playerID }；别人的视图里没有抽到的牌，只有手牌张数', () => {
    const s = started();
    for (const viewer of ['p1', 'p2', 'p3', 'pM', null]) {
      expect(viewFor(s.G, viewer, options).pendingDarwinReturn, String(viewer)).toEqual({
        playerID: 'p1',
      });
    }
    for (const viewer of ['p2', 'p3', 'pM', null]) {
      const text = JSON.stringify(viewFor(s.G, viewer, options));
      expect(text, String(viewer)).not.toContain(GRAFT);
      expect(text, String(viewer)).not.toContain(RESONANCE);
    }
    expect(viewFor(s.G, 'p2', options).players.p1!.handCount).toBe(4);
    expect(viewFor(s.G, 'p2', options).players.p1!.hand).toBeNull();
    expect(JSON.stringify(viewFor(s.G, 'p1', options))).toContain(GRAFT);
  });

  it('放回后：牌库只有张数，放回的是哪两张、什么顺序，别人和本人的视图里都读不到', () => {
    const done = mustRun(started(), 'p1', 'respondDarwinReturn', [[RESONANCE, KICK]]).state;
    for (const viewer of ['p1', 'p2', 'p3', 'pM', null]) {
      const v = viewFor(done.G, viewer, options);
      expect(v.deck.cardCount).toBe(done.G.deck.cards.length);
      expect(JSON.stringify(v.deck)).not.toContain(RESONANCE);
      expect(v.pendingDarwinReturn).toBeNull();
    }
  });

  it('事件：抽到的牌只给达尔文；选牌的参数只给达尔文；其他人的事件里没有这些牌', () => {
    const first = mustRun(load(darwinScene()), 'p1', 'playDarwinEvolution');
    const second = mustRun(first.state, 'p1', 'respondDarwinReturn', [[RESONANCE, KICK]]);
    for (const viewer of ['p2', 'p3', 'pM', null]) {
      const seen = JSON.stringify([
        ...eventsFor(first.events, viewer),
        ...eventsFor(second.events, viewer),
      ]);
      expect(seen, String(viewer)).not.toContain(GRAFT);
      expect(seen, String(viewer)).not.toContain(RESONANCE);
      expect(seen, String(viewer)).not.toContain(KICK);
    }
    const mine = JSON.stringify(eventsFor(first.events, 'p1'));
    expect(mine).toContain(GRAFT);
    expect(mine).toContain(RESONANCE);
    const drawn = first.events.find((e) => e.kind === 'cards_drawn')!;
    expect(drawn.data).toEqual({ player: 'p1', count: 2 });
  });

  it('等待清单的变化是公开的，且不带牌', () => {
    const first = mustRun(load(darwinScene()), 'p1', 'playDarwinEvolution');
    const ev = first.events.find((e) => e.kind === 'awaiting_changed')!;
    expect(ev.data).toEqual({
      awaiting: [
        {
          field: 'pendingDarwinReturn',
          actors: ['p1'],
          moves: ['respondDarwinReturn'],
          blocking: true,
        },
      ],
    });
    expect(ev).not.toHaveProperty('secret');
  });
});
