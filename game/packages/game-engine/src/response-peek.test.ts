// 梦境窥视三段式回归测试 · W19-B F5~F8
// 对照：docs/manual/04-action-cards.md 梦境窥视 效果①
// 对照：plans/report/phase3-out-of-turn-interaction-review.md OOT-02
//
// 规则原文（效果①盗梦者）：
//   "仅盗梦者使用，梦主可以先给予你 1 张贿赂牌。你查看任意一层梦境的金库，
//    且不得公布你看到的结果。"
//   解析："盗梦者使用【梦境窥视】的效果①时，梦主先决定是否让该盗梦者抽取
//    1 张贿赂牌，然后该盗梦者再查看任意一层梦境的金库。当梦主的贿赂牌已经派完时，
//    你使用【梦境窥视】是不会收到贿赂牌的。"
//
// 三段式流程：
//   1. playPeek(cardId, targetLayer) — 盗梦者打出
//      - 若 bribePool 有 inPool 贿赂：挂起 pendingPeekDecision，等梦主决策
//      - 若已派完：跳过决策，直接挂起 peekReveal（无负担窥视）
//   2. masterPeekBribeDecision(deal: boolean) — 梦主决策（不 guard turnPhase，回合外可调）
//      - deal=true：随机派 1 张贿赂给 peekerID（可能命中 DEAL → 转阵营）
//      - deal=false：跳过派发
//      - 两分支都清 pendingPeekDecision 并挂起 peekReveal
//   3. peekerAcknowledge() — 盗梦者确认查看完毕 → 清 peekReveal + 记录 moveCounter
//
// playerView 授权：peekReveal.peekerID 视角下 peekReveal.vaultLayer 对应的
//   vault contentType 被透传；其他玩家（除梦主本来可见）仍见 'hidden'。

import { describe, it, expect } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import { createTestState, callMove, makePlayer, withBribes } from './testing/fixtures.js';
import { filterFor } from './engine/playerView.js';
import type { SetupState } from './setup.js';

const PEEK_CARD: CardID = 'action_dream_peek' as CardID;

/**
 * 默认场景：
 *   - p1 盗梦者 layer 1 · 手牌 [PEEK_CARD]（窥视发起者）
 *   - p2 盗梦者 layer 2 · 空手
 *   - p3 盗梦者 layer 3 · 空手
 *   - pM 梦主 layer 4 · 空手
 *   - 4 个金库（v-secret L1 / v-coin-1 L2 / v-coin-2 L3 / v-coin-3 L4）
 *   - 默认不给 bribePool（各测试按需塞 withBribes）
 */
function sceneBeforePeek(): SetupState {
  const base = createTestState({
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 1,
    currentPlayerID: 'p1',
    dreamMasterID: 'pM',
  });
  return {
    ...base,
    players: {
      ...base.players,
      p1: makePlayer({
        id: 'p1',
        nickname: 'P1',
        faction: 'thief',
        currentLayer: 1 as Layer,
        hand: [PEEK_CARD],
      }),
      p2: makePlayer({
        id: 'p2',
        nickname: 'P2',
        faction: 'thief',
        currentLayer: 2 as Layer,
      }),
      p3: makePlayer({
        id: 'p3',
        nickname: 'P3',
        faction: 'thief',
        currentLayer: 3 as Layer,
      }),
      p4: makePlayer({
        id: 'p4',
        nickname: 'P4',
        faction: 'thief',
        currentLayer: 1 as Layer,
      }),
      pM: makePlayer({
        id: 'pM',
        nickname: 'M',
        faction: 'master',
        currentLayer: 4 as Layer,
      }),
    },
    layers: {
      ...base.layers,
      1: { ...base.layers[1]!, playersInLayer: ['p1', 'p4'] },
      2: { ...base.layers[2]!, playersInLayer: ['p2'] },
      3: { ...base.layers[3]!, playersInLayer: ['p3'] },
      4: { ...base.layers[4]!, playersInLayer: ['pM'] },
    },
  };
}

/** 给 bribePool 塞 N 张 inPool 贿赂（默认 1 fail + 1 deal） */
function withStandardBribes(state: SetupState): SetupState {
  return withBribes(state, [
    { id: 'bribe-fail-1', status: 'inPool', heldBy: null, originalOwnerId: null },
    { id: 'bribe-deal-1', status: 'inPool', heldBy: null, originalOwnerId: null },
  ]);
}

describe('OOT-02 · 梦境窥视三段式（F5~F8 red test）', () => {
  describe('A · playPeek 校验与状态转移', () => {
    it('非盗梦者（梦主）出 playPeek → INVALID_MOVE', () => {
      let s = sceneBeforePeek();
      s = { ...s, players: { ...s.players, pM: { ...s.players.pM!, hand: [PEEK_CARD] } } };
      const r = callMove(s, 'playPeek', [PEEK_CARD, 2], { currentPlayer: 'pM' });
      expect(r).toBe('INVALID_MOVE');
    });

    it('死亡盗梦者出 playPeek → INVALID_MOVE', () => {
      const s0 = sceneBeforePeek();
      const s = {
        ...s0,
        players: {
          ...s0.players,
          p1: { ...s0.players.p1!, isAlive: false, deathTurn: 1 },
        },
      };
      const r = callMove(s, 'playPeek', [PEEK_CARD, 2], { currentPlayer: 'p1' });
      expect(r).toBe('INVALID_MOVE');
    });

    it('手中无 action_dream_peek → INVALID_MOVE', () => {
      const s0 = sceneBeforePeek();
      const s = {
        ...s0,
        players: { ...s0.players, p1: { ...s0.players.p1!, hand: [] } },
      };
      const r = callMove(s, 'playPeek', [PEEK_CARD, 2], { currentPlayer: 'p1' });
      expect(r).toBe('INVALID_MOVE');
    });

    it('targetLayer 越界（0 / 5）→ INVALID_MOVE', () => {
      const s = sceneBeforePeek();
      expect(callMove(s, 'playPeek', [PEEK_CARD, 0], { currentPlayer: 'p1' })).toBe('INVALID_MOVE');
      expect(callMove(s, 'playPeek', [PEEK_CARD, 5], { currentPlayer: 'p1' })).toBe('INVALID_MOVE');
    });

    it('该层无金库 → INVALID_MOVE（理论上 1-4 层都应有金库，此测验守卫）', () => {
      const s0 = sceneBeforePeek();
      // 清空 layer 2 的金库
      const s = { ...s0, vaults: s0.vaults.filter((v) => v.layer !== 2) };
      const r = callMove(s, 'playPeek', [PEEK_CARD, 2], { currentPlayer: 'p1' });
      expect(r).toBe('INVALID_MOVE');
    });

    it('已有 pendingPeekDecision 时再调 playPeek → INVALID_MOVE', () => {
      const s0 = withStandardBribes(sceneBeforePeek());
      const s1 = callMove(s0, 'playPeek', [PEEK_CARD, 2], { currentPlayer: 'p1' });
      expect(s1).not.toBe('INVALID_MOVE');
      // 给 p1 再补一张 peek，再试
      const s = {
        ...(s1 as SetupState),
        players: {
          ...(s1 as SetupState).players,
          p1: { ...(s1 as SetupState).players.p1!, hand: [PEEK_CARD] },
        },
      };
      const r = callMove(s, 'playPeek', [PEEK_CARD, 3], { currentPlayer: 'p1' });
      expect(r).toBe('INVALID_MOVE');
    });

    it('已有 peekReveal 时再调 playPeek → INVALID_MOVE', () => {
      const s0 = sceneBeforePeek();
      const s = {
        ...s0,
        peekReveal: { peekerID: 'p1', revealKind: 'vault' as const, vaultLayer: 2 },
      };
      const r = callMove(s, 'playPeek', [PEEK_CARD, 3], { currentPlayer: 'p1' });
      expect(r).toBe('INVALID_MOVE');
    });

    it('贿赂池有 inPool → 成功挂起 pendingPeekDecision 且不立即挂 peekReveal', () => {
      const s0 = withStandardBribes(sceneBeforePeek());
      const r = callMove(s0, 'playPeek', [PEEK_CARD, 3], { currentPlayer: 'p1' });
      expect(r).not.toBe('INVALID_MOVE');
      const s = r as SetupState;
      expect(s.pendingPeekDecision).toEqual({ peekerID: 'p1', targetLayer: 3 });
      expect(s.peekReveal).toBeNull();
      // action_dream_peek 进弃牌堆
      expect(s.deck.discardPile).toContain(PEEK_CARD);
      // 玩家 p1 手牌少 1 张
      expect(s.players.p1!.hand).toEqual([]);
    });

    it('贿赂池 inPool=0 → 跳过梦主决策，直接挂 peekReveal（无负担窥视）', () => {
      const s0 = sceneBeforePeek();
      // 池里只有 dealt 的，没有 inPool
      const s1 = withBribes(s0, [
        { id: 'bribe-fail-1', status: 'dealt', heldBy: 'p2', originalOwnerId: 'p2' },
      ]);
      const r = callMove(s1, 'playPeek', [PEEK_CARD, 2], { currentPlayer: 'p1' });
      expect(r).not.toBe('INVALID_MOVE');
      const s = r as SetupState;
      expect(s.pendingPeekDecision).toBeNull();
      expect(s.peekReveal).toEqual({ peekerID: 'p1', revealKind: 'vault', vaultLayer: 2 });
    });

    it('贿赂池完全为空 → 同样直接挂 peekReveal', () => {
      const s0 = sceneBeforePeek(); // bribePool: []
      const r = callMove(s0, 'playPeek', [PEEK_CARD, 4], { currentPlayer: 'p1' });
      expect(r).not.toBe('INVALID_MOVE');
      const s = r as SetupState;
      expect(s.peekReveal).toEqual({ peekerID: 'p1', revealKind: 'vault', vaultLayer: 4 });
      expect(s.pendingPeekDecision).toBeNull();
    });
  });

  describe('B · masterPeekBribeDecision 校验与派发', () => {
    it('无 pendingPeekDecision → INVALID_MOVE', () => {
      const s = sceneBeforePeek();
      const r = callMove(s, 'masterPeekBribeDecision', [false], { currentPlayer: 'pM' });
      expect(r).toBe('INVALID_MOVE');
    });

    it('调用者非梦主 → INVALID_MOVE', () => {
      const s0 = withStandardBribes(sceneBeforePeek());
      const s1 = callMove(s0, 'playPeek', [PEEK_CARD, 2], { currentPlayer: 'p1' }) as SetupState;
      const r = callMove(s1, 'masterPeekBribeDecision', [true], { currentPlayer: 'p1' });
      expect(r).toBe('INVALID_MOVE');
    });

    it('skip 分支：不派贿赂，清 pendingPeekDecision，挂 peekReveal', () => {
      const s0 = withStandardBribes(sceneBeforePeek());
      const s1 = callMove(s0, 'playPeek', [PEEK_CARD, 3], { currentPlayer: 'p1' }) as SetupState;
      const r = callMove(s1, 'masterPeekBribeDecision', [false], { currentPlayer: 'pM' });
      expect(r).not.toBe('INVALID_MOVE');
      const s = r as SetupState;
      expect(s.pendingPeekDecision).toBeNull();
      expect(s.peekReveal).toEqual({ peekerID: 'p1', revealKind: 'vault', vaultLayer: 3 });
      expect(s.players.p1!.bribeReceived).toBe(0);
      // 贿赂池状态无变化
      expect(s.bribePool.filter((b) => b.status === 'inPool').length).toBe(2);
    });

    it('deal 分支：派出 1 张贿赂 + 挂 peekReveal + bribeReceived + 1', () => {
      const s0 = withStandardBribes(sceneBeforePeek());
      const s1 = callMove(s0, 'playPeek', [PEEK_CARD, 3], { currentPlayer: 'p1' }) as SetupState;
      // 随机：shuffleStrategy 保序 → 取第一个 inPool（bribe-fail-1）
      const r = callMove(s1, 'masterPeekBribeDecision', [true], { currentPlayer: 'pM' });
      expect(r).not.toBe('INVALID_MOVE');
      const s = r as SetupState;
      expect(s.pendingPeekDecision).toBeNull();
      expect(s.peekReveal).toEqual({ peekerID: 'p1', revealKind: 'vault', vaultLayer: 3 });
      expect(s.players.p1!.bribeReceived).toBe(1);
      // 池剩 1 张 inPool
      expect(s.bribePool.filter((b) => b.status === 'inPool').length).toBe(1);
      // bribe-fail-1 变 dealt 且 heldBy=p1
      const dealt = s.bribePool.find((b) => b.id === 'bribe-fail-1')!;
      expect(dealt.status).toBe('dealt');
      expect(dealt.heldBy).toBe('p1');
    });

    it('deal 分支命中 DEAL → peeker 阵营转 master', () => {
      const s0 = withStandardBribes(sceneBeforePeek());
      const s1 = callMove(s0, 'playPeek', [PEEK_CARD, 3], { currentPlayer: 'p1' }) as SetupState;
      // 强制把 bribe-fail-1 先改成 dealt，让 shuffle 取到 bribe-deal-1
      const s2 = withBribes(s1, [
        { id: 'bribe-fail-1', status: 'dealt', heldBy: 'p2', originalOwnerId: 'p2' },
        { id: 'bribe-deal-1', status: 'inPool', heldBy: null, originalOwnerId: null },
      ]);
      const r = callMove(s2, 'masterPeekBribeDecision', [true], { currentPlayer: 'pM' });
      expect(r).not.toBe('INVALID_MOVE');
      const s = r as SetupState;
      expect(s.players.p1!.faction).toBe('master');
      const deal = s.bribePool.find((b) => b.id === 'bribe-deal-1')!;
      expect(deal.status).toBe('deal');
      expect(deal.heldBy).toBe('p1');
    });

    it('deal=true 但此时池里无 inPool（竞态）→ 当作 skip 处理（不 INVALID）', () => {
      const s0 = withStandardBribes(sceneBeforePeek());
      const s1 = callMove(s0, 'playPeek', [PEEK_CARD, 3], { currentPlayer: 'p1' }) as SetupState;
      // 模拟竞态：把所有贿赂设成 dealt
      const s2 = {
        ...s1,
        bribePool: s1.bribePool.map((b) => ({
          ...b,
          status: 'dealt' as const,
          heldBy: 'p2',
          originalOwnerId: 'p2',
        })),
      };
      const r = callMove(s2, 'masterPeekBribeDecision', [true], { currentPlayer: 'pM' });
      expect(r).not.toBe('INVALID_MOVE');
      const s = r as SetupState;
      expect(s.peekReveal).not.toBeNull();
      expect(s.players.p1!.bribeReceived).toBe(0);
    });
  });

  describe('C · peekerAcknowledge 校验', () => {
    it('无 peekReveal → INVALID_MOVE', () => {
      const s = sceneBeforePeek();
      const r = callMove(s, 'peekerAcknowledge', [], { currentPlayer: 'p1' });
      expect(r).toBe('INVALID_MOVE');
    });

    it('调用者非 peekerID → INVALID_MOVE', () => {
      const s0 = sceneBeforePeek();
      const s = {
        ...s0,
        peekReveal: { peekerID: 'p1', revealKind: 'vault' as const, vaultLayer: 3 },
      };
      const r = callMove(s, 'peekerAcknowledge', [], { currentPlayer: 'p2' });
      expect(r).toBe('INVALID_MOVE');
    });

    it('成功：清 peekReveal + moveCounter + 1', () => {
      const s0 = sceneBeforePeek();
      const s = {
        ...s0,
        peekReveal: { peekerID: 'p1', revealKind: 'vault' as const, vaultLayer: 3 },
      };
      const mcBefore = s.moveCounter;
      const r = callMove(s, 'peekerAcknowledge', [], { currentPlayer: 'p1' });
      expect(r).not.toBe('INVALID_MOVE');
      const s2 = r as SetupState;
      expect(s2.peekReveal).toBeNull();
      expect(s2.moveCounter).toBe(mcBefore + 1);
    });
  });

  describe('D · playerView 授权', () => {
    /** 构造一个窥视第 2 层金库的已挂起 reveal state */
    function stateWithPeekReveal(): SetupState {
      return {
        ...sceneBeforePeek(),
        peekReveal: { peekerID: 'p1', revealKind: 'vault', vaultLayer: 2 },
      };
    }

    it('peekerID 视角下 vaultLayer 对应金库的 contentType 被透传', () => {
      const s = stateWithPeekReveal();
      const view = filterFor(s, 'p1');
      const vaultL2 = view.vaults.find((v) => v.layer === 2)!;
      // 原始是 coin（createTestState 默认 v-coin-1@L2）
      expect(vaultL2.contentType).toBe('coin');
    });

    it('peekerID 视角下 其他层金库仍然 hidden', () => {
      const s = stateWithPeekReveal();
      const view = filterFor(s, 'p1');
      const vaultL1 = view.vaults.find((v) => v.layer === 1)!;
      expect(vaultL1.contentType).toBe('hidden');
    });

    it('其他盗梦者视角 vaultLayer 金库仍然 hidden', () => {
      const s = stateWithPeekReveal();
      const view = filterFor(s, 'p2');
      const vaultL2 = view.vaults.find((v) => v.layer === 2)!;
      expect(vaultL2.contentType).toBe('hidden');
    });

    it('梦主视角：所有 vault 本来就可见（不受 peekReveal 影响）', () => {
      const s = stateWithPeekReveal();
      const view = filterFor(s, 'pM');
      for (const v of view.vaults) {
        expect(v.contentType).not.toBe('hidden');
      }
    });

    it('观战者视角：peekReveal 不改变观战可见性（仍 hidden）', () => {
      const s = stateWithPeekReveal();
      const view = filterFor(s, null);
      const vaultL2 = view.vaults.find((v) => v.layer === 2)!;
      expect(vaultL2.contentType).toBe('hidden');
    });

    it('无 peekReveal 时所有非梦主视角 vault 均 hidden', () => {
      const s = sceneBeforePeek(); // peekReveal=null
      const view = filterFor(s, 'p1');
      for (const v of view.vaults) {
        if (!v.isOpened) expect(v.contentType).toBe('hidden');
      }
    });
  });
});
