// 梦境窥视派贿赂决策 banner 纯逻辑测试

import { describe, it, expect } from 'vitest';
import type { MatchView } from '@icgame/game-engine';
import {
  computeMasterPeekBribeState,
  imperialPoolChoices,
  peekBribeDecisionArgs,
} from './logic.js';

function makeState(overrides: Partial<MatchView> = {}): MatchView {
  return {
    dreamMasterID: '4',
    pendingPeekDecision: { peekerID: '1', targetLayer: 3 },
    bribePool: [
      { id: 'b-1', kind: 'fail', status: 'inPool', heldBy: null },
      { id: 'b-2', kind: 'fail', status: 'dispatched', heldBy: '2' },
    ],
    ...overrides,
  } as unknown as MatchView;
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
        { id: 'b-1', kind: 'fail', status: 'inPool', heldBy: null },
        { id: 'b-2', kind: 'fail', status: 'inPool', heldBy: null },
        { id: 'b-3', kind: 'fail', status: 'dispatched', heldBy: '2' },
      ],
    });
    expect(computeMasterPeekBribeState(s, '4').inPoolCount).toBe(2);
  });
});

/** 非皇城梦主的视图：池内的牌成败看不到 */
const hiddenPoolItem = { id: 'b-1', kind: null, status: 'inPool', heldBy: null } as const;

describe('imperialPoolChoices', () => {
  it('成败都看不到（非皇城）→ null', () => {
    expect(imperialPoolChoices(makeState({ bribePool: [hiddenPoolItem] }))).toBeNull();
  });

  it('池里没有未派出的牌 → null', () => {
    const s = makeState({
      bribePool: [{ id: 'b-1', kind: null, status: 'dispatched', heldBy: '2' }],
    });
    expect(imperialPoolChoices(s)).toBeNull();
  });

  it('看得到成败（皇城）→ 列出未派出的牌及其在池中的下标', () => {
    const s = makeState({
      bribePool: [
        { id: 'b-1', kind: null, status: 'dispatched', heldBy: '2' },
        { id: 'b-2', kind: 'deal', status: 'inPool', heldBy: null },
        { id: 'b-3', kind: 'fail', status: 'inPool', heldBy: null },
      ],
    });
    expect(imperialPoolChoices(s)).toEqual([
      { index: 1, kind: 'deal' },
      { index: 2, kind: 'fail' },
    ]);
  });

  it('computeMasterPeekBribeState 带出可指定的牌', () => {
    const s = makeState({
      bribePool: [{ id: 'b-1', kind: 'fail', status: 'inPool', heldBy: null }],
    });
    expect(computeMasterPeekBribeState(s, '4').poolChoices).toEqual([{ index: 0, kind: 'fail' }]);
    const hidden = makeState({ bribePool: [hiddenPoolItem] });
    expect(computeMasterPeekBribeState(hidden, '4').poolChoices).toBeNull();
  });
});

describe('peekBribeDecisionArgs', () => {
  it('跳过 / 随机派发 / 指定一张', () => {
    expect(peekBribeDecisionArgs(false, null)).toEqual([false]);
    expect(peekBribeDecisionArgs(true, null)).toEqual([true]);
    expect(peekBribeDecisionArgs(true, 2)).toEqual([true, 2]);
  });
});
