import { describe, it, expect } from 'vitest';
import {
  SHEET_DRAG_DISTANCE,
  cardCategoryOf,
  cardTargetKind,
  cardVerdict,
  deriveMainAction,
  isBlockedInAction,
  sheetDragOutcome,
} from './dockDerive';

describe('cardCategoryOf', () => {
  it('射击 / 踢 / 死亡宣言是攻击，两种解封是解封，其余是辅助', () => {
    expect(cardCategoryOf('action_shoot')).toBe('attack');
    expect(cardCategoryOf('action_shoot_king')).toBe('attack');
    expect(cardCategoryOf('action_kick')).toBe('attack');
    expect(cardCategoryOf('action_death_decree_3')).toBe('attack');
    expect(cardCategoryOf('action_unlock')).toBe('unlock');
    expect(cardCategoryOf('action_nightmare_unlock')).toBe('unlock');
    expect(cardCategoryOf('action_creation')).toBe('support');
    expect(cardCategoryOf('action_dream_transit')).toBe('support');
  });
});

describe('cardTargetKind', () => {
  it('按出牌映射给出目标要求', () => {
    expect(cardTargetKind('action_shoot')).toBe('player');
    expect(cardTargetKind('action_dream_transit')).toBe('layer');
    expect(cardTargetKind('action_unlock')).toBe('none');
  });

  it('穿梭剂 SHOOT 与万有引力要先选择，死亡宣言随 SHOOT 打出', () => {
    expect(cardTargetKind('action_shoot_dream_transit')).toBe('choice');
    expect(cardTargetKind('action_gravity')).toBe('choice');
    expect(cardTargetKind('action_death_decree_4')).toBe('decree');
  });

  it('不是行动牌时没有目标要求', () => {
    expect(cardTargetKind('thief_char_x')).toBeNull();
  });
});

describe('cardVerdict', () => {
  const myAction = { isMyTurn: true, turnPhase: 'action', winner: null };

  it('可出的牌：能打', () => {
    expect(cardVerdict({ mode: 'play' }, myAction)).toEqual({ canPlay: true, reason: 'ok' });
  });

  it('弃牌阶段给出弃牌原因', () => {
    expect(cardVerdict({ mode: 'discard' }, { ...myAction, turnPhase: 'discard' })).toEqual({
      canPlay: false,
      reason: 'discardPhase',
    });
  });

  it('不能打时按原因分类：胜负已分 > 不是本人回合 > 不是行动阶段 > 没有出牌界面', () => {
    expect(cardVerdict({ mode: 'idle' }, { ...myAction, winner: 'thief' }).reason).toBe('gameOver');
    expect(cardVerdict({ mode: 'idle' }, { ...myAction, isMyTurn: false }).reason).toBe(
      'notMyTurn',
    );
    expect(cardVerdict({ mode: 'idle' }, { ...myAction, turnPhase: 'draw' }).reason).toBe(
      'notActionPhase',
    );
    expect(cardVerdict({ mode: 'idle' }, myAction).reason).toBe('noUi');
  });
});

describe('isBlockedInAction', () => {
  const myAction = { isMyTurn: true, turnPhase: 'action', winner: null };
  it('只有本人行动阶段里打不出的牌算受阻', () => {
    expect(isBlockedInAction({ mode: 'idle' }, myAction)).toBe(true);
    expect(isBlockedInAction({ mode: 'play' }, myAction)).toBe(false);
    expect(isBlockedInAction({ mode: 'idle' }, { ...myAction, isMyTurn: false })).toBe(false);
    expect(isBlockedInAction({ mode: 'idle' }, { ...myAction, turnPhase: 'draw' })).toBe(false);
  });
});

describe('deriveMainAction', () => {
  const base = {
    isMine: true,
    winner: null,
    phase: 'action',
    overflow: 0,
    canConfirmDiscard: false,
  };

  it('随阶段变化', () => {
    expect(deriveMainAction({ ...base, phase: 'draw' })).toMatchObject({
      kind: 'draw',
      enabled: true,
      testId: 'action-draw',
    });
    expect(deriveMainAction(base)).toMatchObject({ kind: 'end', testId: 'action-end' });
    expect(deriveMainAction({ ...base, phase: 'discard' })).toMatchObject({
      kind: 'skipDiscard',
      testId: 'action-skip-discard',
    });
  });

  it('弃牌超限时是确认弃牌，选够张数才可点', () => {
    const over = { ...base, phase: 'discard', overflow: 2 };
    expect(deriveMainAction(over)).toMatchObject({
      kind: 'confirmDiscard',
      enabled: false,
      testId: 'action-confirm-discard',
    });
    expect(deriveMainAction({ ...over, canConfirmDiscard: true }).enabled).toBe(true);
  });

  it('不是本人回合或对局已结束：等待且禁用', () => {
    expect(deriveMainAction({ ...base, isMine: false })).toMatchObject({
      kind: 'wait',
      enabled: false,
    });
    expect(deriveMainAction({ ...base, winner: 'thief' }).kind).toBe('wait');
  });

  it('未知阶段按等待处理', () => {
    expect(deriveMainAction({ ...base, phase: 'turnStart' }).kind).toBe('wait');
  });
});

describe('sheetDragOutcome', () => {
  it('收起态：向上拖够距离展开，向下拖或距离不够不动', () => {
    expect(sheetDragOutcome({ open: false, movementY: -SHEET_DRAG_DISTANCE, velocityY: 0 })).toBe(
      'open',
    );
    expect(sheetDragOutcome({ open: false, movementY: -10, velocityY: 0.1 })).toBeNull();
    expect(sheetDragOutcome({ open: false, movementY: 80, velocityY: 1 })).toBeNull();
  });

  it('展开态：向下拖够距离收起，向上拖不动', () => {
    expect(sheetDragOutcome({ open: true, movementY: SHEET_DRAG_DISTANCE, velocityY: 0 })).toBe(
      'close',
    );
    expect(sheetDragOutcome({ open: true, movementY: -80, velocityY: 1 })).toBeNull();
  });

  it('快速轻扫：距离不够但速度够也生效', () => {
    expect(sheetDragOutcome({ open: false, movementY: -15, velocityY: 0.8 })).toBe('open');
    expect(sheetDragOutcome({ open: true, movementY: 15, velocityY: 0.8 })).toBe('close');
    expect(sheetDragOutcome({ open: true, movementY: 4, velocityY: 0.8 })).toBeNull();
  });
});
