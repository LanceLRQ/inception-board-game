// 雅典娜·急智（thief_athena.skill_0）：另一同层盗梦者对雅典娜使用行动牌时，在该牌结算前给雅典娜一个可放弃的应答，
// 从弃牌堆里选取 1 张牌收入手牌；每个不同玩家的回合各一次。
// 对照：docs/manual/05-dream-thieves.md:160-170 雅典娜
//   技能：「每当另一同层盗梦者对你使用行动牌时，你可以先从弃牌堆选取1张牌收入手牌。回合限1次」
//   详述：「【急智】在每个不同玩家的回合都能使用一次，一轮下来可以多次使用。」
//        「【急智】注意使用时机仅限同层的盗梦者，而且是在使用时候进行检定。」
//        「玩家使用【念力牵引】，若不在同一层，则无法触发【急智】技能。」
//
// 全部经对局运行器驱动真实 move。

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import { listAwaiting } from './engine/actionRights.js';
import { viewFor } from './engine/matchView.js';
import { applyMove, eventsFor, type MatchState } from './runner/matchRunner.js';
import type { SetupState } from './setup.js';
import { ATHENA_WIT_TRIGGER_MOVES } from './engine/athenaWit.js';
import { fixedRandom, game, load, scene, withPlayer } from './testing/runnerHarness.js';

const c = (id: string) => id as CardID;
const KICK = c('action_kick');
const SHOOT = c('action_shoot');
const GRAFT = c('action_graft');
const RESONANCE = c('action_resonance');
const CREATION = c('action_creation');
const PEEK = c('action_dream_peek');
const TELEKINESIS = c('action_telekinesis');
const UNLOCK = c('action_unlock');

/**
 * p1 是回合主人（盗梦者，出牌阶段），手牌 [KICK, RESONANCE, SHOOT, TELEKINESIS, CREATION]；
 * p2 是雅典娜（第 1 层，手牌 [PEEK]）；p3 同层的盗梦者；p4 在第 2 层；pM 是梦主，也在第 1 层。
 * 弃牌堆 [GRAFT, UNLOCK, PEEK]：要选的牌不在最上面。
 */
function athenaScene(extra: Partial<SetupState> = {}): SetupState {
  const G = scene(
    {
      p1: { layer: 1, hand: [KICK, RESONANCE, SHOOT, TELEKINESIS, CREATION] },
      p2: { layer: 1, hand: [PEEK] },
      p3: { layer: 1, hand: [UNLOCK] },
      p4: { layer: 2, hand: [PEEK] },
      pM: { layer: 1, hand: [] },
    },
    {
      turnPhase: 'action',
      currentPlayerID: 'p1',
      deck: { cards: Array<CardID>(30).fill(KICK), discardPile: [GRAFT, UNLOCK, PEEK] },
      ...extra,
    },
  );
  return withPlayer(G, 'p2', { characterId: c('thief_athena') });
}

function run(
  state: MatchState<SetupState>,
  playerID: string,
  move: string,
  args: unknown[] = [],
  roll = 3,
) {
  return applyMove(game, state, { playerID, move, args }, { random: fixedRandom(roll) });
}

function mustRun(
  state: MatchState<SetupState>,
  playerID: string,
  move: string,
  args: unknown[] = [],
  roll = 3,
) {
  const res = run(state, playerID, move, args, roll);
  if (!res.ok) throw new Error(`${move} by ${playerID} 被拒绝：${res.reason}`);
  return res;
}

/** p1 对雅典娜 p2 打出共鸣，挂起雅典娜的应答 */
function resonanceOnAthena(extra: Partial<SetupState> = {}) {
  return mustRun(load(athenaScene(extra)), 'p1', 'playResonance', [RESONANCE, 'p2']);
}

describe('雅典娜·急智 · 触发与挂起', () => {
  it('同层盗梦者对雅典娜用行动牌：该牌不立即结算，挂起雅典娜的应答；牌仍在出牌者手里，弃牌堆不变', () => {
    const before = load(athenaScene());
    const res = resonanceOnAthena();
    const G = res.state.G;
    expect(G.pendingAthenaWit).toMatchObject({
      athenaID: 'p2',
      userID: 'p1',
      cardId: RESONANCE,
    });
    expect(G.players.p1!.hand).toEqual(before.G.players.p1!.hand);
    expect(G.players.p2!.hand).toEqual([PEEK]);
    expect(G.deck.discardPile).toEqual([GRAFT, UNLOCK, PEEK]);
    expect(G.pendingResonance).toBeNull();
    expect(G.playedCardsThisTurn).toEqual([]);
    expect(listAwaiting(G)).toContainEqual({
      field: 'pendingAthenaWit',
      actors: ['p2'],
      moves: ['respondAthenaWit'],
      blocking: true,
    });
  });

  it('各种以玩家为目标的行动牌都会触发：SHOOT、KICK、念力牵引', () => {
    for (const [move, args] of [
      ['playShoot', ['p2', SHOOT]],
      ['playKick', [KICK, 'p2']],
      ['playTelekinesis', [TELEKINESIS, 'p2']],
    ] as const) {
      const res = mustRun(load(athenaScene()), 'p1', move, [...args]);
      expect(res.state.G.pendingAthenaWit, move).toMatchObject({ athenaID: 'p2', userID: 'p1' });
    }
  });

  it('覆盖的出牌 move 都真实存在于对局定义里', () => {
    const moves = Object.keys(game.phases.playing!.moves!);
    for (const name of ATHENA_WIT_TRIGGER_MOVES) expect(moves, name).toContain(name);
  });

  it('意念判官·定罪打出的是真实的 SHOOT 牌：触发', () => {
    let G = athenaScene();
    G = withPlayer(G, 'p1', { characterId: c('thief_sudger_of_mind') });
    const res = mustRun(load(G), 'p1', 'playShootSudger', ['p2', SHOOT]);
    expect(res.state.G.pendingAthenaWit).toMatchObject({ athenaID: 'p2', cardId: SHOOT });
  });

  it('SHOOT·梦境穿梭剂：选 SHOOT 方式对雅典娜触发，选穿梭方式（目标是层）不触发', () => {
    const card = c('action_shoot_dream_transit');
    const G = withPlayer(athenaScene(), 'p1', { hand: [card, card] });
    const shoot = mustRun(load(G), 'p1', 'playShootDreamTransit', [card, 'shoot', 'p2']);
    expect(shoot.state.G.pendingAthenaWit).toMatchObject({ athenaID: 'p2', cardId: card });
    const transit = mustRun(load(G), 'p1', 'playShootDreamTransit', [card, 'transit', 2]);
    expect(transit.state.G.pendingAthenaWit ?? null).toBeNull();
  });

  it('万有引力的目标里有雅典娜：触发', () => {
    let G = athenaScene();
    G = withPlayer(G, 'p1', { hand: [c('action_gravity'), KICK] });
    const res = mustRun(load(G), 'p1', 'playGravity', [c('action_gravity'), ['p3', 'p2']]);
    expect(res.state.G.pendingAthenaWit).toMatchObject({ athenaID: 'p2', userID: 'p1' });
  });

  it('不是以雅典娜为目标：不触发，照常结算', () => {
    const res = mustRun(load(athenaScene()), 'p1', 'playKick', [KICK, 'p3']);
    expect(res.state.G.pendingAthenaWit ?? null).toBeNull();
    expect(res.state.G.deck.discardPile).toContain(KICK);
  });

  it('不以玩家为目标的牌不触发（创造、梦境穿梭剂）', () => {
    const res = mustRun(load(athenaScene()), 'p1', 'playCreation', [CREATION]);
    expect(res.state.G.pendingAthenaWit ?? null).toBeNull();
  });

  it('不在同一层：不触发（念力牵引把对方拉过来也不算，使用时检定）', () => {
    const G = athenaScene();
    const moved = withPlayer(G, 'p2', { currentLayer: 2 });
    const layers = {
      ...moved.layers,
      1: {
        ...moved.layers[1]!,
        playersInLayer: moved.layers[1]!.playersInLayer.filter((id) => id !== 'p2'),
      },
      2: { ...moved.layers[2]!, playersInLayer: [...moved.layers[2]!.playersInLayer, 'p2'] },
    };
    const res = mustRun(load({ ...moved, layers }), 'p1', 'playTelekinesis', [TELEKINESIS, 'p2']);
    expect(res.state.G.pendingAthenaWit ?? null).toBeNull();
    expect(res.state.G.players.p2!.currentLayer).toBe(1);
  });

  it('出牌的是梦主（不是盗梦者）：不触发', () => {
    let G = athenaScene({ currentPlayerID: 'pM' });
    G = withPlayer(G, 'pM', { hand: [KICK], characterId: c('dm_fortress') });
    const res = mustRun(load(G), 'pM', 'playKick', [KICK, 'p2']);
    expect(res.state.G.pendingAthenaWit ?? null).toBeNull();
  });

  it('雅典娜自己出牌（目标是别人，或没有「另一」盗梦者）：不触发', () => {
    let G = athenaScene({ currentPlayerID: 'p2' });
    G = withPlayer(G, 'p2', { hand: [KICK] });
    const res = mustRun(load(G), 'p2', 'playKick', [KICK, 'p3']);
    expect(res.state.G.pendingAthenaWit ?? null).toBeNull();
  });

  it('弃牌堆是空的：没有可选的牌，不触发', () => {
    const res = mustRun(
      load(athenaScene({ deck: { cards: Array<CardID>(30).fill(KICK), discardPile: [] } })),
      'p1',
      'playResonance',
      [RESONANCE, 'p2'],
    );
    expect(res.state.G.pendingAthenaWit ?? null).toBeNull();
    expect(res.state.G.pendingResonance).toMatchObject({ bonderPlayerID: 'p1' });
  });

  it('雅典娜已死亡 / 不是雅典娜：不触发', () => {
    const dead = withPlayer(athenaScene(), 'p2', { isAlive: false });
    const notAthena = withPlayer(athenaScene(), 'p2', { characterId: c('thief_architect') });
    for (const G of [dead, notAthena]) {
      const res = run(load(G), 'p1', 'playKick', [KICK, 'p2']);
      if (res.ok) expect(res.state.G.pendingAthenaWit ?? null).toBeNull();
    }
  });

  it('非法的出牌（牌不在手里）直接被拒绝，不会先挂起再卡住', () => {
    const s = load(athenaScene());
    const res = run(s, 'p1', 'playKick', [GRAFT, 'p2']);
    expect(res.ok).toBe(false);
    expect(res.state).toBe(s);
    const noCard = run(load(withPlayer(athenaScene(), 'p1', { hand: [] })), 'p1', 'playKick', [
      KICK,
      'p2',
    ]);
    expect(noCard.ok).toBe(false);
  });
});

describe('雅典娜·急智 · 应答', () => {
  it('从弃牌堆里选取任意 1 张（不一定是最上面的）收入手牌，随后该牌照常结算：共鸣拿走的手牌包含刚选的牌', () => {
    const pending = resonanceOnAthena().state;
    const res = mustRun(pending, 'p2', 'respondAthenaWit', [GRAFT]);
    const G = res.state.G;
    expect(G.pendingAthenaWit ?? null).toBeNull();
    // 先收入手牌，再被共鸣整手拿走：出牌者拿到雅典娜的 [PEEK, GRAFT]
    expect(G.players.p1!.hand).toEqual([KICK, SHOOT, TELEKINESIS, CREATION, PEEK, GRAFT]);
    expect(G.players.p2!.hand).toEqual([]);
    expect(G.pendingResonance).toMatchObject({ bonderPlayerID: 'p1', targetPlayerID: 'p2' });
    // 弃牌堆：少了选走的一张，多了刚打出的共鸣
    expect(G.deck.discardPile).toEqual([UNLOCK, PEEK, RESONANCE]);
    expect(G.playedCardsThisTurn).toEqual([RESONANCE]);
    expect(res.state.ctx.currentPlayer).toBe('p1');
  });

  it('可以放弃：不拿牌，该牌照常结算，且不算用掉本回合的急智', () => {
    const pending = resonanceOnAthena().state;
    const res = mustRun(pending, 'p2', 'respondAthenaWit', [null]);
    const G = res.state.G;
    expect(G.pendingAthenaWit ?? null).toBeNull();
    expect(G.players.p1!.hand).toEqual([KICK, SHOOT, TELEKINESIS, CREATION, PEEK]);
    expect(G.deck.discardPile).toEqual([GRAFT, UNLOCK, PEEK, RESONANCE]);
    // 放弃不算用过：同一回合再被用牌仍然触发（共鸣每回合限 1 张，改用 KICK）
    const again = mustRun(res.state, 'p1', 'playKick', [KICK, 'p2']);
    expect(again.state.G.pendingAthenaWit).toMatchObject({ athenaID: 'p2' });
  });

  it('选的牌不在弃牌堆里：被拒绝，仍然挂起，状态不变', () => {
    const pending = resonanceOnAthena().state;
    for (const pick of [KICK, SHOOT, c('no_such_card')]) {
      const res = run(pending, 'p2', 'respondAthenaWit', [pick]);
      expect(res.ok, String(pick)).toBe(false);
      if (!res.ok) expect(res.reason).toBe('invalid_move');
      expect(res.state).toBe(pending);
    }
  });

  it('参数形状不对（缺参数、数组、数字）被拒绝', () => {
    const pending = resonanceOnAthena().state;
    expect(run(pending, 'p2', 'respondAthenaWit').ok).toBe(false);
    expect(run(pending, 'p2', 'respondAthenaWit', [[GRAFT]]).ok).toBe(false);
    expect(run(pending, 'p2', 'respondAthenaWit', [5]).ok).toBe(false);
  });

  it('只有雅典娜本人能应答：出牌者与其他座位都被拒绝，状态不变', () => {
    const pending = resonanceOnAthena().state;
    for (const who of ['p1', 'p3', 'p4', 'pM']) {
      const res = run(pending, who, 'respondAthenaWit', [GRAFT]);
      expect(res.ok, who).toBe(false);
      if (!res.ok) expect(res.reason).toBe('not_active');
      expect(res.state).toBe(pending);
    }
  });

  it('没有挂起时发应答被拒绝', () => {
    const res = run(load(athenaScene()), 'p2', 'respondAthenaWit', [GRAFT]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not_active');
  });

  it('挂起期间其他 move 都被挡住：出牌者不能改出别的牌 / 结束阶段，雅典娜不能出牌', () => {
    const pending = resonanceOnAthena().state;
    for (const [who, move, args] of [
      ['p1', 'playKick', [KICK, 'p3']],
      ['p1', 'playResonance', [RESONANCE, 'p2']],
      ['p1', 'endActionPhase', []],
      ['p2', 'endActionPhase', []],
      ['p3', 'endActionPhase', []],
      ['pM', 'endActionPhase', []],
    ] as const) {
      const res = run(pending, who, move, [...args]);
      expect(res.ok, `${who} ${move}`).toBe(false);
      expect(res.state).toBe(pending);
    }
  });

  it('SHOOT 打在雅典娜身上：先选牌，再掷骰结算', () => {
    const pending = mustRun(load(athenaScene()), 'p1', 'playShoot', ['p2', SHOOT]).state;
    expect(pending.G.lastShootRoll).toBeNull();
    const res = mustRun(pending, 'p2', 'respondAthenaWit', [UNLOCK], 6);
    expect(res.state.G.players.p2!.hand).toContain(UNLOCK);
    expect(res.state.G.lastShootRoll).toBe(6);
    expect(res.state.G.pendingAthenaWit ?? null).toBeNull();
  });

  it('重放出牌被拒绝时不会卡死：雅典娜的收获保留，这次出牌作废', () => {
    const pending = resonanceOnAthena().state;
    // 构造一个重放必然失败的挂起：出牌者手里没有这张牌
    const stale: MatchState<SetupState> = {
      ...pending,
      G: {
        ...pending.G,
        players: { ...pending.G.players, p1: { ...pending.G.players.p1!, hand: [] } },
      },
    };
    const res = mustRun(stale, 'p2', 'respondAthenaWit', [GRAFT]);
    expect(res.state.G.pendingAthenaWit ?? null).toBeNull();
    expect(res.state.G.players.p2!.hand).toEqual([PEEK, GRAFT]);
    expect(res.state.G.pendingResonance).toBeNull();
  });
});

describe('雅典娜·急智 · 次数：每个不同玩家的回合各一次', () => {
  it('同一个玩家的回合里选过一次后，再对她用牌不再触发', () => {
    const first = resonanceOnAthena().state;
    const taken = mustRun(first, 'p2', 'respondAthenaWit', [GRAFT]).state;
    // 共鸣挂起了归还，先收尾，再用 KICK 打雅典娜
    const again = mustRun(taken, 'p1', 'playKick', [KICK, 'p2']);
    expect(again.state.G.pendingAthenaWit ?? null).toBeNull();
    expect(again.state.G.deck.discardPile).toContain(KICK);
  });

  it('换一个玩家的回合又可以用一次（次数不在雅典娜自己的回合才重置）', () => {
    const first = resonanceOnAthena().state;
    const taken = mustRun(first, 'p2', 'respondAthenaWit', [GRAFT]).state;
    // 下一个回合属于 p3（另一个盗梦者）：回合号加 1，p3 对雅典娜用牌
    let G = taken.G;
    G = {
      ...G,
      turnNumber: G.turnNumber + 1,
      currentPlayerID: 'p3',
      turnPhase: 'action',
      pendingResonance: null,
      players: { ...G.players, p3: { ...G.players.p3!, hand: [KICK] } },
    };
    const next = load(G);
    const res = mustRun(next, 'p3', 'playKick', [KICK, 'p2']);
    expect(res.state.G.pendingAthenaWit).toMatchObject({ athenaID: 'p2', userID: 'p3' });
  });

  it('旧的回合外 move useAthenaWit 已经不存在', () => {
    const res = run(load(athenaScene()), 'p2', 'useAthenaWit');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('unknown_move');
  });
});

describe('雅典娜·急智 · 信息隔离', () => {
  const options = { gameOver: false };

  it('挂起中：雅典娜是谁只有她本人看得到；出牌者与牌是公开的；目标和出牌的其他实参不进视图', () => {
    const G = resonanceOnAthena().state.G;
    const own = viewFor(G, 'p2', options).pendingAthenaWit!;
    expect(own).toEqual({ athenaID: 'p2', userID: 'p1', cardId: RESONANCE });
    for (const viewer of ['p1', 'p3', 'p4', 'pM', null]) {
      const v = viewFor(G, viewer, options).pendingAthenaWit!;
      expect(v, String(viewer)).toEqual({ athenaID: null, userID: 'p1', cardId: RESONANCE });
      expect(JSON.stringify(viewFor(G, viewer, options)), String(viewer)).not.toContain('"args"');
    }
    // 对局结束后全部公开
    expect(viewFor(G, 'p3', { gameOver: true }).pendingAthenaWit!.athenaID).toBe('p2');
  });

  it('等待清单事件：公开部分不点名雅典娜，只给她本人的秘密部分点名', () => {
    const res = resonanceOnAthena();
    const ev = res.events.find((e) => e.kind === 'awaiting_changed')!;
    expect(ev.data).toEqual({
      awaiting: [
        { field: 'pendingAthenaWit', actors: [], moves: ['respondAthenaWit'], blocking: true },
      ],
    });
    expect(ev.secret).toEqual({
      to: ['p2'],
      data: { actors: { pendingAthenaWit: ['p2'] } },
    });
    for (const viewer of ['p1', 'p3', 'p4', 'pM', null]) {
      const seen = eventsFor(res.events, viewer).find((e) => e.kind === 'awaiting_changed')!;
      expect(JSON.stringify(seen), String(viewer)).not.toContain('"p2"');
    }
  });

  it('选牌后：弃牌堆是公开的；这次出牌记在出牌者名下（不是雅典娜）', () => {
    const pending = resonanceOnAthena().state;
    const res = mustRun(pending, 'p2', 'respondAthenaWit', [GRAFT]);
    const played = res.events.filter((e) => e.kind === 'card_played');
    expect(played.map((e) => e.data)).toEqual([{ player: 'p1', card: RESONANCE }]);
    for (const viewer of ['p3', 'p4', 'pM', null]) {
      const v = viewFor(res.state.G, viewer, options);
      expect(v.players.p2!.hand).toBeNull();
      expect(v.players.p2!.handCount).toBe(0);
    }
  });
});
