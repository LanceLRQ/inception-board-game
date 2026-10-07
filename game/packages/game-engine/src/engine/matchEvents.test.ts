// 对局事件：每种领域事件都用运行器执行一个会触发它的真实 move 来验证
// 对照：docs/manual/03-game-flow.md 回合流程 / 贿赂；docs/manual/04-action-cards.md 解封、SHOOT、复活；
//       docs/manual/07-nightmare-cards.md 梦魇

import { describe, it, expect } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import { InceptionCityGame } from '../game.js';
import type { SetupState } from '../setup.js';
import { describeMatchEvents, MASKED_ACTOR_FIELDS } from './matchEvents.js';
import { viewFor } from './matchView.js';
import { buildViewScene } from '../testing/viewScene.js';
import { createTestState, makePlayer, withBribes } from '../testing/fixtures.js';
import {
  applyMove,
  eventsFor,
  createMatch,
  matchFromSnapshot,
  type ApplyMoveOptions,
  type GameDef,
  type MatchEvent,
  type MatchState,
} from '../runner/matchRunner.js';

const game: GameDef<SetupState> = InceptionCityGame;

const SHOOT = 'action_shoot' as CardID;
const KICK = 'action_kick' as CardID;
const UNLOCK = 'action_unlock' as CardID;
const CREATION = 'action_creation' as CardID;
const NIGHTMARE_A = 'nightmare_despair_storm' as CardID;
const NIGHTMARE_B = 'nightmare_hunger_bite' as CardID;

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

function load(G: SetupState): MatchState<SetupState> {
  return matchFromSnapshot<SetupState>({
    G,
    ctx: {
      numPlayers: G.playerOrder.length,
      playOrder: G.playerOrder,
      playOrderPos: G.playerOrder.indexOf(G.currentPlayerID),
      currentPlayer: G.currentPlayerID,
      phase: 'playing',
      turn: 1,
    },
    rngState: 1,
    stateID: 6,
  });
}

function dice(...rolls: number[]): ApplyMoveOptions {
  const queue = [...rolls];
  const next = (): number => (queue.length > 0 ? queue.shift()! : 4);
  return {
    random: {
      D6: next,
      Die: (sides: number) => Math.max(1, Math.min(sides, next())),
      Shuffle: <T>(arr: T[]): T[] => arr,
    },
  };
}

interface Stepped {
  state: MatchState<SetupState>;
  events: MatchEvent[];
}

function step(
  state: MatchState<SetupState>,
  playerID: string,
  move: string,
  args: unknown[] = [],
  options: ApplyMoveOptions = {},
): Stepped {
  const res = applyMove(game, state, { playerID, move, args }, options);
  if (!res.ok) throw new Error(`move ${move} by ${playerID} 被拒绝：${res.reason}`);
  return { state: res.state, events: res.events };
}

const kindsOf = (events: readonly MatchEvent[]): string[] => events.map((e) => e.kind);
const one = (events: readonly MatchEvent[], kind: string): MatchEvent => {
  const found = events.filter((e) => e.kind === kind);
  expect(found, `应恰有一条 ${kind}，实际事件：${kindsOf(events).join(',')}`).toHaveLength(1);
  return found[0]!;
};
const all = (events: readonly MatchEvent[], kind: string): MatchEvent[] =>
  events.filter((e) => e.kind === kind);

/** 4 人局：p1、p2、p3 盗梦者，pM 梦主；p1 是回合主人，处于指定回合阶段 */
function scene(
  turnPhase: SetupState['turnPhase'],
  overrides: Partial<SetupState> = {},
  players: Record<string, Partial<SetupState['players'][string]>> = {},
): SetupState {
  const base = createTestState({
    phase: 'playing',
    turnPhase,
    turnNumber: 1,
    currentPlayerID: 'p1',
    dreamMasterID: 'pM',
    playerOrder: ['p1', 'p2', 'p3', 'pM'],
    deck: { cards: [SHOOT, KICK, SHOOT, KICK, SHOOT, KICK, SHOOT, KICK], discardPile: [] },
  });
  const mk = (id: string, faction: 'thief' | 'master', layer: number, hand: CardID[]) =>
    makePlayer({
      id,
      faction,
      currentLayer: layer as Layer,
      hand,
      characterId: (faction === 'master' ? 'dm_fortress' : 'thief_sagittarius') as CardID,
      ...players[id],
    });
  const G: SetupState = {
    ...base,
    players: {
      p1: mk('p1', 'thief', 2, [SHOOT, UNLOCK, KICK]),
      p2: mk('p2', 'thief', 2, [KICK, KICK]),
      p3: mk('p3', 'thief', 1, [KICK]),
      pM: mk('pM', 'master', 1, [KICK]),
    },
    layers: {
      ...base.layers,
      1: { ...base.layers[1]!, playersInLayer: ['p3', 'pM'] },
      2: { ...base.layers[2]!, playersInLayer: ['p1', 'p2'] },
    },
    ...overrides,
  };
  return G;
}

// ---------------------------------------------------------------------------
// 基础约定
// ---------------------------------------------------------------------------

describe('事件 · 基础约定', () => {
  it('第一条固定是 move：发起者、招式名公开，参数只给发起者', () => {
    const { events, state } = step(load(scene('action')), 'p1', 'endActionPhase');
    const first = events[0]!;
    expect(first).toMatchObject({
      stateID: 7,
      index: 0,
      kind: 'move',
      actor: 'p1',
      data: { move: 'endActionPhase' },
      secret: { to: ['p1'], data: { args: [] } },
    });
    expect(state.stateID).toBe(7);
  });

  it('stateID 等于那一步之后的版本号，index 从 0 连续', () => {
    const { events } = step(load(scene('draw')), 'p1', 'doDraw');
    expect(events.length).toBeGreaterThan(2);
    expect(events.every((e) => e.stateID === 7)).toBe(true);
    expect(events.map((e) => e.index)).toEqual(events.map((_, i) => i));
  });

  it('被拒绝的 move 不产生事件', () => {
    const res = applyMove(game, load(scene('action')), {
      playerID: 'p2',
      move: 'doDraw',
      args: [],
    });
    expect(res.ok).toBe(false);
    expect(res).not.toHaveProperty('events');
    const bad = applyMove(game, load(scene('action')), {
      playerID: 'p1',
      move: 'noSuch',
      args: [],
    });
    expect(bad).not.toHaveProperty('events');
  });

  it('eventsFor：点名的观察者保留 secret，其他人（含旁观者）拿不到', () => {
    const events: MatchEvent[] = [
      {
        stateID: 1,
        index: 0,
        kind: 'x',
        actor: 'p1',
        data: { a: 1 },
        secret: { to: ['p1'], data: { s: 2 } },
      },
      { stateID: 1, index: 1, kind: 'y', actor: null, data: {} },
    ];
    expect(eventsFor(events, 'p1')[0]!.secret).toEqual({ to: ['p1'], data: { s: 2 } });
    expect(eventsFor(events, 'p2')[0]).not.toHaveProperty('secret');
    expect(eventsFor(events, null)[0]).not.toHaveProperty('secret');
    expect(eventsFor(events, 'p2')[0]!.data).toEqual({ a: 1 });
    // 没有 secret 的事件原样保留，也不改动输入
    expect(eventsFor(events, 'p2')[1]).toEqual(events[1]);
    expect(events[0]!.secret).toBeDefined();
  });

  it('eventsFor：返回的事件不与入参共享 data 与 secret 的引用', () => {
    const events: MatchEvent[] = [
      {
        stateID: 1,
        index: 0,
        kind: 'x',
        actor: 'p1',
        data: { a: 1 },
        secret: { to: ['p1'], data: { s: 2 } },
      },
    ];
    const mine = eventsFor(events, 'p1')[0]!;
    const theirs = eventsFor(events, 'p2')[0]!;
    expect(mine.data).not.toBe(events[0]!.data);
    expect(theirs.data).not.toBe(events[0]!.data);
    expect(mine.secret).not.toBe(events[0]!.secret);
    expect(mine.secret!.to).not.toBe(events[0]!.secret!.to);
    expect(mine.secret!.data).not.toBe(events[0]!.secret!.data);
    // 改动返回值不影响原事件
    mine.data.a = 99;
    mine.secret!.data.s = 99;
    expect(events[0]!.data.a).toBe(1);
    expect(events[0]!.secret!.data.s).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 抽牌、阶段、回合
// ---------------------------------------------------------------------------

describe('事件 · 抽牌与阶段', () => {
  it('cards_drawn：打出牌并抽牌的同一步，张数等于真实抽到的张数，且与 secret.cards 一致', () => {
    // 凭空造物：打出一张、抽两张，手牌净增一张；抽到的牌里还有一张与打出的牌同种
    const G = scene(
      'action',
      { deck: { cards: [CREATION, SHOOT, KICK, KICK], discardPile: [] } },
      { p1: { hand: [CREATION, KICK] } },
    );
    const { events, state } = step(load(G), 'p1', 'playCreation', [CREATION]);
    expect(state.G.players.p1!.hand).toEqual([KICK, CREATION, SHOOT]);
    const drawn = one(events, 'cards_drawn');
    expect(drawn.data).toEqual({ player: 'p1', count: 2 });
    expect(drawn.secret).toEqual({ to: ['p1'], data: { cards: [CREATION, SHOOT] } });
  });

  it('cards_drawn：别的玩家手里转来的牌不算抽牌（牌库没动时没有事件）', () => {
    const G = scene('action', {}, { p1: { hand: [KICK] }, p2: { hand: [SHOOT] } });
    const moved: SetupState = {
      ...G,
      players: {
        ...G.players,
        p1: { ...G.players.p1!, hand: [KICK, SHOOT] },
        p2: { ...G.players.p2!, hand: [] },
      },
    };
    const events = describeMatchEvents({
      before: G,
      after: moved,
      ctxBefore: load(G).ctx,
      ctxAfter: load(G).ctx,
      request: { playerID: 'p1', move: 'x', args: [] },
    });
    expect(events.filter((e) => e.kind === 'cards_drawn')).toEqual([]);
  });

  it('cards_drawn + phase_changed：张数公开，哪些牌只给本人', () => {
    const before = load(scene('draw'));
    const { events, state } = step(before, 'p1', 'doDraw');
    const drawn = one(events, 'cards_drawn');
    const newHand = state.G.players.p1!.hand.slice(before.G.players.p1!.hand.length);
    expect(drawn.data).toEqual({ player: 'p1', count: newHand.length });
    expect(drawn.data).not.toHaveProperty('cards');
    expect(drawn.secret).toEqual({ to: ['p1'], data: { cards: newHand } });
    expect(one(events, 'phase_changed').data).toEqual({ phase: 'action' });
    // 顺序：按表里从上到下，阶段变化在抽牌之前
    expect(kindsOf(events).indexOf('phase_changed')).toBeLessThan(
      kindsOf(events).indexOf('cards_drawn'),
    );
  });

  it('cards_discarded：弃牌堆增加的牌与张数公开', () => {
    const { events } = step(load(scene('discard')), 'p1', 'doDiscard', [[KICK]], {});
    const ev = one(events, 'cards_discarded');
    expect(ev.data).toMatchObject({ count: 1, cards: [KICK] });
    expect(ev.secret).toBeUndefined();
  });

  it('打出时间风暴：风暴自己移出游戏，翻开的 10 张牌（含另一张风暴）都在 cards_discarded 里', () => {
    const STORM = 'action_time_storm' as CardID;
    const flipped: CardID[] = [STORM, KICK, KICK, SHOOT, KICK, KICK, SHOOT, KICK, KICK, SHOOT];
    const G = scene(
      'action',
      { deck: { cards: [...flipped, KICK, KICK], discardPile: [] } },
      { p1: { hand: [STORM, KICK] } },
    );
    const { events, state } = step(load(G), 'p1', 'playTimeStorm', [STORM]);
    expect(state.G.removedFromGame).toEqual([STORM]);
    expect(one(events, 'card_played').data).toMatchObject({ player: 'p1', card: STORM });
    expect(one(events, 'cards_discarded').data).toMatchObject({ count: 10, cards: flipped });
  });

  it('turn_started：回合主人与回合数', () => {
    const { events, state } = step(load(scene('discard')), 'p1', 'skipDiscard');
    const ev = one(events, 'turn_started');
    expect(ev.actor).toBeNull();
    expect(ev.data).toEqual({ turn: state.G.turnNumber, owner: state.G.currentPlayerID });
    expect(state.G.currentPlayerID).not.toBe('p1');
  });

  it('game_over：牌库耗尽，梦主获胜', () => {
    const G = scene('draw', { deck: { cards: [SHOOT], discardPile: [] } });
    const { events, state } = step(load(G), 'p1', 'doDraw');
    expect(state.ctx.gameover).toBeDefined();
    const ev = one(events, 'game_over');
    expect(ev.data).toEqual({ winner: 'master', reason: 'deck_exhausted' });
    expect(kindsOf(events).at(-1)).toBe('game_over');
  });
});

// ---------------------------------------------------------------------------
// SHOOT：打牌、骰值、移层、死亡、复活
// ---------------------------------------------------------------------------

describe('事件 · SHOOT 与死亡', () => {
  const afterKill = (): Stepped =>
    step(load(scene('action')), 'p1', 'playShoot', ['p2', SHOOT], dice(1));

  it('card_played 与 shoot_rolled', () => {
    const { events } = afterKill();
    expect(one(events, 'card_played')).toMatchObject({
      actor: 'p1',
      data: { player: 'p1', card: SHOOT },
    });
    expect(one(events, 'shoot_rolled').data).toEqual({ player: 'p1', roll: 1 });
  });

  it('player_moved 与 player_died：死亡的人移到迷失层，击杀者是发起者', () => {
    const { events } = afterKill();
    const moved = all(events, 'player_moved').find((e) => e.data.player === 'p2')!;
    expect(moved.data).toEqual({ player: 'p2', from: 2, to: 0 });
    expect(one(events, 'player_died').data).toEqual({ player: 'p2', layer: 2, cause: 'p1' });
  });

  it('player_died：梦魇把人送进迷失层不是击杀，没有击杀者', () => {
    const base = scene('action');
    const G = scene('action', {
      currentPlayerID: 'pM',
      layers: {
        ...base.layers,
        2: {
          ...base.layers[2]!,
          nightmareId: 'nightmare_space_fall' as CardID,
          nightmareRevealed: true,
        },
      },
    });
    const { events } = step(load(G), 'pM', 'masterActivateNightmare', [2, {}], dice(5, 5));
    const died = all(events, 'player_died');
    expect(died.map((e) => e.data)).toEqual([
      { player: 'p1', layer: 2, cause: null },
      { player: 'p2', layer: 2, cause: null },
    ]);
  });

  it('player_died：SHOOT 击杀仍报出击杀者', () => {
    const { events } = afterKill();
    expect(one(events, 'player_died').data.cause).toBe('p1');
  });

  it('各事件按表里的顺序排列', () => {
    const order = [
      'move',
      'card_played',
      'cards_discarded',
      'shoot_rolled',
      'player_moved',
      'player_died',
    ];
    const kinds = kindsOf(afterKill().events).filter((k) => order.includes(k));
    const positions = kinds.map((k) => order.indexOf(k));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('player_revived：复活的人和所在层', () => {
    const G = scene(
      'action',
      {},
      { p2: { isAlive: false, currentLayer: 0 as Layer, deathTurn: 0, hand: [] } },
    );
    const { events } = step(load(G), 'p1', 'playRevive', ['p2', [SHOOT, KICK]], dice());
    const ev = one(events, 'player_revived');
    expect(ev.data.player).toBe('p2');
    expect(typeof ev.data.layer).toBe('number');
    expect(one(events, 'cards_discarded').data).toMatchObject({ count: 2 });
  });
});

// ---------------------------------------------------------------------------
// 解封：响应窗口、心锁、金库、贿赂
// ---------------------------------------------------------------------------

describe('事件 · 解封', () => {
  /** p1 在第 2 层解封，其余三人依次放弃响应，直到结算 */
  function unlockThrough(G: SetupState): Stepped[] {
    const out: Stepped[] = [];
    let s = step(load(G), 'p1', 'playUnlock', [UNLOCK]);
    out.push(s);
    for (const id of ['p2', 'p3', 'pM']) {
      s = step(s.state, id, 'passResponse');
      out.push(s);
    }
    return out;
  }

  it('awaiting_changed：窗口打开时写出在等谁、等什么，结算后变为空', () => {
    const steps = unlockThrough(scene('action'));
    const opened = one(steps[0]!.events, 'awaiting_changed');
    expect(opened.actor).toBeNull();
    const list = opened.data.awaiting as { field: string; actors: string[]; moves: string[] }[];
    const window = list.find((a) => a.field === 'pendingResponseWindow')!;
    expect([...window.actors].sort()).toEqual(['p2', 'p3', 'pM']);
    expect(window.moves).toContain('passResponse');
    const closed = one(steps.at(-1)!.events, 'awaiting_changed');
    expect(closed.data.awaiting).toEqual([]);
    // 中间的放弃响应只减少了等待的人，也算变化
    expect(all(steps[1]!.events, 'awaiting_changed')).toHaveLength(1);
  });

  it('unlock_resolved 与 heart_lock_changed：心锁下降即成功', () => {
    const steps = unlockThrough(scene('action'));
    const last = steps.at(-1)!.events;
    expect(one(last, 'unlock_resolved').data).toEqual({ success: true, player: 'p1', layer: 2 });
    expect(one(last, 'heart_lock_changed').data).toEqual({ layer: 2, from: 4, to: 3 });
  });

  it('unlock_resolved：没有可响应者时解封同一步里直接结算，也写出事件', () => {
    const G = scene(
      'action',
      {},
      {
        p2: { isAlive: false, currentLayer: 0 as Layer },
        p3: { isAlive: false, currentLayer: 0 as Layer },
        pM: { isAlive: false, currentLayer: 0 as Layer },
      },
    );
    const done = step(load(G), 'p1', 'playUnlock', [UNLOCK]);
    expect(done.state.G.pendingUnlock).toBeNull();
    expect(one(done.events, 'unlock_resolved').data).toEqual({
      success: true,
      player: 'p1',
      layer: 2,
    });
    expect(one(done.events, 'heart_lock_changed').data).toEqual({ layer: 2, from: 4, to: 3 });
  });

  it('unlock_resolved：被取消的解封，成功为否', () => {
    const G = scene('action', {}, { p2: { hand: [UNLOCK] } });
    let s = step(load(G), 'p1', 'playUnlock', [UNLOCK]);
    s = step(s.state, 'p2', 'respondCancelUnlock', [UNLOCK]);
    for (const id of ['p3', 'pM']) {
      if (s.state.G.pendingUnlock) s = step(s.state, id, 'passResponse');
    }
    const ev = all(s.events, 'unlock_resolved')[0];
    expect(ev?.data).toMatchObject({ success: false, player: 'p1', layer: 2 });
  });

  it('vault_opened：心锁归零打开金币金库，此时不派贿赂牌，等待梦主三选一', () => {
    const base = scene('action');
    const G: SetupState = withBribes(
      {
        ...base,
        layers: { ...base.layers, 2: { ...base.layers[2]!, heartLockValue: 1 } },
        vaults: base.vaults.map((v) => (v.layer === 2 ? { ...v, contentType: 'coin' } : v)),
      },
      [{ id: 'bribe-0', kind: 'fail' }],
    );
    const steps = unlockThrough(G);
    const last = steps.at(-1)!.events;
    const vault = one(last, 'vault_opened');
    expect(vault.data).toEqual({ vault: 'v-2', layer: 2, content: 'coin', openedBy: 'p1' });
    expect(all(last, 'bribe_dealt')).toHaveLength(0);
    const awaiting = one(last, 'awaiting_changed').data.awaiting as {
      field: string;
      actors: string[];
      moves: string[];
    }[];
    expect(awaiting).toEqual([
      {
        field: 'pendingVaultDecision',
        actors: ['pM'],
        moves: ['masterVaultDecision'],
        blocking: true,
      },
    ]);
  });
});

describe('事件 · 贿赂', () => {
  it('bribe_dealt：金库打开后梦主选择派贿赂，成败只给持有者，梦主自己的视角也看不到', () => {
    const G = withBribes(scene('action', { pendingVaultDecision: { layer: 2, openerID: 'p2' } }), [
      { id: 'bribe-0', kind: 'deal' },
    ]);
    const { events } = step(load(G), 'pM', 'masterVaultDecision', ['bribe'], dice());
    const ev = one(events, 'bribe_dealt');
    expect(ev.data).toEqual({ bribe: 'bribe-0', to: 'p2' });
    expect(ev.secret).toEqual({ to: ['p2'], data: { kind: 'deal' } });
    expect(eventsFor(events, 'pM').find((e) => e.kind === 'bribe_dealt')).not.toHaveProperty(
      'secret',
    );
    expect(JSON.stringify(eventsFor(events, 'pM'))).not.toContain('"deal"');
  });
});

// ---------------------------------------------------------------------------
// 梦魇
// ---------------------------------------------------------------------------

describe('事件 · 梦魇', () => {
  const withNightmares = (): SetupState => {
    const base = scene('action', { currentPlayerID: 'pM' });
    return {
      ...base,
      layers: {
        ...base.layers,
        1: { ...base.layers[1]!, nightmareId: NIGHTMARE_A },
        2: { ...base.layers[2]!, nightmareId: NIGHTMARE_B },
      },
    };
  };

  const waiting = (): SetupState => ({
    ...withNightmares(),
    pendingVaultDecision: { layer: 2, openerID: 'p2' },
  });

  it('nightmare_revealed：金库打开后梦主选择发动，层与是哪一张都公开', () => {
    const { events } = step(load(waiting()), 'pM', 'masterVaultDecision', ['nightmare']);
    expect(one(events, 'nightmare_revealed').data).toEqual({ layer: 2, nightmare: NIGHTMARE_B });
    expect(one(events, 'nightmare_discarded').secret).toBeUndefined();
  });

  it('nightmare_discarded：没翻开就弃掉，哪张只给梦主', () => {
    const G = { ...withNightmares(), pendingVaultDecision: { layer: 1, openerID: 'p2' } };
    const { events } = step(load(G), 'pM', 'masterVaultDecision', ['discard']);
    const ev = one(events, 'nightmare_discarded');
    expect(ev.data).toEqual({ layer: 1 });
    expect(ev.secret).toEqual({ to: ['pM'], data: { nightmare: NIGHTMARE_A } });
    expect(all(events, 'nightmare_revealed')).toHaveLength(0);
  });

  it('nightmare_discarded：翻开过的梦魇被弃掉，没有私密内容', () => {
    const G = withNightmares();
    const open: SetupState = {
      ...G,
      layers: { ...G.layers, 1: { ...G.layers[1]!, nightmareRevealed: true } },
    };
    const { events } = step(load(open), 'pM', 'masterDiscardNightmare', [1]);
    const ev = one(events, 'nightmare_discarded');
    expect(ev.data).toEqual({ layer: 1 });
    expect(ev.secret).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 翻开角色
// ---------------------------------------------------------------------------

describe('事件 · 翻开角色', () => {
  it('character_revealed：开局布置时梦主翻开，角色公开；盗梦者保持未翻开，没有事件', () => {
    const created = createMatch(game, {
      numPlayers: 5,
      setupData: { rngSeed: 'reveal' },
      seed: 'reveal',
    });
    const { events, state } = step(created, '0', 'completeSetup');
    const revealed = all(events, 'character_revealed');
    expect(revealed).toHaveLength(1);
    const master = state.G.dreamMasterID;
    expect(revealed[0]!.data).toEqual({
      player: master,
      character: state.G.players[master]!.characterId,
    });
    expect(revealed[0]!.secret).toBeUndefined();
    // 其他人的角色不出现在任何公开事件里
    const text = JSON.stringify(eventsFor(events, null));
    for (const id of state.G.playerOrder.filter((p) => p !== master)) {
      expect(text).not.toContain(state.G.players[id]!.characterId);
    }
  });
});

describe('事件 · 待选择里被遮蔽的行动者', () => {
  const sceneG = buildViewScene();
  const { G: viewG, a, b, c, d } = sceneG;
  const ctx = {
    numPlayers: viewG.playerOrder.length,
    playOrder: viewG.playerOrder,
    playOrderPos: 0,
    currentPlayer: viewG.currentPlayerID,
    phase: 'playing',
    turn: 1,
  };
  const request = { playerID: a, move: 'x', args: [] as unknown[] };

  function awaitingEvents(before: SetupState, after: SetupState): MatchEvent[] {
    const described = describeMatchEvents({
      before,
      after,
      ctxBefore: ctx,
      ctxAfter: ctx,
      request,
    });
    return described.map((ev, index) => ({ ...ev, stateID: 1, index })) as MatchEvent[];
  }

  /** 收集值里所有字符串叶子，避免用子串匹配把数字误判成玩家 id */
  const stringLeaves = (value: unknown): string[] =>
    typeof value === 'string'
      ? [value]
      : typeof value === 'object' && value !== null
        ? Object.values(value).flatMap(stringLeaves)
        : [];

  const withAries = (who: string): SetupState => ({
    ...viewG,
    pendingAriesChoice: { ariesID: who, victimLayer: 2, victimID: c },
  });
  const withVirgo = (who: string): SetupState => ({
    ...viewG,
    pendingVirgoChoice: { virgoID: who, triggerRoll: 6, shooterID: a },
  });

  it('遮蔽的字段集合与视图一致：集合里的每个字段，视图都对非本人遮住行动者', () => {
    for (const field of MASKED_ACTOR_FIELDS) {
      const state = field === 'pendingAriesChoice' ? withAries(b) : withVirgo(d);
      const outsider = viewFor(state, a, { gameOver: false });
      const owner = viewFor(state, field === 'pendingAriesChoice' ? b : d, { gameOver: false });
      const pick = (view: typeof outsider): string | null | undefined =>
        field === 'pendingAriesChoice'
          ? view.pendingAriesChoice?.ariesID
          : view.pendingVirgoChoice?.virgoID;
      expect(pick(outsider)).toBeNull();
      expect(pick(owner)).toBe(field === 'pendingAriesChoice' ? b : d);
    }
    // 响应窗口的行动者就是公开的 SHOOT 目标，不在集合里
    expect(MASKED_ACTOR_FIELDS.has('pendingShootResponse')).toBe(false);
  });

  for (const [field, build, who] of [
    ['pendingAriesChoice', withAries, b],
    ['pendingVirgoChoice', withVirgo, d],
  ] as const) {
    it(`${field}：非本人拿到的事件里没有行动者的 id，本人在 secret 里拿得到`, () => {
      const events = awaitingEvents(viewG, build(who));
      const ev = events.find((e) => e.kind === 'awaiting_changed')!;
      const outsiderView = eventsFor([ev], a).find((e) => e.kind === 'awaiting_changed')!;
      expect(outsiderView.secret).toBeUndefined();
      const entry = (outsiderView.data.awaiting as { field: string; actors: string[] }[]).find(
        (x) => x.field === field,
      )!;
      expect(entry.actors).toEqual([]);
      expect(stringLeaves(outsiderView)).not.toContain(who);
      expect(stringLeaves(eventsFor([ev], null))).not.toContain(who);

      const ownerView = eventsFor([ev], who).find((e) => e.kind === 'awaiting_changed')!;
      expect(stringLeaves(ownerView.secret)).toContain(who);
      expect(ownerView.secret!.to).toEqual([who]);
    });
  }

  it('变没变的判断基于完整内容：公开部分相同、行动者变了，也要发事件', () => {
    const events = awaitingEvents(withAries(b), withAries(d));
    expect(events.filter((e) => e.kind === 'awaiting_changed')).toHaveLength(1);
    const same = awaitingEvents(withAries(b), withAries(b));
    expect(same.filter((e) => e.kind === 'awaiting_changed')).toHaveLength(0);
  });

  it('SHOOT 响应窗口的行动者照旧公开', () => {
    const after: SetupState = {
      ...viewG,
      pendingShootResponse: {
        shooterID: a,
        targetPlayerID: c,
        cardId: 'action_shoot',
        sameLayerRequired: true,
        deathFaces: [1],
        moveFaces: [2],
        extraOnMove: null,
        responseType: 'terrorist',
      },
    };
    const ev = awaitingEvents(viewG, after).find((e) => e.kind === 'awaiting_changed')!;
    const entry = (ev.data.awaiting as { field: string; actors: string[] }[]).find(
      (x) => x.field === 'pendingShootResponse',
    )!;
    expect(entry.actors).toEqual([c]);
    expect(ev.secret).toBeUndefined();
  });
});
