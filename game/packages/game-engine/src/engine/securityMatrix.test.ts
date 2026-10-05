// 隐藏信息矩阵：按规格逐行断言「谁能看到什么」，作为安全合约的回归基线
//
// 每一行对应一条规格，断言现行实现的行为（视图用 viewFor，事件用 eventsFor）。
// 任何违反这张矩阵的改动都应该被本文件拦截。
//
// 矩阵：
//   T1  盗梦者看别人手牌                      → 看不到（只有张数）
//   T2  盗梦者看自己手牌                      → 实际牌面
//   T3  盗梦者看未开金库                      → 看不到
//   T4  梦主看未开金库                        → 实际内容
//   T5  盗梦者看自己持有的贿赂牌              → 成败可见
//   T6  盗梦者看别人持有的贿赂牌              → 只知道已派出，成败不可见
//   T7  任何人看池里未派出的贿赂牌            → 看不到（梦主也一样，皇城梦主除外）
//   T8  皇城梦主                              → 看得到池里的牌，看不到已派出的
//   T9  贿赂派出事件                          → 成败只给持有者，梦主与其他人拿不到
//   T10 持有者                                → 事件里拿得到成败
//   T11 抽牌事件                              → 抽到哪些牌只给本人，其他人只有张数

import { describe, it, expect } from 'vitest';
import type { SetupState } from '../setup.js';
import { eventsFor, type MatchEvent } from '../runner/matchRunner.js';
import { buildViewScene, IMPERIAL_CITY } from '../testing/viewScene.js';
import { viewFor, type MatchView, type Viewer } from './matchView.js';

const OPEN = { gameOver: false };
const { G, master, a, b, c, d } = buildViewScene();

const v = (state: SetupState, viewer: Viewer): MatchView => viewFor(state, viewer, OPEN);

// a 持有成功的贿赂牌 bribe-2，b 持有失败的贿赂牌 bribe-3，其余在池里
const HELD_BY_A = 2;
const HELD_BY_B = 3;
const IN_POOL = 0;

describe('矩阵 · T1 T2 手牌', () => {
  it('T1 盗梦者看不到别人的手牌，也看不到梦主的', () => {
    const view = v(G, a);
    expect(view.players[b]!.hand).toBeNull();
    expect(view.players[master]!.hand).toBeNull();
  });

  it('T1 梦主与旁观者同样看不到盗梦者的手牌', () => {
    for (const viewer of [master, null]) {
      for (const id of [a, b, c, d]) expect(v(G, viewer).players[id]!.hand).toBeNull();
    }
  });

  it('T2 本人看到自己的手牌', () => {
    expect(v(G, a).players[a]!.hand).toEqual(['action_shoot', 'action_kick', 'action_unlock']);
  });
});

describe('矩阵 · T3 T4 金库', () => {
  it('T3 盗梦者与旁观者看不到未开金库的内容', () => {
    for (const viewer of [a, b, null]) {
      for (const vault of v(G, viewer).vaults) {
        if (!vault.isOpened) expect(vault.contentType).toBeNull();
      }
    }
  });

  it('T4 梦主看到全部金库的内容', () => {
    for (const vault of v(G, master).vaults) expect(vault.contentType).not.toBeNull();
  });
});

describe('矩阵 · T5 T6 T7 贿赂牌', () => {
  it('T5 持有者看到自己持有的贿赂牌的成败', () => {
    expect(v(G, a).bribePool[HELD_BY_A]!.kind).toBe('deal');
    expect(v(G, b).bribePool[HELD_BY_B]!.kind).toBe('fail');
  });

  it('T6 看别人持有的贿赂牌：只知道已派出和持有者，成败不可见', () => {
    const seen = v(G, a).bribePool[HELD_BY_B]!;
    expect(seen.status).toBe('dispatched');
    expect(seen.heldBy).toBe(b);
    expect(seen.kind).toBeNull();
  });

  it('T6 普通梦主与旁观者也看不到任何已派出的贿赂牌的成败', () => {
    for (const viewer of [master, null]) {
      const pool = v(G, viewer).bribePool;
      expect(pool[HELD_BY_A]!.kind).toBeNull();
      expect(pool[HELD_BY_B]!.kind).toBeNull();
    }
  });

  it('T7 池里未派出的牌：盗梦者、旁观者、普通梦主都看不到成败', () => {
    for (const viewer of [a, c, master, null]) {
      const pool = v(G, viewer).bribePool;
      expect(pool[IN_POOL]!.status).toBe('inPool');
      expect(pool[IN_POOL]!.kind).toBeNull();
    }
  });
});

describe('矩阵 · T8 皇城梦主', () => {
  const imperial: SetupState = {
    ...G,
    players: { ...G.players, [master]: { ...G.players[master]!, characterId: IMPERIAL_CITY } },
  };

  it('T8 皇城梦主看得到池里未派出的牌的成败', () => {
    const pool = v(imperial, master).bribePool;
    expect(pool[IN_POOL]!.kind).toBe('deal');
    expect(pool[1]!.kind).toBe('fail');
  });

  it('T8 皇城梦主看不到已派出的牌的成败，也不因此让别人看到池里的牌', () => {
    const own = v(imperial, master).bribePool;
    expect(own[HELD_BY_A]!.kind).toBeNull();
    expect(own[HELD_BY_B]!.kind).toBeNull();
    for (const viewer of [a, c, null]) {
      expect(v(imperial, viewer).bribePool[IN_POOL]!.kind).toBeNull();
    }
  });
});

describe('矩阵 · T9 T10 T11 事件', () => {
  const bribeDealt: MatchEvent = {
    stateID: 7,
    index: 0,
    kind: 'bribe_dealt',
    actor: master,
    data: { bribe: 'bribe-0', to: b },
    secret: { to: [b], data: { kind: 'deal' } },
  };
  const cardsDrawn: MatchEvent = {
    stateID: 7,
    index: 1,
    kind: 'cards_drawn',
    actor: a,
    data: { player: a, count: 2 },
    secret: { to: [a], data: { cards: ['SECRET-CARD-A', 'SECRET-CARD-B'] } },
  };
  const events = [bribeDealt, cardsDrawn];

  it('T9 贿赂派出：梦主、其他盗梦者、旁观者拿不到成败', () => {
    for (const viewer of [master, a, c, null]) {
      const ev = eventsFor(events, viewer).find((e) => e.kind === 'bribe_dealt')!;
      expect(ev.data).toEqual({ bribe: 'bribe-0', to: b });
      expect(ev).not.toHaveProperty('secret');
      expect(JSON.stringify(ev)).not.toContain('deal"');
    }
  });

  it('T10 贿赂派出：收到的人拿到成败', () => {
    const ev = eventsFor(events, b).find((e) => e.kind === 'bribe_dealt')!;
    expect(ev.secret).toEqual({ to: [b], data: { kind: 'deal' } });
  });

  it('T11 抽牌：非本人只有张数，没有牌面', () => {
    for (const viewer of [b, master, null]) {
      const ev = eventsFor(events, viewer).find((e) => e.kind === 'cards_drawn')!;
      expect(ev.data).toEqual({ player: a, count: 2 });
      expect(JSON.stringify(ev)).not.toContain('SECRET-CARD');
    }
  });

  it('T11 抽牌：本人拿到完整的牌面', () => {
    const ev = eventsFor(events, a).find((e) => e.kind === 'cards_drawn')!;
    expect(ev.secret?.data).toEqual({ cards: ['SECRET-CARD-A', 'SECRET-CARD-B'] });
  });

  it('不在点名名单里的字符串观察者按旁观者处理，拿不到任何私密内容', () => {
    expect(JSON.stringify(eventsFor(events, 'not-a-seat'))).not.toContain('SECRET-CARD');
    expect(JSON.stringify(eventsFor(events, 'not-a-seat'))).not.toContain('secret');
  });
});

describe('矩阵 · 视图幂等', () => {
  it('同一个状态对同一个观察者连续取两次，结果一致', () => {
    for (const viewer of [a, master, null]) {
      expect(v(G, viewer)).toEqual(v(G, viewer));
    }
  });
});
