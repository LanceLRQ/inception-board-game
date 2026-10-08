// 黑洞·吞噬（thief_black_hole.skill_0）：挂起 → 同层有手牌的每个其他玩家各自选 1 张交出 → 交齐后回合继续
// 对照：docs/manual/05-dream-thieves.md:150-158 黑洞（吞噬：抽牌阶段可以放弃抽牌，改为令所有当层的玩家各给你 1 张手牌，回合限 1 次）
//
// 全部经对局运行器驱动真实 move；交牌人自己决定交哪张，发动者不指明别人的牌。

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import { listAwaiting } from './engine/actionRights.js';
import { viewFor } from './engine/matchView.js';
import { BLACK_HOLE_LEVY_SKILL_ID } from './engine/skills.js';
import { applyMove, eventsFor, type MatchState } from './runner/matchRunner.js';
import type { SetupState } from './setup.js';
import { fixedRandom, game, load, scene, withPlayer } from './testing/runnerHarness.js';

const c = (id: string) => id as CardID;
const UNLOCK = c('action_unlock');
const KICK = c('action_kick');
const PEEK = c('action_dream_peek');
const SHOOT = c('action_shoot');
const CREATION = c('action_creation');

/**
 * 黑洞 p1 是回合主人，处于抽牌阶段，在第 1 层。
 * 同层：p2（两张牌）、p3（一张）、pM 梦主（一张）、p5（没手牌）；p4 在第 2 层（有手牌，不受影响）。
 */
function blackHoleScene(): SetupState {
  const G = scene(
    {
      p1: { layer: 1, hand: [UNLOCK] },
      p2: { layer: 1, hand: [KICK, PEEK] },
      p3: { layer: 1, hand: [SHOOT] },
      pM: { layer: 1, hand: [CREATION] },
      p4: { layer: 2, hand: [PEEK, PEEK] },
    },
    { turnPhase: 'draw', currentPlayerID: 'p1' },
  );
  const withFifth: SetupState = {
    ...G,
    players: {
      ...G.players,
      p5: { ...G.players.p4!, id: 'p5', nickname: 'p5', currentLayer: 1, hand: [] },
    },
    playerOrder: ['p1', 'p2', 'p3', 'p4', 'p5', 'pM'],
    layers: {
      ...G.layers,
      1: { ...G.layers[1]!, playersInLayer: [...G.layers[1]!.playersInLayer, 'p5'] },
    },
  };
  return withPlayer(withFifth, 'p1', { characterId: c('thief_black_hole') });
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
  return mustRun(load(blackHoleScene()), 'p1', 'playBlackHoleLevy').state;
}

describe('黑洞·吞噬 · 发动', () => {
  it('发动不带任何别人的牌：挂起，只等同层有手牌的其他玩家，抽牌阶段没有结束，也没有抽牌', () => {
    const before = load(blackHoleScene());
    const res = mustRun(before, 'p1', 'playBlackHoleLevy');
    const G = res.state.G;
    expect(G.pendingBlackHoleLevy).toEqual({ blackHoleID: 'p1', waiting: ['p2', 'p3', 'pM'] });
    expect(G.turnPhase).toBe('draw');
    expect(G.deck.cards).toEqual(before.G.deck.cards);
    expect(G.players.p1!.hand).toEqual([UNLOCK]);
    expect(G.players.p1!.skillUsedThisTurn[BLACK_HOLE_LEVY_SKILL_ID]).toBe(1);
    expect(listAwaiting(G)).toContainEqual({
      field: 'pendingBlackHoleLevy',
      actors: ['p2', 'p3', 'pM'],
      moves: ['respondBlackHoleLevy'],
      blocking: true,
    });
  });

  it('同层没有任何人给得出牌：不能发动，状态不变', () => {
    let G = blackHoleScene();
    for (const id of ['p2', 'p3', 'pM']) G = withPlayer(G, id, { hand: [] });
    const s = load(G);
    const res = run(s, 'p1', 'playBlackHoleLevy');
    expect(res.ok).toBe(false);
    expect(res.state).toBe(s);
  });

  it('不在抽牌阶段、不是黑洞、已死亡、本回合已用过都不能发动', () => {
    const base = blackHoleScene();
    const cases: SetupState[] = [
      { ...base, turnPhase: 'action' },
      withPlayer(base, 'p1', { characterId: c('thief_architect') }),
      withPlayer(base, 'p1', { isAlive: false }),
      withPlayer(base, 'p1', { skillUsedThisTurn: { [BLACK_HOLE_LEVY_SKILL_ID]: 1 } }),
    ];
    for (const G of cases) {
      const s = load(G);
      const res = run(s, 'p1', 'playBlackHoleLevy');
      expect(res.ok).toBe(false);
      expect(res.state).toBe(s);
    }
  });

  it('旧的「指明别人的牌」实参被忽略：不会据此交牌，仍然挂起等各人自己选', () => {
    const s = mustRun(load(blackHoleScene()), 'p1', 'playBlackHoleLevy', [
      { p2: KICK, p3: SHOOT, pM: CREATION },
    ]).state;
    expect(s.G.pendingBlackHoleLevy!.waiting).toEqual(['p2', 'p3', 'pM']);
    expect(s.G.players.p2!.hand).toEqual([KICK, PEEK]);
    expect(s.G.players.p1!.hand).toEqual([UNLOCK]);
  });
});

describe('黑洞·吞噬 · 交牌', () => {
  it('每个人自己决定交哪张，全部交齐后抽牌阶段结束、黑洞没有额外抽牌', () => {
    let s = started();
    s = mustRun(s, 'p2', 'respondBlackHoleLevy', [PEEK]).state;
    expect(s.G.pendingBlackHoleLevy!.waiting).toEqual(['p3', 'pM']);
    expect(s.G.players.p2!.hand).toEqual([KICK]);
    expect(s.G.players.p1!.hand).toEqual([UNLOCK, PEEK]);
    expect(s.G.turnPhase).toBe('draw');
    s = mustRun(s, 'pM', 'respondBlackHoleLevy', [CREATION]).state;
    s = mustRun(s, 'p3', 'respondBlackHoleLevy', [SHOOT]).state;
    expect(s.G.pendingBlackHoleLevy).toBeNull();
    expect(s.G.turnPhase).toBe('action');
    expect(s.G.players.p1!.hand).toEqual([UNLOCK, PEEK, CREATION, SHOOT]);
    expect(s.G.players.p3!.hand).toEqual([]);
    expect(s.G.players.pM!.hand).toEqual([]);
    // 没手牌的、别的层的人不受影响
    expect(s.G.players.p5!.hand).toEqual([]);
    expect(s.G.players.p4!.hand).toEqual([PEEK, PEEK]);
    expect(s.G.deck.cards.length).toBe(30);
    expect(s.ctx.currentPlayer).toBe('p1');
  });

  it('应答顺序不限：谁先选谁先交', () => {
    let s = started();
    s = mustRun(s, 'pM', 'respondBlackHoleLevy', [CREATION]).state;
    s = mustRun(s, 'p3', 'respondBlackHoleLevy', [SHOOT]).state;
    expect(s.G.pendingBlackHoleLevy!.waiting).toEqual(['p2']);
    s = mustRun(s, 'p2', 'respondBlackHoleLevy', [KICK]).state;
    expect(s.G.turnPhase).toBe('action');
    expect(s.G.players.p1!.hand).toEqual([UNLOCK, CREATION, SHOOT, KICK]);
  });

  it('不在名单里的人（别层的、没手牌的、黑洞自己）发应答被拒绝，状态不变', () => {
    const s = started();
    for (const who of ['p4', 'p5', 'p1']) {
      const res = run(s, who, 'respondBlackHoleLevy', [PEEK]);
      expect(res.ok, who).toBe(false);
      if (!res.ok) expect(res.reason).toBe('not_active');
      expect(res.state).toBe(s);
    }
  });

  it('已经交过的人不能再交', () => {
    const s = mustRun(started(), 'p2', 'respondBlackHoleLevy', [KICK]).state;
    const res = run(s, 'p2', 'respondBlackHoleLevy', [PEEK]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not_active');
  });

  it('交出不在自己手里的牌被拒绝，状态不变', () => {
    const s = started();
    const res = run(s, 'p2', 'respondBlackHoleLevy', [SHOOT]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('invalid_move');
    expect(res.state).toBe(s);
  });

  it('参数形状不对（缺牌、牌号不是字符串）被拒绝', () => {
    const s = started();
    expect(run(s, 'p2', 'respondBlackHoleLevy').ok).toBe(false);
    expect(run(s, 'p2', 'respondBlackHoleLevy', [7]).ok).toBe(false);
    expect(run(s, 'p2', 'respondBlackHoleLevy', [[KICK]]).ok).toBe(false);
  });
});

describe('黑洞·吞噬 · 挂起期间的闸门', () => {
  it('其他 move 都被挡住：黑洞不能抽牌 / 跳过 / 结束回合，交牌人不能出牌', () => {
    const s = started();
    for (const [who, move, args] of [
      ['p1', 'doDraw', []],
      ['p1', 'skipDraw', []],
      ['p1', 'playJokerGamble', []],
      ['p1', 'playBlackHoleLevy', []],
      ['p1', 'endActionPhase', []],
      ['p2', 'playKick', [KICK, 'p3']],
      ['pM', 'endActionPhase', []],
    ] as const) {
      const res = run(s, who, move, [...args]);
      expect(res.ok, `${who} ${move}`).toBe(false);
      expect(res.state).toBe(s);
    }
  });

  it('没有挂起时，任何人发应答都被拒绝', () => {
    const s = load(blackHoleScene());
    const res = run(s, 'p2', 'respondBlackHoleLevy', [KICK]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not_active');
  });
});

describe('黑洞·吞噬 · 回合限次', () => {
  it('交齐之后同一回合不能再发动（抽牌阶段已结束）；技能记录为 1 次', () => {
    let s = started();
    for (const [who, card] of [
      ['p2', KICK],
      ['p3', SHOOT],
      ['pM', CREATION],
    ] as const) {
      s = mustRun(s, who, 'respondBlackHoleLevy', [card]).state;
    }
    expect(s.G.players.p1!.skillUsedThisTurn[BLACK_HOLE_LEVY_SKILL_ID]).toBe(1);
    expect(run(s, 'p1', 'playBlackHoleLevy').ok).toBe(false);
  });
});

describe('黑洞·吞噬 · 信息隔离', () => {
  const SECRET = c('action_telekinesis');

  /** p2 手里有一张只有它自己知道的牌；p2 交出它之后，只有 p2 和黑洞知道是哪张 */
  function afterSecretGive() {
    let G = blackHoleScene();
    G = withPlayer(G, 'p2', { hand: [KICK, SECRET] });
    G = { ...G, deck: { cards: Array<CardID>(30).fill(UNLOCK), discardPile: [UNLOCK] } };
    G = withPlayer(G, 'p1', { hand: [UNLOCK] });
    const s = mustRun(load(G), 'p1', 'playBlackHoleLevy').state;
    return mustRun(s, 'p2', 'respondBlackHoleLevy', [SECRET]);
  }

  it('挂起中的视图只有黑洞与名单，没有牌；所有座位看到的挂起内容相同', () => {
    const s = started();
    const options = { gameOver: false };
    const views = ['p1', 'p2', 'p3', 'p4', 'pM', null].map((v) => viewFor(s.G, v, options));
    for (const v of views) {
      expect(v.pendingBlackHoleLevy).toEqual({ blackHoleID: 'p1', waiting: ['p2', 'p3', 'pM'] });
    }
  });

  it('交出的那张牌：只有交牌人与黑洞的视图里有，其他座位与旁观者的视图里没有', () => {
    const res = afterSecretGive();
    const options = { gameOver: false };
    for (const viewer of ['p1', 'p2']) {
      const text = JSON.stringify(viewFor(res.state.G, viewer, options));
      if (viewer === 'p1') expect(text).toContain(SECRET);
      // 交牌人自己的手里已经没有这张牌
      else expect(text).not.toContain(SECRET);
    }
    for (const viewer of ['p3', 'p4', 'p5', 'pM', null]) {
      expect(JSON.stringify(viewFor(res.state.G, viewer, options)), String(viewer)).not.toContain(
        SECRET,
      );
    }
    // 其他人只知道张数
    expect(viewFor(res.state.G, 'p3', options).players.p1!.handCount).toBe(2);
    expect(viewFor(res.state.G, 'p3', options).players.p1!.hand).toBeNull();
  });

  it('事件：交出的牌号不出现在任何其他座位能看到的事件里（只有交牌人的 move 参数里有）', () => {
    const res = afterSecretGive();
    for (const viewer of ['p3', 'p4', 'p5', 'pM', null, 'p1']) {
      const seen = JSON.stringify(eventsFor(res.events, viewer));
      expect(seen, String(viewer)).not.toContain(SECRET);
    }
    expect(JSON.stringify(eventsFor(res.events, 'p2'))).toContain(SECRET);
  });

  it('等待清单的变化是公开的（名单本身是同层有手牌的人，手牌张数本来公开）', () => {
    const res = afterSecretGive();
    const ev = res.events.find((e) => e.kind === 'awaiting_changed')!;
    expect(ev.data).toEqual({
      awaiting: [
        {
          field: 'pendingBlackHoleLevy',
          actors: ['p3', 'pM'],
          moves: ['respondBlackHoleLevy'],
          blocking: true,
        },
      ],
    });
    expect(ev).not.toHaveProperty('secret');
  });
});
