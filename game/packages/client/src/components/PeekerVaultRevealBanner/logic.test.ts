// 盗梦者金库查看 banner 纯逻辑测试

import { describe, it, expect } from 'vitest';
import type { SetupState } from '@icgame/game-engine';
import { computePeekerVaultRevealState } from './logic.js';

function makeState(overrides: Partial<SetupState> = {}): SetupState {
  return {
    peekReveal: { peekerID: '0', revealKind: 'vault', vaultLayer: 2 },
    vaults: [
      { id: 'v-1', layer: 1, contentType: 'secret', isOpened: false, openedBy: null },
      { id: 'v-2', layer: 2, contentType: 'coin', isOpened: false, openedBy: null },
      { id: 'v-3', layer: 3, contentType: 'coin', isOpened: false, openedBy: null },
    ],
    ...overrides,
  } as unknown as SetupState;
}

describe('computePeekerVaultRevealState', () => {
  it('G null → visible=false', () => {
    expect(computePeekerVaultRevealState(null, '0').visible).toBe(false);
  });

  it('无 peekReveal → visible=false', () => {
    const s = makeState({ peekReveal: null });
    expect(computePeekerVaultRevealState(s, '0').visible).toBe(false);
  });

  it('viewer 非 peekerID → visible=false', () => {
    const s = makeState();
    expect(computePeekerVaultRevealState(s, '1').visible).toBe(false);
  });

  it('peeker 视角：透传 vaultLayer 对应 vault', () => {
    const s = makeState();
    const r = computePeekerVaultRevealState(s, '0');
    expect(r.visible).toBe(true);
    expect(r.layer).toBe(2);
    expect(r.vaults).toEqual([{ id: 'v-2', contentType: 'coin', isOpened: false }]);
  });

  it('不返回其他层的 vault', () => {
    const s = makeState();
    const r = computePeekerVaultRevealState(s, '0');
    expect(r.vaults.every((v) => v.id === 'v-2')).toBe(true);
  });

  it('revealKind 非 vault → visible=false（防御未来扩展）', () => {
    const s = makeState({
      peekReveal: {
        peekerID: '0',
        revealKind: 'unknown' as 'vault',
        vaultLayer: 2,
      },
    });
    expect(computePeekerVaultRevealState(s, '0').visible).toBe(false);
  });
});
