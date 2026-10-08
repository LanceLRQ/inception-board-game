import { describe, it, expect } from 'vitest';
import {
  cardCategoryOf,
  cardTargetKind,
  cardVerdict,
  DEFAULT_PLAY_RULES,
  deriveMainAction,
  isBlockedInAction,
  playBlockReason,
  type PlayRuleContext,
} from './handDerive';

describe('cardCategoryOf', () => {
  it('射击 / 踢 / 死亡宣言是攻击，两种解封是解封，其余是辅助', () => {
    expect(cardCategoryOf('action_shoot')).toBe('attack');
    expect(cardCategoryOf('action_shoot_assassin')).toBe('attack');
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

describe('playBlockReason · 界面上看着能打、引擎必拒的牌', () => {
  const rules = (over: Partial<PlayRuleContext> = {}): PlayRuleContext => ({
    ...DEFAULT_PLAY_RULES,
    ...over,
  });

  it('梦主手里的【解封】不能打（只能在响应窗口里用效果②抵消）', () => {
    expect(playBlockReason('action_unlock', rules({ role: 'master' }))).toBe('masterNoUnlock');
    expect(playBlockReason('action_unlock', rules())).toBeNull();
  });

  it('本回合复活过自己：【解封】不能打，其他牌不受影响', () => {
    expect(playBlockReason('action_unlock', rules({ revivedSelfThisTurn: true }))).toBe(
      'revivedNoUnlock',
    );
    expect(playBlockReason('action_shoot', rules({ revivedSelfThisTurn: true }))).toBeNull();
  });

  it('梦主的【梦境窥视】要有持有贿赂牌的盗梦者才能打；盗梦者的效果①不看这个', () => {
    expect(playBlockReason('action_dream_peek', rules({ role: 'master' }))).toBe('noPeekTarget');
    expect(
      playBlockReason('action_dream_peek', rules({ role: 'master', hasPeekMasterTarget: true })),
    ).toBeNull();
    expect(playBlockReason('action_dream_peek', rules())).toBeNull();
  });

  it('【解封】：所在层心锁为 0、本回合解封次数用尽都打不出；其他牌不受影响', () => {
    expect(playBlockReason('action_unlock', rules({ layerHeartLock: 0 }))).toBe('noHeartLock');
    expect(playBlockReason('action_unlock', rules({ layerHeartLock: 2 }))).toBeNull();
    expect(playBlockReason('action_unlock', rules({ unlockExhausted: true }))).toBe('unlockLimit');
    expect(
      playBlockReason('action_shoot', rules({ layerHeartLock: 0, unlockExhausted: true })),
    ).toBe(null);
  });

  it('【梦魇解封】要有一层还盖着暗置的梦魇', () => {
    expect(
      playBlockReason('action_nightmare_unlock', rules({ hasNightmareUnlockTarget: false })),
    ).toBe('noNightmareTarget');
    expect(playBlockReason('action_nightmare_unlock', rules())).toBeNull();
  });

  it('已在迷失层：任何牌都不能打', () => {
    expect(playBlockReason('action_shoot', rules({ alive: false }))).toBe('dead');
    expect(playBlockReason('action_dream_transit', rules({ alive: false }))).toBe('dead');
  });

  it('cardVerdict 在出牌阶段轮到本人时把原因带出来，其余阶段仍按阶段判断', () => {
    const myAction = { isMyTurn: true, turnPhase: 'action', winner: null };
    expect(cardVerdict({ mode: 'idle', blockReason: 'masterNoUnlock' }, myAction)).toEqual({
      canPlay: false,
      reason: 'masterNoUnlock',
    });
    expect(
      cardVerdict({ mode: 'idle', blockReason: 'masterNoUnlock' }, { ...myAction, isMyTurn: false })
        .reason,
    ).toBe('notMyTurn');
  });
});

describe('cardTargetKind · 梦主的梦境窥视选玩家', () => {
  it('梦主走效果②：选目标玩家；盗梦者走效果①：选目标层', () => {
    expect(cardTargetKind('action_dream_peek', 'master')).toBe('player');
    expect(cardTargetKind('action_dream_peek')).toBe('layer');
  });
});
