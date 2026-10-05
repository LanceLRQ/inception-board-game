// 本地对局会话测试：不依赖 Worker / Comlink / DOM，直接驱动会话类

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AutoAction } from '@icgame/bot';
import { HAND_LIMIT } from '@icgame/game-engine/config';
import { LocalMatchSession, MAX_CONSECUTIVE_REJECTS, buildMatchSeed } from './localMatchSession.js';

// 只替换 nextAutoAction，其余导出保持真实实现；override 为 null 时走真实判定
const hooks = vi.hoisted(() => ({
  override: null as null | (() => AutoAction | null),
}));

vi.mock('@icgame/bot', async (importActual) => {
  const actual = await importActual<typeof import('@icgame/bot')>();
  return {
    ...actual,
    nextAutoAction: (...args: Parameters<typeof actual.nextAutoAction>) =>
      hooks.override ? hooks.override() : actual.nextAutoAction(...args),
  };
});

afterEach(() => {
  hooks.override = null;
});

const HUMAN = '0';
const MAX_STEPS = 20000;

function makeSession(playerCount = 5, seed = 'sess'): LocalMatchSession {
  return new LocalMatchSession({ playerCount, seed });
}

/** 一直 step，直到不再继续调度；返回被拒的步数 */
function runUntilIdle(session: LocalMatchSession): number {
  let rejected = 0;
  for (let i = 0; i < MAX_STEPS; i++) {
    const r = session.step();
    if (!r.ok) rejected++;
    if (!r.continue) return rejected;
  }
  throw new Error('自动循环没有停下');
}

/** 最简单的真人策略：按当前小阶段给出一个 move */
function humanPolicy(session: LocalMatchSession): { move: string; args: unknown[] } {
  const { G } = session.view();
  switch (G.turnPhase) {
    case 'draw':
      return { move: 'doDraw', args: [] };
    case 'action':
      return { move: 'endActionPhase', args: [] };
    default: {
      const hand = G.players[HUMAN]?.hand ?? [];
      if (hand.length > HAND_LIMIT) {
        return { move: 'doDiscard', args: [hand.slice(0, hand.length - HAND_LIMIT)] };
      }
      return { move: 'skipDiscard', args: [] };
    }
  }
}

describe('buildMatchSeed', () => {
  it('同一个 matchID 在不同时间得到不同种子，重开不会重复同一局', () => {
    expect(buildMatchSeed('room-1', 1000)).not.toBe(buildMatchSeed('room-1', 1001));
  });

  it('同一个 matchID 与时间得到相同种子', () => {
    expect(buildMatchSeed('room-1', 1000)).toBe(buildMatchSeed('room-1', 1000));
  });

  it('没有 matchID 时以 local- 开头', () => {
    expect(buildMatchSeed(undefined, 1000).startsWith('local-')).toBe(true);
  });

  it('带 matchID 时以 matchID 开头', () => {
    expect(buildMatchSeed('room-1', 1000).startsWith('room-1-')).toBe(true);
  });
});

describe('LocalMatchSession', () => {
  it('建局后自动走出布置阶段，在真人的抽牌阶段停下', () => {
    const session = makeSession();
    expect(session.view().ctx.phase).toBe('setup');

    const rejected = runUntilIdle(session);

    const { G, ctx } = session.view();
    expect(rejected).toBe(0);
    expect(ctx.phase).not.toBe('setup');
    expect(ctx.currentPlayer).toBe(HUMAN);
    expect(G.turnPhase).toBe('draw');
    // 停下之后再 step：没有可执行的动作
    const r = session.step();
    expect(r.action).toBeNull();
    expect(r.continue).toBe(false);
  });

  it('真人抽牌、结束行动、弃牌都被接受，之后 Bot 走完回合并回到真人', () => {
    const session = makeSession();
    runUntilIdle(session);
    const firstTurn = session.view().ctx.turn;

    for (let i = 0; i < 3; i++) {
      const { move, args } = humanPolicy(session);
      const r = session.humanMove(move, args);
      expect(r, `${move}: ${r.reason ?? ''}`).toMatchObject({ ok: true });
    }
    expect(session.view().ctx.currentPlayer).not.toBe(HUMAN);

    expect(runUntilIdle(session)).toBe(0);
    const { ctx, G } = session.view();
    expect(ctx.currentPlayer).toBe(HUMAN);
    expect(G.turnPhase).toBe('draw');
    expect(ctx.turn).toBeGreaterThan(firstTurn);
  });

  it('不是真人回合时，真人发 doDraw 被拒且状态不变', () => {
    const session = makeSession();
    // 刚建局是布置阶段，不是抽牌阶段
    const before = JSON.stringify(session.view());
    const r = session.humanMove('doDraw', []);
    expect(r.ok).toBe(false);
    expect(r.reason).toBeTruthy();
    expect(JSON.stringify(session.view())).toBe(before);

    // 走到真人回合，真人结束回合后轮到 Bot：此时真人再发 doDraw 同样被拒
    runUntilIdle(session);
    for (let i = 0; i < 3; i++) {
      const { move, args } = humanPolicy(session);
      session.humanMove(move, args);
    }
    expect(session.view().ctx.currentPlayer).not.toBe(HUMAN);
    const mid = JSON.stringify(session.view());
    expect(session.humanMove('doDraw', []).ok).toBe(false);
    expect(JSON.stringify(session.view())).toBe(mid);
  });

  it('同一个种子两次建局，走相同的步骤，view() 相同', () => {
    const run = (): unknown => {
      const session = makeSession(6, 'repeat');
      runUntilIdle(session);
      for (let round = 0; round < 3; round++) {
        for (let i = 0; i < 3; i++) {
          const { move, args } = humanPolicy(session);
          session.humanMove(move, args);
        }
        runUntilIdle(session);
      }
      return session.view();
    };
    expect(run()).toEqual(run());
  });

  it('不同种子的局面不同', () => {
    const a = makeSession(5, 'seed-a');
    const b = makeSession(5, 'seed-b');
    runUntilIdle(a);
    runUntilIdle(b);
    expect(JSON.stringify(a.view().G)).not.toBe(JSON.stringify(b.view().G));
  });

  it('真人用最简策略打完整局：能到终局，没有任何自动动作被拒', () => {
    const session = makeSession(5, 'full-game');
    let autoRejected = 0;
    let humanRejected = 0;
    for (let guard = 0; guard < MAX_STEPS; guard++) {
      if (session.view().ctx.gameover !== undefined) break;
      const r = session.step();
      if (!r.ok) autoRejected++;
      if (r.continue) continue;
      // 自动循环停下：轮到真人
      const { move, args } = humanPolicy(session);
      if (!session.humanMove(move, args).ok) humanRejected++;
    }
    expect(session.view().ctx.gameover).toBeDefined();
    expect(autoRejected).toBe(0);
    expect(humanRejected).toBe(0);
  });

  it('同一个动作连续被拒达到上限后停止继续调度，直到有 move 被接受', () => {
    const session = makeSession();
    // 一个必然被拒的动作：布置阶段里没有这个 move
    hooks.override = () => ({ playerID: '0', move: 'noSuchMove', args: [], why: '测试用' });

    for (let i = 1; i < MAX_CONSECUTIVE_REJECTS; i++) {
      const r = session.step();
      expect(r.ok).toBe(false);
      expect(r.continue).toBe(true);
    }
    const third = session.step();
    expect(third.ok).toBe(false);
    expect(third.continue).toBe(false);
    // 保持为 false
    expect(session.step().continue).toBe(false);

    // 有 move 被接受之后恢复：真实判定下 completeSetup 被接受
    hooks.override = null;
    const accepted = session.step();
    expect(accepted.ok).toBe(true);
    expect(accepted.continue).toBe(true);
  });

  it('被拒计数在 move 被接受后清零', () => {
    const session = makeSession();
    hooks.override = () => ({ playerID: '0', move: 'noSuchMove', args: [], why: '测试用' });
    for (let i = 1; i < MAX_CONSECUTIVE_REJECTS; i++) session.step();
    hooks.override = null;
    expect(session.step().ok).toBe(true);
    // 重新开始计数：再被拒 MAX-1 次仍然继续
    hooks.override = () => ({ playerID: '0', move: 'noSuchMove', args: [], why: '测试用' });
    for (let i = 1; i < MAX_CONSECUTIVE_REJECTS; i++) {
      expect(session.step().continue).toBe(true);
    }
  });

  it('真人的 move 被接受也会解除停止状态', () => {
    const session = makeSession();
    const bad = (): AutoAction => ({ playerID: '0', move: 'noSuchMove', args: [], why: '测试用' });
    hooks.override = bad;
    for (let i = 0; i < MAX_CONSECUTIVE_REJECTS; i++) session.step();
    expect(session.step().continue).toBe(false);

    // 布置阶段回合主人是真人 0，由真人完成布置
    expect(session.humanMove('completeSetup', []).ok).toBe(true);
    // 计数已清零：再被拒 1 次仍应继续调度
    const r = session.step();
    expect(r.ok).toBe(false);
    expect(r.continue).toBe(true);
  });

  it('view() 只返回 G、ctx 与版本号，不含随机数状态', () => {
    const session = makeSession();
    runUntilIdle(session);
    const view = session.view();
    expect(Object.keys(view).sort()).toEqual(['G', 'ctx', 'stateID']);
    expect(JSON.stringify(view)).not.toContain('rngState');
  });

  it('view() 给出的是座位 0 的视图：没有种子与牌库顺序，他人手牌被隐去', () => {
    const session = makeSession(5, 'view-seat0');
    runUntilIdle(session);
    const view = session.view();
    const G = view.G as unknown as {
      rngSeed?: unknown;
      deck: { cards?: unknown; cardCount: unknown };
      players: Record<string, { hand: unknown; handCount: unknown }>;
    };
    expect('rngSeed' in G).toBe(false);
    expect(G.deck.cards).toBeUndefined();
    expect(typeof G.deck.cardCount).toBe('number');
    for (const [id, p] of Object.entries(G.players)) {
      expect(typeof p.handCount).toBe('number');
      if (id === HUMAN) expect(Array.isArray(p.hand)).toBe(true);
      else expect(p.hand).toBeNull();
    }
    expect(JSON.stringify(view)).not.toContain('rngSeed');
  });
});
