// 金币金库三选一决策纯逻辑测试

import { describe, it, expect } from 'vitest';
import type { MatchView } from '@icgame/game-engine';
import { computeVaultDecisionState, computeVaultDecisionCommand } from './logic.js';

const EMPTY_DRAFT = { poolIndex: null, echoLayer: null, echoAction: null } as const;

function makeView(overrides: Partial<MatchView> = {}): MatchView {
  return {
    dreamMasterID: 'pM',
    pendingVaultDecision: { layer: 2, openerID: 'p1' },
    layers: {
      2: { layer: 2, nightmareId: 'nightmare_despair_storm', nightmareRevealed: false },
    },
    bribePool: [
      { id: 'b-1', status: 'inPool', heldBy: null, kind: null },
      { id: 'b-2', status: 'inPool', heldBy: null, kind: null },
      { id: 'b-3', status: 'dispatched', heldBy: 'p2', kind: null },
    ],
    ...overrides,
  } as unknown as MatchView;
}

describe('computeVaultDecisionState', () => {
  it('视图为空 → 不显示', () => {
    expect(computeVaultDecisionState(null, 'pM').visible).toBe(false);
  });

  it('没有待决的金库决策 → 不显示', () => {
    expect(computeVaultDecisionState(makeView({ pendingVaultDecision: null }), 'pM').visible).toBe(
      false,
    );
  });

  it('观看者不是梦主 → 不显示', () => {
    expect(computeVaultDecisionState(makeView(), 'p1').visible).toBe(false);
  });

  it('不看回合与阶段：他人回合、弃牌阶段梦主也显示', () => {
    const view = makeView({ currentPlayerID: 'p1', turnPhase: 'discard' } as Partial<MatchView>);
    const s = computeVaultDecisionState(view, 'pM');
    expect(s.visible).toBe(true);
    expect(s.layer).toBe(2);
    expect(s.openerID).toBe('p1');
  });

  it('梦主看得到梦魇：有梦魇与名称，三项都可选', () => {
    const s = computeVaultDecisionState(makeView(), 'pM');
    expect(s.hasNightmare).toBe(true);
    expect(s.nightmareId).toBe('nightmare_despair_storm');
    expect(s.poolCount).toBe(2);
    expect(s.bribe).toEqual({ enabled: true, reason: null });
    expect(s.nightmare).toEqual({ enabled: true, reason: null });
  });

  it('贿赂池没有可派的牌：派发禁用并说明原因', () => {
    const view = makeView({
      bribePool: [{ id: 'b-1', status: 'dispatched', heldBy: 'p2', kind: null }],
    } as Partial<MatchView>);
    const s = computeVaultDecisionState(view, 'pM');
    expect(s.poolCount).toBe(0);
    expect(s.bribe).toEqual({ enabled: false, reason: 'poolEmpty' });
  });

  it('该层没有梦魇：发动禁用并说明原因', () => {
    const view = makeView({
      layers: { 2: { layer: 2, nightmareId: null, nightmareRevealed: false } },
    } as unknown as Partial<MatchView>);
    const s = computeVaultDecisionState(view, 'pM');
    expect(s.hasNightmare).toBe(false);
    expect(s.nightmare).toEqual({ enabled: false, reason: 'noNightmare' });
    expect(s.bribe.enabled).toBe(true);
  });

  it('回音萦绕发动需要选层与方式，其余梦魇不需要', () => {
    const echo = makeView({
      layers: { 2: { layer: 2, nightmareId: 'nightmare_echo', nightmareRevealed: false } },
    } as unknown as Partial<MatchView>);
    expect(computeVaultDecisionState(echo, 'pM').nightmareParams).toBe('echo');
    expect(computeVaultDecisionState(makeView(), 'pM').nightmareParams).toBe('none');
  });

  it('池内成败看不到（非皇城）：不提供指定', () => {
    expect(computeVaultDecisionState(makeView(), 'pM').poolChoices).toBeNull();
  });

  it('池内成败看得到（皇城）：列出每张未派出的牌及其下标', () => {
    const view = makeView({
      bribePool: [
        { id: 'b-1', status: 'dispatched', heldBy: 'p2', kind: null },
        { id: 'b-2', status: 'inPool', heldBy: null, kind: 'deal' },
        { id: 'b-3', status: 'inPool', heldBy: null, kind: 'fail' },
      ],
    } as Partial<MatchView>);
    expect(computeVaultDecisionState(view, 'pM').poolChoices).toEqual([
      { index: 1, kind: 'deal' },
      { index: 2, kind: 'fail' },
    ]);
  });
});

describe('computeVaultDecisionCommand', () => {
  const state = computeVaultDecisionState(makeView(), 'pM');

  it('不可见 → null', () => {
    const hidden = computeVaultDecisionState(null, 'pM');
    expect(computeVaultDecisionCommand(hidden, 'discard', EMPTY_DRAFT)).toBeNull();
  });

  it('派发贿赂：随机派发不带参数', () => {
    expect(computeVaultDecisionCommand(state, 'bribe', EMPTY_DRAFT)).toEqual({
      move: 'masterVaultDecision',
      args: ['bribe'],
    });
  });

  it('派发贿赂：皇城指定下标', () => {
    const view = makeView({
      bribePool: [{ id: 'b-1', status: 'inPool', heldBy: null, kind: 'deal' }],
    } as Partial<MatchView>);
    const s = computeVaultDecisionState(view, 'pM');
    expect(computeVaultDecisionCommand(s, 'bribe', { ...EMPTY_DRAFT, poolIndex: 0 })).toEqual({
      move: 'masterVaultDecision',
      args: ['bribe', { poolIndex: 0 }],
    });
  });

  it('派发贿赂：池已空 → null', () => {
    const view = makeView({ bribePool: [] } as Partial<MatchView>);
    const s = computeVaultDecisionState(view, 'pM');
    expect(computeVaultDecisionCommand(s, 'bribe', EMPTY_DRAFT)).toBeNull();
  });

  it('发动梦魇：不需要参数的梦魇直接发', () => {
    expect(computeVaultDecisionCommand(state, 'nightmare', EMPTY_DRAFT)).toEqual({
      move: 'masterVaultDecision',
      args: ['nightmare'],
    });
  });

  it('发动梦魇：该层没有梦魇 → null', () => {
    const view = makeView({
      layers: { 2: { layer: 2, nightmareId: null, nightmareRevealed: false } },
    } as unknown as Partial<MatchView>);
    const s = computeVaultDecisionState(view, 'pM');
    expect(computeVaultDecisionCommand(s, 'nightmare', EMPTY_DRAFT)).toBeNull();
  });

  it('发动回音萦绕：层与方式没选完 → null，选完带上参数', () => {
    const view = makeView({
      layers: { 2: { layer: 2, nightmareId: 'nightmare_echo', nightmareRevealed: false } },
    } as unknown as Partial<MatchView>);
    const s = computeVaultDecisionState(view, 'pM');
    expect(computeVaultDecisionCommand(s, 'nightmare', EMPTY_DRAFT)).toBeNull();
    expect(
      computeVaultDecisionCommand(s, 'nightmare', { ...EMPTY_DRAFT, echoLayer: 3 }),
    ).toBeNull();
    expect(
      computeVaultDecisionCommand(s, 'nightmare', {
        ...EMPTY_DRAFT,
        echoLayer: 3,
        echoAction: 'add',
      }),
    ).toEqual({
      move: 'masterVaultDecision',
      args: ['nightmare', { targetLayer: 3, action: 'add' }],
    });
  });

  it('弃掉梦魇 / 不派发：始终可发，不带参数', () => {
    const view = makeView({
      layers: { 2: { layer: 2, nightmareId: null, nightmareRevealed: false } },
      bribePool: [],
    } as unknown as Partial<MatchView>);
    const s = computeVaultDecisionState(view, 'pM');
    expect(computeVaultDecisionCommand(s, 'discard', EMPTY_DRAFT)).toEqual({
      move: 'masterVaultDecision',
      args: ['discard'],
    });
  });
});
