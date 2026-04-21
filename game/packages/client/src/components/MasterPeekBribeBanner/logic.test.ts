// 梦境窥视派贿赂决策 banner 纯逻辑测试

import { describe, it, expect } from 'vitest';
import type { SetupState } from '@icgame/game-engine';
import { computeMasterPeekBribeState } from './logic.js';

function makeState(overrides: Partial<SetupState> = {}): SetupState {
  return {
    dreamMasterID: '4',
    pendingPeekDecision: { peekerID: '1', targetLayer: 3 },
    bribePool: [
      { id: 'b-1', status: 'inPool', heldBy: null, originalOwnerId: null },
      { id: 'b-2', status: 'dealt', heldBy: '2', originalOwnerId: '2' },
    ],
    ...overrides,
  } as unknown as SetupState;
}

describe('computeMasterPeekBribeState', () => {
  it('G null → visible=false', () => {
    expect(computeMasterPeekBribeState(null, '4').visible).toBe(false);
  });

  it('无 pendingPeekDecision → visible=false', () => {
    const s = makeState({ pendingPeekDecision: null });
    expect(computeMasterPeekBribeState(s, '4').visible).toBe(false);
  });

  it('viewer 非梦主 → visible=false', () => {
    const s = makeState();
    expect(computeMasterPeekBribeState(s, '1').visible).toBe(false);
  });

  it('viewer 是梦主 → visible=true', () => {
    const s = makeState();
    const r = computeMasterPeekBribeState(s, '4');
    expect(r.visible).toBe(true);
    expect(r.peekerID).toBe('1');
    expect(r.layer).toBe(3);
    expect(r.inPoolCount).toBe(1);
  });

  it('inPoolCount 正确统计', () => {
    const s = makeState({
      bribePool: [
        { id: 'b-1', status: 'inPool', heldBy: null, originalOwnerId: null },
        { id: 'b-2', status: 'inPool', heldBy: null, originalOwnerId: null },
        { id: 'b-3', status: 'dealt', heldBy: '2', originalOwnerId: '2' },
      ],
    });
    expect(computeMasterPeekBribeState(s, '4').inPoolCount).toBe(2);
  });
});
