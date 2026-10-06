import { describe, it, expect } from 'vitest';
import { checkInvariants, type MatchView } from '@icgame/game-engine';
import type { SetupState } from '@icgame/game-engine/setup';
import { computeUnlockResponseState } from '../../components/UnlockResponse/logic';
import {
  FIXTURE_DEFAULT_PLAYERS,
  FIXTURE_MAX_PLAYERS,
  FIXTURE_MIN_PLAYERS,
  FIXTURE_SCENARIO_IDS,
  type FixtureScenarioId,
} from './scenarios';
import { buildFixtureMatch, buildFixtureScenario } from './buildScenario';

const viewG = (id: FixtureScenarioId): MatchView => buildFixtureScenario(id).view.G as MatchView;

describe('buildFixtureScenario · 通用', () => {
  it.each(FIXTURE_SCENARIO_IDS)('场景 %s 能构造，本人座位在座位表与视图里', (id) => {
    const sc = buildFixtureScenario(id);
    const G = sc.view.G as MatchView;
    expect(sc.players).toBe(FIXTURE_DEFAULT_PLAYERS);
    expect(sc.view.ctx.playOrder).toHaveLength(FIXTURE_DEFAULT_PLAYERS);
    expect(sc.view.ctx.playOrder).toContain(sc.seat);
    expect(G.players[sc.seat]).toBeDefined();
    expect(Array.isArray(G.players[sc.seat]!.hand)).toBe(true);
    expect(sc.seats.map((s) => s.seat)).toEqual(sc.view.ctx.playOrder);
    expect(sc.seats.find((s) => s.seat === sc.seat)!.isBot).toBe(false);
  });

  it.each(FIXTURE_SCENARIO_IDS)('场景 %s 的完整状态满足规则不变量', (id) => {
    const { state } = buildFixtureMatch(id);
    expect(checkInvariants(state.G)).toEqual([]);
  });

  it.each(FIXTURE_SCENARIO_IDS)('场景 %s 每次构造结果深相等（确定）', (id) => {
    expect(buildFixtureScenario(id)).toEqual(buildFixtureScenario(id));
  });

  it.each(FIXTURE_SCENARIO_IDS)(
    '场景 %s 视图经 JSON 往返不变（可序列化、无函数与类实例）',
    (id) => {
      const { view } = buildFixtureScenario(id);
      expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    },
  );

  it.each(FIXTURE_SCENARIO_IDS)(
    '场景 %s 的局面丰富：各层有心锁、有人已翻开、玩家分布在多层',
    (id) => {
      const G = viewG(id);
      for (const layer of Object.values(G.layers)) expect(layer.heartLockValue).toBeGreaterThan(0);
      const revealedThieves = Object.values(G.players).filter(
        (p) => p.isRevealed && p.faction === 'thief',
      );
      expect(revealedThieves.length).toBeGreaterThanOrEqual(1);
      expect(
        new Set(Object.values(G.players).map((p) => p.currentLayer)).size,
      ).toBeGreaterThanOrEqual(3);
    },
  );
});

describe('buildFixtureScenario · 盗梦者视角', () => {
  it.each(['thief', 'thief-pending'] as const)('场景 %s 的本人是盗梦者', (id) => {
    const sc = buildFixtureScenario(id);
    const G = sc.view.G as MatchView;
    expect(G.players[sc.seat]!.faction).toBe('thief');
    expect(sc.seat).not.toBe(G.dreamMasterID);
  });

  it('缺省场景：本人行动阶段轮到自己，手里有几种不同的牌', () => {
    const sc = buildFixtureScenario('thief');
    const G = sc.view.G as MatchView;
    expect(G.phase).toBe('playing');
    expect(G.turnPhase).toBe('action');
    expect(G.currentPlayerID).toBe(sc.seat);
    expect(sc.view.ctx.currentPlayer).toBe(sc.seat);
    expect(new Set(G.players[sc.seat]!.hand).size).toBeGreaterThanOrEqual(3);
    expect(G.pendingResponseWindow).toBeNull();
    expect(G.pendingUnlock).toBeNull();
  });

  it.each(['thief', 'thief-pending'] as const)(
    '场景 %s 的视图里看不到别人的手牌与秘密，只有张数',
    (id) => {
      const { state, viewer } = buildFixtureMatch(id);
      const G = viewG(id);
      for (const [seat, p] of Object.entries(G.players)) {
        if (seat === viewer) continue;
        expect(p.hand).toBeNull();
        expect(p.skillUsedThisTurn).toBeNull();
        expect(p.skillUsedThisGame).toBeNull();
        // 张数来自真实状态，不是随手写的
        expect(p.handCount).toBe(state.G.players[seat]!.hand.length);
        // 未翻开的他人没有角色
        if (!p.isRevealed) expect(p.characterId).toBeNull();
      }
      expect(G.players[viewer]!.handCount).toBeGreaterThan(0);
    },
  );

  it.each(['thief', 'thief-pending'] as const)(
    '场景 %s 的视图里没有牌库顺序、随机种子与未开金库内容',
    (id) => {
      const { state } = buildFixtureMatch(id);
      const sc = buildFixtureScenario(id);
      const G = sc.view.G as MatchView;
      expect(Object.keys(G.deck).sort()).toEqual(['cardCount', 'discardPile']);
      expect(G.deck.cardCount).toBe(state.G.deck.cards.length);
      expect(Object.keys(sc.view).sort()).toEqual(['G', 'ctx', 'stateID']);
      expect(JSON.stringify(sc.view)).not.toContain(state.rngState);
      for (const v of G.vaults) if (!v.isOpened) expect(v.contentType).toBeNull();
      for (const l of Object.values(G.layers)) {
        if (!l.nightmareRevealed) expect(l.nightmareId).toBeNull();
      }
      for (const b of G.bribePool) expect(b.kind).toBeNull();
    },
  );
});

describe('buildFixtureScenario · 梦主视角', () => {
  it.each(['master', 'master-pending'] as const)('场景 %s 的本人是梦主', (id) => {
    const sc = buildFixtureScenario(id);
    const G = sc.view.G as MatchView;
    expect(sc.seat).toBe(G.dreamMasterID);
    expect(G.players[sc.seat]!.faction).toBe('master');
  });

  it('梦主能看到未开金库的内容与各层梦魇；盗梦者看不到', () => {
    const master = viewG('master');
    const thief = viewG('thief');
    const hidden = master.vaults.filter((v) => !v.isOpened);
    expect(hidden.length).toBeGreaterThan(0);
    for (const v of hidden) expect(v.contentType).not.toBeNull();
    expect(Object.values(master.layers).some((l) => l.nightmareId !== null)).toBe(true);
    expect(Object.values(thief.layers).every((l) => l.nightmareId === null)).toBe(true);
  });

  it('缺省梦主场景：轮到梦主自己，且别人的手牌仍然只有张数', () => {
    const sc = buildFixtureScenario('master');
    const G = sc.view.G as MatchView;
    expect(G.currentPlayerID).toBe(sc.seat);
    for (const [seat, p] of Object.entries(G.players)) {
      if (seat !== sc.seat) expect(p.hand).toBeNull();
    }
  });
});

describe('buildFixtureScenario · 解封响应窗口', () => {
  it.each(['thief-pending', 'master-pending'] as const)(
    '场景 %s：本人是尚未应答的响应者，且手里有【解封】可以抵消',
    (id) => {
      const sc = buildFixtureScenario(id);
      const G = sc.view.G as MatchView;
      expect(G.pendingUnlock).not.toBeNull();
      expect(G.pendingUnlock!.playerID).not.toBe(sc.seat);
      expect(G.currentPlayerID).toBe(G.pendingUnlock!.playerID);
      const w = G.pendingResponseWindow!;
      expect(w.sourceAbilityID).toBe('action_unlock_effect_1');
      expect(w.responders).toContain(sc.seat);
      expect(w.responded).not.toContain(sc.seat);

      const ui = computeUnlockResponseState(G, sc.seat);
      expect(ui.visible).toBe(true);
      expect(ui.canCancel).toBe(true);
      expect(ui.unlockerID).toBe(G.pendingUnlock!.playerID);
    },
  );

  it('无待办的场景不弹解封响应', () => {
    for (const id of ['thief', 'master'] as const) {
      const sc = buildFixtureScenario(id);
      expect(computeUnlockResponseState(sc.view.G as MatchView, sc.seat).visible).toBe(false);
    }
  });

  it('窗口场景的状态来自真实的出牌，而不是直接写字段：解封牌已进弃牌堆', () => {
    const { state } = buildFixtureMatch('thief-pending');
    const G: SetupState = state.G;
    expect(G.deck.discardPile).toContain('action_unlock');
  });
});

describe('buildFixtureScenario · 梦主角色', () => {
  it('梦主是没有回合内主动技能面板的角色，不会一进场景就弹出技能选择', () => {
    const G = viewG('master');
    expect(G.players[G.dreamMasterID]!.characterId).not.toBe('dm_chess');
  });
});

describe('buildFixtureScenario · 指定人数', () => {
  const counts = Array.from(
    { length: FIXTURE_MAX_PLAYERS - FIXTURE_MIN_PLAYERS + 1 },
    (_, i) => FIXTURE_MIN_PLAYERS + i,
  );

  it.each(counts)('%i 人：每个场景都能构造，座位数与人数一致', (n) => {
    for (const id of FIXTURE_SCENARIO_IDS) {
      const sc = buildFixtureScenario(id, n);
      expect(sc.players).toBe(n);
      expect(sc.view.ctx.playOrder).toHaveLength(n);
      expect(sc.seats).toHaveLength(n);
      expect(sc.seats.filter((s) => !s.isBot)).toHaveLength(1);
    }
  });

  it.each(counts)('%i 人：完整状态满足规则不变量，视图仍经引擎过滤', (n) => {
    for (const id of FIXTURE_SCENARIO_IDS) {
      expect(checkInvariants(buildFixtureMatch(id, n).state.G)).toEqual([]);
    }
    const sc = buildFixtureScenario('thief', n);
    const G = sc.view.G as MatchView;
    for (const [seat, p] of Object.entries(G.players)) {
      if (seat !== sc.seat) expect(p.hand).toBeNull();
    }
  });

  it('同一人数每次构造结果深相等（确定）', () => {
    expect(buildFixtureScenario('thief-pending', 10)).toEqual(
      buildFixtureScenario('thief-pending', 10),
    );
  });

  it('不同人数的局面不同', () => {
    expect(buildFixtureScenario('thief', 4).seats).not.toEqual(
      buildFixtureScenario('thief', 10).seats,
    );
  });
});
