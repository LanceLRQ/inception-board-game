// 待结算闸门：有待结算事项时只放行结算它的 move

import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from '../game.js';
import type { SetupState } from '../setup.js';
import { createTestState } from '../testing/fixtures.js';
import {
  SETTLE_MOVES,
  blockedByPending,
  withSettleGate,
  type BlockingField,
} from './settleGate.js';
import { INVALID_MOVE } from './invalidMove.js';

const fields = Object.keys(SETTLE_MOVES) as BlockingField[];

/** 闸门只看字段是否有值，内容用占位对象即可 */
function withPending(...active: BlockingField[]): SetupState {
  const base = createTestState({ phase: 'playing', turnPhase: 'action' });
  const patch = Object.fromEntries(active.map((f) => [f, { placeholder: true }]));
  return { ...base, ...patch } as unknown as SetupState;
}

describe('待结算闸门', () => {
  it('没有待结算事项时放行任何 move', () => {
    const s = withPending();
    expect(blockedByPending(s, 'playKick')).toBeNull();
    expect(blockedByPending(s, 'endActionPhase')).toBeNull();
  });

  it.each(fields)('%s 有值时拒绝无关的 move', (field) => {
    const s = withPending(field);
    expect(blockedByPending(s, 'playKick')).toBe(field);
    expect(blockedByPending(s, 'doDraw')).toBe(field);
    expect(blockedByPending(s, 'endActionPhase')).toBe(field);
  });

  it.each(fields)('%s 有值时放行它自己的结算 move', (field) => {
    const s = withPending(field);
    for (const move of SETTLE_MOVES[field]) {
      expect(blockedByPending(s, move), move).toBeNull();
    }
  });

  it('两个待结算事项并存时，任一方的结算 move 都放行，其余仍然拒绝', () => {
    const s = withPending('pendingGraft', 'pendingResponseWindow');
    expect(blockedByPending(s, 'resolveGraft')).toBeNull();
    expect(blockedByPending(s, 'passResponse')).toBeNull();
    expect(blockedByPending(s, 'playKick')).toBe('pendingGraft');
  });

  it('白羊·星尘的待选择不进闸门，回合主人仍可结束行动阶段', () => {
    const s = withPending();
    const withAries = {
      ...s,
      pendingAriesChoice: { ariesID: '1', victimLayer: 1, victimID: '2' },
    } as SetupState;
    expect(blockedByPending(withAries, 'endActionPhase')).toBeNull();
    expect(blockedByPending(withAries, 'playKick')).toBeNull();
  });

  it('表里登记的结算 move 都是引擎里真实存在的', () => {
    const real = new Set(Object.keys(InceptionCityGame.phases.playing.moves));
    for (const field of fields) {
      for (const move of SETTLE_MOVES[field])
        expect(real.has(move), `${field} → ${move}`).toBe(true);
    }
  });
});

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
