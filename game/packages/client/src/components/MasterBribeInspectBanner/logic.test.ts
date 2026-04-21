// 梦主查看盗梦者贿赂牌 banner 纯逻辑测试

import { describe, it, expect } from 'vitest';
import type { SetupState } from '@icgame/game-engine';
import { computeMasterBribeInspectState } from './logic.js';

function makeState(overrides: Partial<SetupState> = {}): SetupState {
  return {
    peekReveal: { peekerID: '4', revealKind: 'bribe', targetThiefID: '2' },
    bribePool: [
      { id: 'b-1', status: 'dealt', heldBy: '2', originalOwnerId: '2' },
      { id: 'b-2', status: 'deal', heldBy: '2', originalOwnerId: '2' },
      { id: 'b-3', status: 'inPool', heldBy: null, originalOwnerId: null },
      { id: 'b-4', status: 'dealt', heldBy: '3', originalOwnerId: '3' },
    ],
    ...overrides,
  } as unknown as SetupState;
}

describe('computeMasterBribeInspectState', () => {
  it('G null → visible=false', () => {
    expect(computeMasterBribeInspectState(null, '4').visible).toBe(false);
  });

  it('无 peekReveal → visible=false', () => {
    const s = makeState({ peekReveal: null });
    expect(computeMasterBribeInspectState(s, '4').visible).toBe(false);
  });

  it('revealKind=vault → visible=false', () => {
    const s = makeState({
      peekReveal: { peekerID: '4', revealKind: 'vault', vaultLayer: 2 },
    });
    expect(computeMasterBribeInspectState(s, '4').visible).toBe(false);
  });

  it('viewer 非 peekerID → visible=false', () => {
    const s = makeState();
    expect(computeMasterBribeInspectState(s, '1').visible).toBe(false);
  });

  it('peeker(梦主)视角：透传 target 的所有贿赂牌', () => {
    const s = makeState();
    const r = computeMasterBribeInspectState(s, '4');
    expect(r.visible).toBe(true);
    expect(r.targetThiefID).toBe('2');
    expect(r.bribes).toHaveLength(2);
    expect(r.bribes.map((b) => b.id).sort()).toEqual(['b-1', 'b-2']);
  });

  it('不返回其他盗梦者持有的贿赂牌', () => {
    const s = makeState();
    const r = computeMasterBribeInspectState(s, '4');
    expect(r.bribes.every((b) => b.id !== 'b-4')).toBe(true);
  });

  it('target 无贿赂时 bribes 为空', () => {
    const s = makeState({
      peekReveal: { peekerID: '4', revealKind: 'bribe', targetThiefID: '9' },
    });
    const r = computeMasterBribeInspectState(s, '4');
    expect(r.visible).toBe(true);
    expect(r.bribes).toEqual([]);
  });
});
