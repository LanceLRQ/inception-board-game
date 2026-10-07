// 没有操作界面的待决状态：是否需要提示、是否轮到本人

import { describe, it, expect } from 'vitest';
import type { MatchView } from '@icgame/game-engine';
import { awaitingNotice } from './awaitingNotice';

function viewWith(patch: Partial<MatchView>): MatchView {
  return {
    currentPlayerID: '0',
    pendingLibra: null,
    pendingAriesChoice: null,
    pendingVirgoChoice: null,
    pendingShootResponse: null,
    pendingSudgerRolls: null,
    pendingResonance: null,
    pendingVaultDecision: null,
    pendingPeekDecision: null,
    dreamMasterID: '9',
    ...patch,
  } as MatchView;
}

describe('awaitingNotice', () => {
  it('没有待决状态时为 null', () => {
    expect(awaitingNotice(viewWith({}), '1')).toBeNull();
  });

  it('天秤未分牌：轮到被点名的目标', () => {
    const view = viewWith({
      pendingLibra: { bonderPlayerID: '0', targetPlayerID: '2', split: null },
    });
    expect(awaitingNotice(view, '2')).toEqual({ mine: true });
    expect(awaitingNotice(view, '0')).toEqual({ mine: false });
  });

  it('天秤已分牌：轮到发动者', () => {
    const view = viewWith({
      pendingLibra: {
        bonderPlayerID: '0',
        targetPlayerID: '2',
        split: { pile1: null, pile2: null, pile1Count: 1, pile2Count: 1 },
      },
    });
    expect(awaitingNotice(view, '0')).toEqual({ mine: true });
    expect(awaitingNotice(view, '2')).toEqual({ mine: false });
  });

  it('白羊选择：只有白羊本人的视图里带座位号', () => {
    const own = viewWith({
      pendingAriesChoice: { ariesID: '3', victimLayer: 1, victimID: '4' },
    });
    expect(awaitingNotice(own, '3')).toEqual({ mine: true });
    const hidden = viewWith({
      pendingAriesChoice: { ariesID: null, victimLayer: 1, victimID: '4' },
    });
    expect(awaitingNotice(hidden, '3')).toEqual({ mine: false });
  });

  it('处女选择：对本人不可见的点名不算本人', () => {
    const own = viewWith({
      pendingVirgoChoice: { virgoID: '3', triggerRoll: 6, shooterID: '1' },
    });
    expect(awaitingNotice(own, '3')).toEqual({ mine: true });
    const hidden = viewWith({
      pendingVirgoChoice: { virgoID: null, triggerRoll: 6, shooterID: '1' },
    });
    expect(awaitingNotice(hidden, '3')).toEqual({ mine: false });
  });

  it('射击响应：轮到被射击的目标', () => {
    const view = viewWith({
      pendingShootResponse: {
        shooterID: '1',
        targetPlayerID: '2',
        cardId: 'x',
        sameLayerRequired: false,
        deathFaces: [],
        moveFaces: [],
        extraOnMove: null,
        decreeId: null,
        preventMove: false,
        responseType: null,
      } as unknown as MatchView['pendingShootResponse'],
    });
    expect(awaitingNotice(view, '2')).toEqual({ mine: true });
    expect(awaitingNotice(view, '1')).toEqual({ mine: false });
  });

  it('判官掷骰选择：轮到当前回合玩家', () => {
    const view = viewWith({
      currentPlayerID: '4',
      pendingSudgerRolls: {
        rollA: 1,
        rollB: 2,
        targetPlayerID: '1',
        cardId: 'x',
        deathFaces: [],
        moveFaces: [],
        extraOnMove: null,
      } as unknown as MatchView['pendingSudgerRolls'],
    });
    expect(awaitingNotice(view, '4')).toEqual({ mine: true });
    expect(awaitingNotice(view, '1')).toEqual({ mine: false });
  });

  it('共鸣只是回合末自动结算的标记，不需要任何人应答', () => {
    const view = viewWith({
      pendingResonance: { bonderPlayerID: '0', targetPlayerID: '1' },
    });
    expect(awaitingNotice(view, '0')).toBeNull();
  });

  it('座位未知时一律不是本人', () => {
    const view = viewWith({
      pendingLibra: { bonderPlayerID: '0', targetPlayerID: '2', split: null },
    });
    expect(awaitingNotice(view, null)).toEqual({ mine: false });
  });

  it('金币金库三选一：等梦主；梦主有自己的弹窗，不再叠一条提示', () => {
    const view = viewWith({ pendingVaultDecision: { layer: 2, openerID: '1' } });
    expect(awaitingNotice(view, '9')).toEqual({ mine: true, hasOwnUi: true });
    expect(awaitingNotice(view, '1')).toEqual({ mine: false });
    expect(awaitingNotice(view, '3')).toEqual({ mine: false });
    expect(awaitingNotice(view, null)).toEqual({ mine: false });
  });

  it('金币金库三选一挡住全局，白羊的选择不挡人：两者并存时先等梦主', () => {
    const view = viewWith({
      pendingVaultDecision: { layer: 2, openerID: '1' },
      pendingAriesChoice: { ariesID: '3', victimLayer: 1, victimID: '4' },
    });
    expect(awaitingNotice(view, '9')).toEqual({ mine: true, hasOwnUi: true });
    expect(awaitingNotice(view, '3')).toEqual({ mine: false });
  });

  it('梦境窥视等梦主决定是否派贿赂：其他人看到等待，梦主有自己的弹窗', () => {
    const view = viewWith({ pendingPeekDecision: { peekerID: '1', targetLayer: 2 } });
    expect(awaitingNotice(view, '9')).toEqual({ mine: true, hasOwnUi: true });
    expect(awaitingNotice(view, '1')).toEqual({ mine: false });
  });
});
