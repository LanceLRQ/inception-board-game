// 响应窗口（解封抵消）回归测试 · W19-B F1
// 对照：plans/report/phase3-out-of-turn-interaction-review.md OOT-01
// 对照：docs/manual/04-action-cards.md 解封（效果①/效果②）
//
// 本测试覆盖"盗梦者打出【解封】效果① → 其他玩家可出【解封】效果② 抵消"完整链路。
// 测试目标：
//   1. playUnlock 必须开启响应窗口（pendingResponseWindow）且 responders 不含 unlocker
//   2. respondCancelUnlock(responderID) 必须校验 responderID ∈ responders ∧ 手中有 action_unlock
//   3. respondCancelUnlock 成功后必须弃 responder 的 1 张 action_unlock 到弃牌堆
//   4. respondCancelUnlock 成功后 pendingUnlock / pendingResponseWindow 都要清空
//   5. 规则"效果②不可被再次抵消"靠"窗口已关闭 → 再调 INVALID"达成
//   6. passResponse(responderID) 校验 responder 合法 & 未重复 pass
//   7. 全员 pass 后自动结算为解封成功（heartLockValue - 1 / successfulUnlocksThisTurn + 1）
//   8. 死亡玩家不在 responders 中
//   9. 梦主持有 action_unlock 也能抵消（规则"任何玩家"均可）
//
// 当前实现（W19 前）的已知缺陷（本测试初版会 red）：
//   - playUnlock 未开启响应窗口
//   - respondCancelUnlock 无任何校验，任意玩家可调用且不弃牌
//   - passResponse 是 noop，未记录响应状态
//   详见 plans/report/phase3-out-of-turn-interaction-review.md OOT-01

import { describe, it, expect } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import { createTestState, callMove, makePlayer, withHand } from './testing/fixtures.js';
import type { SetupState } from './setup.js';

const UNLOCK_CARD: CardID = 'action_unlock' as CardID;

/**
 * 构造一个开始解封响应窗口场景的 state 工厂。
 *
 * 默认：
 *   - P1 盗梦者：layer 1，手牌 [UNLOCK_CARD]（解封者）
 *   - P2 盗梦者：layer 2，手牌 [UNLOCK_CARD]（有牌响应者）
 *   - P3 盗梦者：layer 2，手牌 []（无牌响应者）
 *   - P4 盗梦者：layer 1，死亡
 *   - PM 梦主：layer 1，手牌 [UNLOCK_CARD]（梦主也拿到解封以测试"任何玩家"）
 *   - 第 1 层心锁 = 2（解封后 2-1=1，不触发金库开启）
 *
 * 调用 playUnlock 之前返回；由测试内部按需驱动 move。
 */
function sceneBeforeUnlock(): SetupState {
  const base = createTestState({
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 1,
    currentPlayerID: 'p1',
    dreamMasterID: 'pM',
  });
  const players = {
    ...base.players,
    p1: makePlayer({
      id: 'p1',
      nickname: 'P1',
      faction: 'thief',
      currentLayer: 1 as Layer,
      hand: [UNLOCK_CARD],
    }),
    p2: makePlayer({
      id: 'p2',
      nickname: 'P2',
      faction: 'thief',
      currentLayer: 2 as Layer,
      hand: [UNLOCK_CARD],
    }),
    p3: makePlayer({
      id: 'p3',
      nickname: 'P3',
      faction: 'thief',
      currentLayer: 2 as Layer,
      hand: [],
    }),
    p4: makePlayer({
      id: 'p4',
      nickname: 'P4',
      faction: 'thief',
      currentLayer: 1 as Layer,
      hand: [UNLOCK_CARD],
      isAlive: false,
      deathTurn: 1,
    }),
    pM: makePlayer({
      id: 'pM',
      nickname: 'M',
      faction: 'master',
      currentLayer: 1 as Layer,
      hand: [UNLOCK_CARD],
    }),
  };
  return {
    ...base,
    players,
    layers: {
      ...base.layers,
      1: {
        ...base.layers[1]!,
        heartLockValue: 2,
        playersInLayer: ['p1', 'p4', 'pM'],
      },
      2: {
        ...base.layers[2]!,
        playersInLayer: ['p2', 'p3'],
      },
      3: { ...base.layers[3]!, playersInLayer: [] },
      4: { ...base.layers[4]!, playersInLayer: [] },
    },
  };
}

/** 执行 playUnlock 并 assert 成功，返回 post-state */
function doPlayUnlock(state: SetupState): SetupState {
  const r = callMove(state, 'playUnlock', [UNLOCK_CARD], { currentPlayer: 'p1' });
  if (r === 'INVALID_MOVE') throw new Error('fixture: playUnlock should succeed');
  return r;
}

describe('OOT-01 · 解封响应窗口（F1 red test）', () => {
  describe('playUnlock 必须开启响应窗口', () => {
    it('成功 playUnlock 后 pendingResponseWindow 非空', () => {
      const s0 = sceneBeforeUnlock();
      const s1 = doPlayUnlock(s0);
      expect(s1.pendingResponseWindow).not.toBeNull();
    });

    it('responders 包含所有"存活 且 非 unlocker"的玩家', () => {
      const s0 = sceneBeforeUnlock();
      const s1 = doPlayUnlock(s0);
      const window = s1.pendingResponseWindow!;
      // p4 已死 → 不应在 responders
      // p1 是 unlocker → 不应在 responders
      expect([...window.responders].sort()).toEqual(['p2', 'p3', 'pM'].sort());
    });

    it('sourceAbilityID 标识为 action_unlock_effect_1', () => {
      const s0 = sceneBeforeUnlock();
      const s1 = doPlayUnlock(s0);
      expect(s1.pendingResponseWindow!.sourceAbilityID).toBe('action_unlock_effect_1');
    });

    it('validResponseAbilityIDs 包含 action_unlock_effect_2', () => {
      const s0 = sceneBeforeUnlock();
      const s1 = doPlayUnlock(s0);
      expect(s1.pendingResponseWindow!.validResponseAbilityIDs).toContain('action_unlock_effect_2');
    });

    it('onTimeout = resolve（超时默认放行解封）', () => {
      const s0 = sceneBeforeUnlock();
      const s1 = doPlayUnlock(s0);
      expect(s1.pendingResponseWindow!.onTimeout).toBe('resolve');
    });

    it('pendingUnlock 同步挂起（layer + unlocker + cardId）', () => {
      const s0 = sceneBeforeUnlock();
      const s1 = doPlayUnlock(s0);
      expect(s1.pendingUnlock).toEqual({ playerID: 'p1', layer: 1, cardId: UNLOCK_CARD });
    });
  });

  describe('respondCancelUnlock 校验（OOT-01.a/b/c/d/e）', () => {
    it('未开启响应窗口时 → INVALID_MOVE', () => {
      const s0 = sceneBeforeUnlock(); // 未 playUnlock
      const r = callMove(s0, 'respondCancelUnlock', ['p2'], { currentPlayer: 'p1' });
      expect(r).toBe('INVALID_MOVE');
    });

    it('responderID 不在 responders 中 → INVALID_MOVE（解封者自己不能抵消自己）', () => {
      const s0 = sceneBeforeUnlock();
      const s1 = doPlayUnlock(s0);
      const r = callMove(s1, 'respondCancelUnlock', ['p1'], { currentPlayer: 'p1' });
      expect(r).toBe('INVALID_MOVE');
    });

    it('responder 手中无 action_unlock → INVALID_MOVE（OOT-01.a 核心 bug）', () => {
      const s0 = sceneBeforeUnlock();
      const s1 = doPlayUnlock(s0);
      // p3 在 responders 但手牌为空
      const r = callMove(s1, 'respondCancelUnlock', ['p3'], { currentPlayer: 'p1' });
      expect(r).toBe('INVALID_MOVE');
    });

    it('死亡玩家（不在 responders）传入 → INVALID_MOVE', () => {
      const s0 = sceneBeforeUnlock();
      const s1 = doPlayUnlock(s0);
      const r = callMove(s1, 'respondCancelUnlock', ['p4'], { currentPlayer: 'p1' });
      expect(r).toBe('INVALID_MOVE');
    });

    it('成功抵消后立刻再调用 → INVALID_MOVE（规则：效果②不可被再次抵消）', () => {
      const s0 = sceneBeforeUnlock();
      const s1 = doPlayUnlock(s0);
      // 给 pM 也放一张，以模拟"第二个响应者尝试二次抵消"
      const s2 = withHand(s1, 'pM', [UNLOCK_CARD]);
      const r1 = callMove(s2, 'respondCancelUnlock', ['p2'], { currentPlayer: 'p1' });
      expect(r1).not.toBe('INVALID_MOVE');
      const sCancelled = r1 as SetupState;
      // 此时窗口应关闭 → 二次响应无效
      const r2 = callMove(sCancelled, 'respondCancelUnlock', ['pM'], { currentPlayer: 'p1' });
      expect(r2).toBe('INVALID_MOVE');
    });
  });

  describe('respondCancelUnlock 成功路径（OOT-01.b）', () => {
    it('有牌响应者成功：pendingUnlock 清空 + pendingResponseWindow 清空', () => {
      const s0 = sceneBeforeUnlock();
      const s1 = doPlayUnlock(s0);
      const r = callMove(s1, 'respondCancelUnlock', ['p2'], { currentPlayer: 'p1' });
      expect(r).not.toBe('INVALID_MOVE');
      const s2 = r as SetupState;
      expect(s2.pendingUnlock).toBeNull();
      expect(s2.pendingResponseWindow).toBeNull();
    });

    it('响应者手中 action_unlock -1 张（p2 从 [UNLOCK] → []）', () => {
      const s0 = sceneBeforeUnlock();
      const s1 = doPlayUnlock(s0);
      const r = callMove(s1, 'respondCancelUnlock', ['p2'], { currentPlayer: 'p1' });
      const s2 = r as SetupState;
      expect(s2.players.p2!.hand).toEqual([]);
    });

    it('被抵消的 action_unlock 进入弃牌堆（包含 unlocker 弃的那张）', () => {
      const s0 = sceneBeforeUnlock();
      const s1 = doPlayUnlock(s0);
      // playUnlock 已经弃了 p1 的 1 张
      expect(s1.deck.discardPile).toContain(UNLOCK_CARD);
      const discardBefore = s1.deck.discardPile.length;
      const r = callMove(s1, 'respondCancelUnlock', ['p2'], { currentPlayer: 'p1' });
      const s2 = r as SetupState;
      // 抵消者再弃 1 张
      expect(s2.deck.discardPile.length).toBe(discardBefore + 1);
    });

    it('层心锁保持原值（没有真正解封）', () => {
      const s0 = sceneBeforeUnlock();
      const s1 = doPlayUnlock(s0);
      const r = callMove(s1, 'respondCancelUnlock', ['p2'], { currentPlayer: 'p1' });
      const s2 = r as SetupState;
      expect(s2.layers[1]!.heartLockValue).toBe(2);
      expect(s2.players.p1!.successfulUnlocksThisTurn).toBe(0);
    });

    it('梦主持有 action_unlock 也能抵消（规则"任何玩家"）', () => {
      const s0 = sceneBeforeUnlock();
      const s1 = doPlayUnlock(s0);
      const r = callMove(s1, 'respondCancelUnlock', ['pM'], { currentPlayer: 'p1' });
      expect(r).not.toBe('INVALID_MOVE');
      const s2 = r as SetupState;
      expect(s2.pendingUnlock).toBeNull();
      expect(s2.players.pM!.hand).toEqual([]);
    });
  });

  describe('passResponse 校验与全员 pass 自动结算（OOT-01.e）', () => {
    it('未开窗时 passResponse → INVALID_MOVE', () => {
      const s0 = sceneBeforeUnlock();
      const r = callMove(s0, 'passResponse', ['p2'], { currentPlayer: 'p1' });
      expect(r).toBe('INVALID_MOVE');
    });

    it('非 responder 传入 → INVALID_MOVE', () => {
      const s0 = sceneBeforeUnlock();
      const s1 = doPlayUnlock(s0);
      const r = callMove(s1, 'passResponse', ['p1'], { currentPlayer: 'p1' });
      expect(r).toBe('INVALID_MOVE');
    });

    it('重复 pass（同一玩家调 2 次）→ 第二次 INVALID_MOVE', () => {
      const s0 = sceneBeforeUnlock();
      const s1 = doPlayUnlock(s0);
      const r1 = callMove(s1, 'passResponse', ['p2'], { currentPlayer: 'p1' });
      expect(r1).not.toBe('INVALID_MOVE');
      const r2 = callMove(r1 as SetupState, 'passResponse', ['p2'], { currentPlayer: 'p1' });
      expect(r2).toBe('INVALID_MOVE');
    });

    it('单人 pass 后 responded 记录该玩家，窗口仍开', () => {
      const s0 = sceneBeforeUnlock();
      const s1 = doPlayUnlock(s0);
      const r = callMove(s1, 'passResponse', ['p2'], { currentPlayer: 'p1' });
      const s2 = r as SetupState;
      expect(s2.pendingResponseWindow).not.toBeNull();
      expect(s2.pendingResponseWindow!.responded).toContain('p2');
      expect(s2.pendingUnlock).not.toBeNull();
    });

    it('全员 pass 自动结算 → heartLock - 1 且窗口 + pendingUnlock 清空', () => {
      const s0 = sceneBeforeUnlock();
      let s = doPlayUnlock(s0);
      for (const rid of ['p2', 'p3', 'pM']) {
        const r = callMove(s, 'passResponse', [rid], { currentPlayer: 'p1' });
        expect(r).not.toBe('INVALID_MOVE');
        s = r as SetupState;
      }
      expect(s.pendingUnlock).toBeNull();
      expect(s.pendingResponseWindow).toBeNull();
      expect(s.layers[1]!.heartLockValue).toBe(1);
      expect(s.players.p1!.successfulUnlocksThisTurn).toBe(1);
    });

    it('默认参数兼容：不传 responderID 时使用 ctx.currentPlayer', () => {
      const s0 = sceneBeforeUnlock();
      const s1 = doPlayUnlock(s0);
      // 以 p2 作为 currentPlayer 调 passResponse 不传参
      const r = callMove(s1, 'passResponse', [], { currentPlayer: 'p2' });
      expect(r).not.toBe('INVALID_MOVE');
      const s2 = r as SetupState;
      expect(s2.pendingResponseWindow!.responded).toContain('p2');
    });
  });

  describe('endActionPhase 阻断（W19-B F4a · 防 bot 跳过响应）', () => {
    it('pendingUnlock 挂起时 endActionPhase → INVALID_MOVE', () => {
      const s0 = sceneBeforeUnlock();
      const s1 = doPlayUnlock(s0);
      const r = callMove(s1, 'endActionPhase', [], { currentPlayer: 'p1' });
      expect(r).toBe('INVALID_MOVE');
    });

    it('pendingResponseWindow 挂起时 endActionPhase → INVALID_MOVE', () => {
      const s0 = sceneBeforeUnlock();
      const s1 = doPlayUnlock(s0);
      // 构造：pendingUnlock 已结算但窗口残留（理论极小概率）→ 仍应阻断
      const s = { ...s1, pendingUnlock: null };
      const r = callMove(s, 'endActionPhase', [], { currentPlayer: 'p1' });
      expect(r).toBe('INVALID_MOVE');
    });
  });
});
