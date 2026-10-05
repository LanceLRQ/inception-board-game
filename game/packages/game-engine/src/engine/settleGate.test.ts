// 行动权包装层：发起者没有行动权时拒绝，通过时把发起者写进 ctx.currentPlayer

import { describe, it, expect } from 'vitest';
import type { SetupState } from '../setup.js';
import { createTestState } from '../testing/fixtures.js';
import { withSettleGate } from './settleGate.js';
import { INVALID_MOVE } from './invalidMove.js';

describe('withSettleGate 包装层', () => {
  /** 探针 move：返回它看到的发起者 */
  const gated = withSettleGate({
    probe: { move: ((a: { ctx: { currentPlayer: string } }) => a.ctx.currentPlayer) as never },
    resolveGraft: { move: (() => 'graft-resolved') as never },
  });
  const call = (name: 'probe' | 'resolveGraft', args: Record<string, unknown>): unknown =>
    (gated[name].move as unknown as (a: unknown) => unknown)(args);

  function state(): SetupState {
    const base = createTestState({ phase: 'playing', turnPhase: 'action' });
    return { ...base, currentPlayerID: base.playerOrder[0]! };
  }

  it('回合主人发起时放行，并把发起者写进 ctx.currentPlayer', () => {
    const s = state();
    const owner = s.currentPlayerID;
    expect(call('probe', { G: s, ctx: { currentPlayer: 'x' }, playerID: owner })).toBe(owner);
  });

  it('非回合主人发普通 move 被拒', () => {
    const s = state();
    const other = s.playerOrder.find((id) => id !== s.currentPlayerID)!;
    expect(call('probe', { G: s, ctx: { currentPlayer: other }, playerID: other })).toBe(
      INVALID_MOVE,
    );
  });

  it('回合外的响应者发结算 move 时，move 本体看到的发起者是响应者本人', () => {
    const s = state();
    const other = s.playerOrder.find((id) => id !== s.currentPlayerID)!;
    const withGraft = {
      ...s,
      pendingGraft: { playerID: other },
    } as unknown as SetupState;
    expect(
      call('resolveGraft', {
        G: withGraft,
        ctx: { currentPlayer: s.currentPlayerID },
        playerID: other,
      }),
    ).toBe('graft-resolved');
    // 同一局面下回合主人不能代发
    expect(
      call('resolveGraft', {
        G: withGraft,
        ctx: { currentPlayer: s.currentPlayerID },
        playerID: s.currentPlayerID,
      }),
    ).toBe(INVALID_MOVE);
  });

  it('上下文里没有 playerID 时退回用 ctx.currentPlayer 当发起者', () => {
    const s = state();
    expect(call('probe', { G: s, ctx: { currentPlayer: s.currentPlayerID } })).toBe(
      s.currentPlayerID,
    );
  });

  it('保留 unwrapped 属性供测试工具读取形参', () => {
    expect(typeof (gated.probe.move as unknown as { unwrapped?: unknown }).unwrapped).toBe(
      'function',
    );
  });
});
