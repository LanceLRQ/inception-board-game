// 解封响应 banner 纯逻辑测试

import { describe, it, expect } from 'vitest';
import type { SetupState } from '@icgame/game-engine';
import type { CardID } from '@icgame/shared';
import { computeUnlockResponseState } from './logic.js';

function makeState(overrides: Partial<SetupState> = {}): SetupState {
  return {
    pendingUnlock: { playerID: '1', layer: 2, cardId: 'action_unlock' as CardID },
    pendingResponseWindow: {
      sourceAbilityID: 'action_unlock_effect_1',
      responders: ['0', '2', '3'],
      responded: [],
      timeoutMs: 30_000,
      validResponseAbilityIDs: ['action_unlock_effect_2'],
      onTimeout: 'resolve',
      parentWindow: null,
    },
    players: {
      '0': { isAlive: true, hand: ['action_unlock'] as CardID[] } as never,
      '1': { isAlive: true, hand: [] as CardID[] } as never,
      '2': { isAlive: true, hand: [] as CardID[] } as never,
      '3': { isAlive: true, hand: [] as CardID[] } as never,
    },
    ...overrides,
  } as unknown as SetupState;
}

describe('computeUnlockResponseState', () => {
  it('G 为 null → visible=false', () => {
    expect(computeUnlockResponseState(null, '0').visible).toBe(false);
  });

  it('无 pendingResponseWindow → visible=false', () => {
    const s = makeState({ pendingResponseWindow: null });
    expect(computeUnlockResponseState(s, '0').visible).toBe(false);
  });

  it('sourceAbilityID 不是 unlock → visible=false', () => {
    const s = makeState({
      pendingResponseWindow: {
        sourceAbilityID: 'other_source',
        responders: ['0'],
        responded: [],
        timeoutMs: 30_000,
        validResponseAbilityIDs: [],
        onTimeout: 'resolve',
        parentWindow: null,
      },
    });
    expect(computeUnlockResponseState(s, '0').visible).toBe(false);
  });

  it('viewer 不在 responders → visible=false', () => {
    const s = makeState();
    expect(computeUnlockResponseState(s, '9').visible).toBe(false);
  });

  it('viewer 已 responded → visible=false', () => {
    const s = makeState({
      pendingResponseWindow: {
        sourceAbilityID: 'action_unlock_effect_1',
        responders: ['0', '2'],
        responded: ['0'],
        timeoutMs: 30_000,
        validResponseAbilityIDs: ['action_unlock_effect_2'],
        onTimeout: 'resolve',
        parentWindow: null,
      },
    });
    expect(computeUnlockResponseState(s, '0').visible).toBe(false);
  });

  it('正常触发：持卡 → canCancel=true', () => {
    const s = makeState();
    const r = computeUnlockResponseState(s, '0');
    expect(r.visible).toBe(true);
    expect(r.canCancel).toBe(true);
    expect(r.unlockerID).toBe('1');
    expect(r.layer).toBe(2);
    expect(r.remainingResponders).toBe(3);
  });

  it('无 action_unlock 手牌 → canCancel=false，仍 visible', () => {
    const s = makeState({
      players: {
        '0': { isAlive: true, hand: [] as CardID[] } as never,
        '1': { isAlive: true, hand: [] as CardID[] } as never,
        '2': { isAlive: true, hand: [] as CardID[] } as never,
        '3': { isAlive: true, hand: [] as CardID[] } as never,
      },
    });
    const r = computeUnlockResponseState(s, '0');
    expect(r.visible).toBe(true);
    expect(r.canCancel).toBe(false);
  });

  it('viewer 已死 → canCancel=false', () => {
    const s = makeState({
      players: {
        '0': { isAlive: false, hand: ['action_unlock'] as CardID[] } as never,
        '1': { isAlive: true, hand: [] as CardID[] } as never,
        '2': { isAlive: true, hand: [] as CardID[] } as never,
        '3': { isAlive: true, hand: [] as CardID[] } as never,
      },
    });
    expect(computeUnlockResponseState(s, '0').canCancel).toBe(false);
  });
});
