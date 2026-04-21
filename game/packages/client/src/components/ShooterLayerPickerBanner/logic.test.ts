// SHOOT 发动方选层 banner 纯逻辑测试

import { describe, it, expect } from 'vitest';
import type { SetupState } from '@icgame/game-engine';
import { computeShooterLayerPickerState } from './logic.js';

function makeState(overrides: Partial<SetupState> = {}): SetupState {
  return {
    pendingShootMove: {
      shooterID: '0',
      targetPlayerID: '1',
      cardId: 'action_shoot',
      extraOnMove: null,
      choices: [1, 3],
    },
    ...overrides,
  } as unknown as SetupState;
}

describe('computeShooterLayerPickerState', () => {
  it('G null → visible=false', () => {
    expect(computeShooterLayerPickerState(null, '0').visible).toBe(false);
  });

  it('无 pendingShootMove → visible=false', () => {
    const s = makeState({
      pendingShootMove: null,
    } as unknown as Partial<SetupState>);
    expect(computeShooterLayerPickerState(s, '0').visible).toBe(false);
  });

  it('viewer 非发动方 → visible=false', () => {
    const s = makeState();
    expect(computeShooterLayerPickerState(s, '1').visible).toBe(false);
  });

  it('viewer 是发动方 → visible=true 且透传 target/choices/cardId', () => {
    const s = makeState();
    const r = computeShooterLayerPickerState(s, '0');
    expect(r.visible).toBe(true);
    expect(r.targetPlayerID).toBe('1');
    expect(r.cardId).toBe('action_shoot');
    expect(r.choices).toEqual([1, 3]);
  });

  it('L3 目标 choices=[2,4]', () => {
    const s = makeState({
      pendingShootMove: {
        shooterID: '0',
        targetPlayerID: '1',
        cardId: 'action_shoot_king',
        extraOnMove: null,
        choices: [2, 4],
      },
    } as unknown as Partial<SetupState>);
    expect(computeShooterLayerPickerState(s, '0').choices).toEqual([2, 4]);
  });
});
