// MoveGateway 测试 - 管道集成
// 验证 validator + RateGuard 协作

import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState, type SetupState } from '@icgame/game-engine';
import type { CardID } from '@icgame/shared';
import { InMemoryRateGuard } from './RateGuardService.js';
import { MoveGateway } from './MoveGateway.js';

function makeState(): SetupState {
  const s = createInitialState({
    playerCount: 4,
    playerIds: ['P1', 'P2', 'P3', 'P4'],
    nicknames: ['A', 'B', 'C', 'D'],
    rngSeed: 'seed',
  });
  return {
    ...s,
    phase: 'playing',
    turnPhase: 'action',
    currentPlayerID: 'P1',
    dreamMasterID: 'P4',
    players: {
      ...s.players,
      P1: { ...s.players.P1!, hand: ['c1' as CardID] },
    },
  };
}

describe('MoveGateway', () => {
  let guard: InMemoryRateGuard;
  let gateway: MoveGateway;

  beforeEach(() => {
    guard = new InMemoryRateGuard({ maxPerWindow: 3 });
    gateway = new MoveGateway(guard);
  });

  it('accepts valid playShoot', async () => {
    const state = makeState();
    const r = await gateway.accept({
      state,
      playerID: 'P1',
      currentPlayer: 'P1',
      payload: { name: 'playShoot', cardId: 'c1', targetPlayerID: 'P2' },
    });
    expect(r.ok).toBe(true);
  });

  it('rejects bad schema at L1', async () => {
    const state = makeState();
    const r = await gateway.accept({
      state,
      playerID: 'P1',
      currentPlayer: 'P1',
      payload: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.layer).toBe(1);
  });

  it('rejects non-current player at L2', async () => {
    const state = makeState();
    const r = await gateway.accept({
      state,
      playerID: 'P2',
      currentPlayer: 'P1',
      payload: { name: 'playShoot', cardId: 'c1', targetPlayerID: 'P3' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.layer).toBe(2);
  });

  it('rejects duplicate intent at L7', async () => {
    const state = makeState();
    guard.recordIntent('int-1');
    const r = await gateway.accept({
      state,
      playerID: 'P1',
      currentPlayer: 'P1',
      intentId: 'int-1',
      payload: { name: 'playShoot', cardId: 'c1', targetPlayerID: 'P2' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.layer).toBe(7);
      expect(r.code).toBe('RATE_INTENT_DUPLICATE');
    }
  });

  it('commit records intent and move', async () => {
    const state = makeState();
    const r = await gateway.accept({
      state,
      playerID: 'P1',
      currentPlayer: 'P1',
      intentId: 'int-new',
      payload: { name: 'playShoot', cardId: 'c1', targetPlayerID: 'P2' },
    });
    expect(r.ok).toBe(true);
    if (r.ok) await gateway.commit(r.context);
    expect(guard.isDuplicate('int-new')).toBe(true);
  });

  it('rate limit kicks in after threshold', async () => {
    const state = makeState();
    for (let i = 0; i < 3; i++) guard.recordMove('P1');
    const r = await gateway.accept({
      state,
      playerID: 'P1',
      currentPlayer: 'P1',
      payload: { name: 'playShoot', cardId: 'c1', targetPlayerID: 'P2' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});
