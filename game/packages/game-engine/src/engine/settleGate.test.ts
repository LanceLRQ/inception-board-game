// 待结算闸门：有待结算事项时只放行结算它的 move

import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from '../game.js';
import type { SetupState } from '../setup.js';
import { createTestState } from '../testing/fixtures.js';
import { SETTLE_MOVES, blockedByPending, type BlockingField } from './settleGate.js';

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
