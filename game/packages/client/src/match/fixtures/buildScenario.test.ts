import { describe, it, expect } from 'vitest';
import { InceptionCityGame, checkInvariants, viewMatch, type MatchView } from '@icgame/game-engine';
import type { SetupState } from '@icgame/game-engine/setup';
import { HAND_LIMIT } from '@icgame/game-engine/config';
import { computeUnlockResponseState } from '../../components/UnlockResponse/logic';
import {
  awaitedActions,
  awaitedResponse,
  type MineAwaited,
} from '../../components/MatchRuntime/response/awaitedResponse';
import {
  activeSkillLostTargetIds,
  bribeHolderIds,
  chessAvailable,
  deriveHandItems,
  derivePlayRules,
} from '../../components/MatchRuntime/controllerDerive';
import { deriveDockEntries } from '../../components/MatchRuntime/model/dockEntries';
import { computeVaultDecisionState } from '../../components/MasterNightmareDecisionBanner/logic';
import {
  getSkillEntries,
  GEMINI_CHOICE,
  CHEMIST_INJECT,
  CHEMIST_REFINE,
  SPACE_QUEEN_STASH,
  GAIA_SHIFT,
  ARIES_GLOW,
  BLACK_HOLE_ABSORB,
  IMPERIAL_WORLD_SHOOT,
  SATURN_FREE_MOVE,
  VENUS_DOUBLE,
  SECRET_PASSAGE_TELEPORT,
  MASTER_ACTIVATE_NIGHTMARE,
  MASTER_DISCARD_NIGHTMARE,
  LUNA_FULL_MOON,
  PISCES_BLESSING,
  GREEN_RAY_ARREST,
  DARWIN_EVOLUTION,
  AQUARIUS_COHERENCE,
  SAGITTARIUS_HEART_LOCK,
  VENUS_MIRROR_COPY,
} from '../../lib/activeSkills';
import {
  buildActiveSkillContext,
  nightmareUnlockLayers,
} from '../../components/MatchRuntime/controllerDerive';
import { playBlockReason } from '../../components/MatchRuntime/model/handDerive';
import { peekMasterTargetIds } from '../../components/TargetPlayerPickerDialog/logic';
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
      // 迷失层（0）不是梦境，没有心锁；有人在迷失层时引擎会为它建一条层记录
      // 「所在层心锁为 0」的走查场景本来就有一层被解空
      const layers = Object.values(G.layers).filter((l) => l.layer !== 0);
      const empty = layers.filter((l) => l.heartLockValue === 0);
      expect(empty).toHaveLength(id === 'skill-unlock-none' ? 1 : 0);
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

describe('buildFixtureScenario · 弃牌阶段', () => {
  it('本人是盗梦者，处于弃牌阶段，手牌超出上限需要弃牌', () => {
    const sc = buildFixtureScenario('thief-discard');
    const G = sc.view.G as MatchView;
    expect(G.players[sc.seat]!.faction).toBe('thief');
    expect(G.turnPhase).toBe('discard');
    expect(G.currentPlayerID).toBe(sc.seat);
    const handSize = G.players[sc.seat]!.hand?.length ?? 0;
    expect(handSize).toBeGreaterThan(HAND_LIMIT);
    // 界面用的「必须弃几张」由引擎视图给出，且只给本人
    expect(G.discardRequired).toBe(handSize - HAND_LIMIT);
  });
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

/** 本人视角下轮到本人应答的情形 */
function mineOf(id: FixtureScenarioId): MineAwaited {
  const sc = buildFixtureScenario(id);
  const found = awaitedResponse(sc.view.G as MatchView, sc.seat);
  if (found === null || !found.mine) throw new Error(`场景 ${id} 应当轮到本人应答`);
  return found;
}

/** 同一局面从别的座位看到的视图 */
function viewFrom(id: FixtureScenarioId, seat: string): MatchView {
  const { state } = buildFixtureMatch(id);
  return viewMatch(InceptionCityGame, state, seat).G as MatchView;
}

describe('buildFixtureScenario · 轮到本人应答的各种待决状态', () => {
  it('被 SHOOT 的双鱼：窗口由对方真的打出 SHOOT 打开，本人可闪避到第 1 层', () => {
    const a = mineOf('thief-pending-shoot');
    expect(a).toMatchObject({ kind: 'shoot-evade', canEvade: true, evadeLayer: 1 });
    const { state, viewer } = buildFixtureMatch('thief-pending-shoot');
    expect(state.G.pendingShootResponse?.targetPlayerID).toBe(viewer);
    expect(state.G.players[viewer]!.characterId).toBe('thief_pisces');
  });

  it('被 SHOOT 的恐怖分子窗口：本人有手牌可弃，也可以接受惩罚', () => {
    const a = mineOf('thief-pending-terrorist');
    expect(a.kind).toBe('shoot-zealot');
    expect(a.kind === 'shoot-zealot' && a.hand.length).toBeGreaterThan(0);
    expect(awaitedActions(a).map((x) => x.id)).toEqual(['discard', 'accept']);
  });

  it('天秤分牌：本人是被交付全部手牌的人，手牌里包含对方交来的牌', () => {
    const a = mineOf('thief-pending-libra-split');
    expect(a.kind).toBe('libra-split');
    const { state, viewer } = buildFixtureMatch('thief-pending-libra-split');
    expect(state.G.pendingLibra).toMatchObject({ targetPlayerID: viewer, split: null });
    expect(a.kind === 'libra-split' && a.hand).toEqual(state.G.players[viewer]!.hand);
  });

  it('天秤挑一份：本人是发动者，看得到两份的内容', () => {
    const a = mineOf('thief-pending-libra-pick');
    expect(a.kind).toBe('libra-pick');
    if (a.kind !== 'libra-pick') return;
    expect(a.pile1.length + a.pile2.length).toBeGreaterThan(0);
    const { state } = buildFixtureMatch('thief-pending-libra-pick');
    const split = state.G.pendingLibra!.split!;
    expect(a.pile1).toEqual(split.pile1);
    expect(a.pile2).toEqual(split.pile2);
  });

  it('天秤：别的座位看不到两份的内容，只有张数', () => {
    const { state, viewer } = buildFixtureMatch('thief-pending-libra-pick');
    const bystander = state.G.playerOrder.find(
      (id) => id !== viewer && id !== state.G.pendingLibra!.targetPlayerID,
    )!;
    const split = viewFrom('thief-pending-libra-pick', bystander).pendingLibra!.split!;
    expect(split.pile1).toBeNull();
    expect(split.pile2).toBeNull();
    expect(split.pile1Count + split.pile2Count).toBeGreaterThan(0);
  });

  it('意念判官：本人是回合主人，两个骰值各有结算结果', () => {
    const a = mineOf('thief-pending-sudger');
    expect(a.kind).toBe('sudger');
    if (a.kind !== 'sudger') return;
    // 点数在场景里定为 1 与 4：普通 SHOOT 下一个击杀、一个移动
    expect(a.rolls).toEqual([
      { pick: 'A', roll: 1, result: 'kill' },
      { pick: 'B', roll: 4, result: 'move' },
    ]);
  });

  it('处女：本人是处女、有人死亡可复活，视图里别人看不到处女是谁', () => {
    const a = mineOf('thief-pending-virgo');
    expect(a).toMatchObject({ kind: 'virgo', alive: true, triggerRoll: 6 });
    const { state, viewer } = buildFixtureMatch('thief-pending-virgo');
    // 一名盗梦者和梦主都已死亡，复活的对象不限阵营，两个人都可选
    expect(a.kind === 'virgo' && a.reviveTargets.length).toBe(2);
    expect(a.kind === 'virgo' && a.reviveTargets).toContain(state.G.dreamMasterID);
    const other = state.G.playerOrder.find((id) => id !== viewer)!;
    expect(viewFrom('thief-pending-virgo', other).pendingVirgoChoice!.virgoID).toBeNull();
    expect(awaitedResponse(viewFrom('thief-pending-virgo', other), other)).toEqual({
      mine: false,
    });
  });

  it('白羊：梦魇是回音萦绕，只有白羊本人看得到那一层的梦魇', () => {
    const a = mineOf('thief-pending-aries');
    expect(a).toMatchObject({
      kind: 'aries',
      victimLayer: 2,
      nightmareId: 'nightmare_echo',
      params: 'echo',
    });
    const { state, viewer } = buildFixtureMatch('thief-pending-aries');
    const other = state.G.playerOrder.find((id) => id !== viewer && id !== state.G.dreamMasterID)!;
    const seen = viewFrom('thief-pending-aries', other);
    expect(seen.layers[2]!.nightmareId).toBeNull();
    expect(seen.pendingAriesChoice!.ariesID).toBeNull();
  });

  it('白羊（邪念瘟疫）：发动要点名，候选是被击杀者所在层存活的盗梦者', () => {
    const a = mineOf('thief-pending-aries-plague');
    expect(a).toMatchObject({
      kind: 'aries',
      victimLayer: 2,
      nightmareId: 'nightmare_plague',
      params: 'plague',
    });
    if (a.kind !== 'aries') throw new Error('unreachable');
    expect(a.candidates.length).toBeGreaterThanOrEqual(2);
    expect(a.bribePoolCount).toBeGreaterThan(0);
    expect(awaitedActions(a)[0]!.effect).toEqual({ type: 'sheet', sheet: 'aries-plague' });
  });

  it.each([
    ['master-vault-echo', 'echo', 'nightmare_echo'],
    ['master-vault-plague', 'plague', 'nightmare_plague'],
  ] as const)('金库三选一场景 %s：梦主待决，发动梦魇要补参数 %s', (id, kind, nightmareId) => {
    const sc = buildFixtureScenario(id);
    const G = sc.view.G as MatchView;
    expect(sc.seat).toBe(G.dreamMasterID);
    const state = computeVaultDecisionState(G, sc.seat);
    expect(state.visible).toBe(true);
    expect(state.nightmareParams).toBe(kind);
    expect(state.nightmareId).toBe(nightmareId);
    expect(state.bribe.enabled).toBe(true);
    if (kind === 'plague') expect(state.plagueCandidates.length).toBeGreaterThanOrEqual(1);
  });

  it.each([
    'thief-pending-shoot',
    'thief-pending-terrorist',
    'thief-pending-libra-split',
    'thief-pending-libra-pick',
    'thief-pending-sudger',
    'thief-pending-virgo',
    'thief-pending-aries',
    'thief-pending-aries-plague',
  ] as const)('场景 %s：本人是盗梦者，不带解封响应窗口', (id) => {
    const sc = buildFixtureScenario(id);
    const G = sc.view.G as MatchView;
    expect(G.players[sc.seat]!.faction).toBe('thief');
    expect(G.pendingResponseWindow).toBeNull();
    expect(computeUnlockResponseState(G, sc.seat).visible).toBe(false);
  });
});

describe('buildFixtureScenario · 意念判官的行动阶段', () => {
  it('本人是意念判官，行动阶段轮到自己，手里有 SHOOT，同层有可选目标，没有待决状态', () => {
    const { state, viewer } = buildFixtureMatch('thief-sudger');
    const me = state.G.players[viewer]!;
    expect(me.characterId).toBe('thief_sudger_of_mind');
    expect(state.G.currentPlayerID).toBe(viewer);
    expect(state.G.turnPhase).toBe('action');
    expect(me.hand).toContain('action_shoot');
    expect(state.G.pendingSudgerRolls ?? null).toBeNull();
    const sameLayer = state.G.playerOrder.filter(
      (id) => id !== viewer && state.G.players[id]!.currentLayer === me.currentLayer,
    );
    expect(sameLayer.length).toBeGreaterThan(0);
  });
});

describe('buildFixtureScenario · 棋局梦主', () => {
  it('本人是棋局梦主，行动阶段轮到自己，易位可用', () => {
    const sc = buildFixtureScenario('master-chess');
    const G = sc.view.G as MatchView;
    const me = G.players[sc.seat]!;
    expect(sc.seat).toBe(G.dreamMasterID);
    expect(me.characterId).toBe('dm_chess');
    expect(G.turnPhase).toBe('action');
    expect(G.currentPlayerID).toBe(sc.seat);
    expect(
      chessAvailable({
        characterId: me.characterId!,
        isMyTurn: true,
        turnPhase: G.turnPhase,
        winner: null,
        busy: false,
        usedThisGame: me.skillUsedThisGame?.['dm_chess.skill_0'] ?? 0,
        unopenedVaults: G.vaults.filter((v) => !v.isOpened).length,
      }),
    ).toBe(true);
  });
});

/** 把场景视图接到底部坞入口的推导上（与控制层的输入一致） */
function entriesOf(id: FixtureScenarioId) {
  const sc = buildFixtureScenario(id);
  const G = sc.view.G as MatchView;
  const me = G.players[sc.seat]!;
  return {
    sc,
    G,
    entries: deriveDockEntries({
      seat: sc.seat,
      dreamMasterID: G.dreamMasterID,
      players: G.players,
      hand: me.hand ?? [],
      isMyTurn: G.currentPlayerID === sc.seat,
      turnPhase: G.turnPhase,
      winner: null,
      busy: false,
    }),
  };
}

describe('buildFixtureScenario · 复活走查', () => {
  it('thief-dead：本人已在迷失层、轮到自己的出牌阶段、手里有牌，只有「复活」入口且可用', () => {
    const { sc, G, entries } = entriesOf('thief-dead');
    const me = G.players[sc.seat]!;
    expect(me.isAlive).toBe(false);
    expect(me.currentLayer).toBe(0);
    expect(G.turnPhase).toBe('action');
    expect(G.currentPlayerID).toBe(sc.seat);
    expect(me.hand!.length).toBeGreaterThanOrEqual(2);
    expect(entries).toEqual([{ kind: 'reviveSelf', enabled: true, reason: null }]);
  });

  it('thief-dead：已死亡的本人手里的牌一张都打不出，原因是在迷失层', () => {
    const { sc, G } = entriesOf('thief-dead');
    const me = G.players[sc.seat]!;
    const items = deriveHandItems(me.hand!, {
      turnPhase: G.turnPhase,
      isMyTurn: true,
      winner: null,
      overHand: 0,
      selectedDiscard: [],
      pendingCard: null,
      rules: derivePlayRules(G, sc.seat),
    });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((it) => it.mode === 'idle' && it.blockReason === 'dead')).toBe(true);
  });

  it('thief-mate-dead：本人存活，一名盗梦者同伴在迷失层，出现「复活同伴」', () => {
    const { sc, G, entries } = entriesOf('thief-mate-dead');
    expect(G.players[sc.seat]!.isAlive).toBe(true);
    expect(activeSkillLostTargetIds(G.players, sc.seat)).toHaveLength(1);
    expect(entries).toEqual([{ kind: 'reviveOther', enabled: true, reason: null }]);
  });

  it('master-mate-dead：梦主既有「移动」又有「复活同伴」', () => {
    const { entries } = entriesOf('master-mate-dead');
    expect(entries.map((e) => e.kind)).toEqual(['masterMove', 'reviveOther']);
    expect(entries.every((e) => e.enabled)).toBe(true);
  });

  it('缺省梦主场景：只有「移动」；缺省盗梦者场景没有任何入口', () => {
    expect(entriesOf('master').entries.map((e) => e.kind)).toEqual(['masterMove']);
    expect(entriesOf('thief').entries).toEqual([]);
  });

  it('各复活场景的完整状态满足规则不变量', () => {
    for (const id of ['thief-dead', 'thief-mate-dead', 'master-mate-dead'] as const) {
      expect(checkInvariants(buildFixtureMatch(id).state.G), id).toEqual([]);
    }
  });
});

describe('buildFixtureScenario · 梦主的出牌限制', () => {
  it('梦主手里的【解封】不可打出（引擎拒绝梦主使用）', () => {
    const sc = buildFixtureScenario('master');
    const G = sc.view.G as MatchView;
    const hand = G.players[sc.seat]!.hand!;
    const items = deriveHandItems(hand, {
      turnPhase: G.turnPhase,
      isMyTurn: true,
      winner: null,
      overHand: 0,
      selectedDiscard: [],
      pendingCard: null,
      rules: derivePlayRules(G, sc.seat),
    });
    const unlock = items.find((it) => it.card === 'action_unlock')!;
    expect(unlock.mode).toBe('idle');
    expect(unlock.blockReason).toBe('masterNoUnlock');
    // 同一只手里的 KICK 照常可打
    expect(items.find((it) => it.card === 'action_kick')!.mode).toBe('play');
  });

  it('master：没有人持有贿赂牌时，梦主的梦境窥视不可打出', () => {
    const sc = buildFixtureScenario('master');
    const G = sc.view.G as MatchView;
    expect(bribeHolderIds(G.bribePool)).toEqual([]);
    const rules = derivePlayRules(G, sc.seat);
    expect(rules.hasPeekMasterTarget).toBe(false);
    const peek = deriveHandItems(G.players[sc.seat]!.hand!, {
      turnPhase: G.turnPhase,
      isMyTurn: true,
      winner: null,
      overHand: 0,
      selectedDiscard: [],
      pendingCard: null,
      rules,
    }).find((it) => it.card === 'action_dream_peek')!;
    expect(peek.mode).toBe('idle');
    expect(peek.blockReason).toBe('noPeekTarget');
  });

  it('master-bribe：一名存活的盗梦者持有贿赂牌，梦境窥视可打出并只能选他；成败对梦主仍不公开', () => {
    const sc = buildFixtureScenario('master-bribe');
    const G = sc.view.G as MatchView;
    const holders = bribeHolderIds(G.bribePool);
    expect(holders).toHaveLength(1);
    expect(peekMasterTargetIds(G.players, G.dreamMasterID, sc.seat, holders)).toEqual(holders);
    const rules = derivePlayRules(G, sc.seat);
    expect(rules.hasPeekMasterTarget).toBe(true);
    const peek = deriveHandItems(G.players[sc.seat]!.hand!, {
      turnPhase: G.turnPhase,
      isMyTurn: true,
      winner: null,
      overHand: 0,
      selectedDiscard: [],
      pendingCard: null,
      rules,
    }).find((it) => it.card === 'action_dream_peek')!;
    expect(peek.mode).toBe('play');
    // 引擎过滤后的视图：持有者公开，成败为 null
    expect(G.bribePool.find((b) => b.heldBy !== null)!.kind).toBeNull();
    expect(checkInvariants(buildFixtureMatch('master-bribe').state.G)).toEqual([]);
  });
});

describe('buildFixtureScenario · 角色技能走查场景', () => {
  /** 本人视图里此刻的技能项 */
  function skillEntriesOf(id: FixtureScenarioId) {
    const sc = buildFixtureScenario(id);
    const G = sc.view.G as MatchView;
    const hand = G.players[sc.seat]!.hand ?? [];
    return {
      sc,
      G,
      entries: getSkillEntries(
        buildActiveSkillContext({
          G,
          seat: sc.seat,
          isMyTurn: G.currentPlayerID === sc.seat,
          hand,
        }),
      ),
    };
  }
  const enabledSkills = (id: FixtureScenarioId) =>
    skillEntriesOf(id)
      .entries.filter((e) => e.enabled)
      .map((e) => e.skill);

  it('抽牌阶段的场景：轮到本人，阶段是抽牌；小丑场景的本人是小丑', () => {
    for (const id of ['skill-draw', 'skill-joker'] as const) {
      const sc = buildFixtureScenario(id);
      const G = sc.view.G as MatchView;
      expect(G.turnPhase).toBe('draw');
      expect(G.currentPlayerID).toBe(sc.seat);
      const kinds = deriveDockEntries({
        seat: sc.seat,
        dreamMasterID: G.dreamMasterID,
        players: G.players,
        hand: G.players[sc.seat]!.hand ?? [],
        isMyTurn: true,
        turnPhase: G.turnPhase,
        winner: null,
        busy: false,
      }).map((e) => e.kind);
      expect(kinds).toEqual(id === 'skill-joker' ? ['skipDraw', 'jokerGamble'] : ['skipDraw']);
    }
    const joker = buildFixtureScenario('skill-joker');
    expect((joker.view.G as MatchView).players[joker.seat]!.characterId).toBe('thief_joker');
  });

  it('双子背面：翻到背面的角色 id，梦主所在层数字更小，「双子·抉择」可用', () => {
    const { sc, G } = skillEntriesOf('skill-gemini-back');
    expect(G.players[sc.seat]!.characterId).toBe('thief_gemini_back');
    expect(G.players[sc.seat]!.currentLayer).toBe(4);
    expect(enabledSkills('skill-gemini-back')).toContain(GEMINI_CHOICE);
  });

  it('药剂师：弃牌堆里没有梦境穿梭剂，「调剂」置灰并说明；手里有梦境穿梭剂、同层有同伴，「注射」可用', () => {
    const { entries } = skillEntriesOf('skill-chemist');
    expect(entries.find((e) => e.skill === CHEMIST_REFINE)).toMatchObject({
      enabled: false,
      reason: { key: 'skill.reason.noTransitInDiscard' },
    });
    expect(entries.find((e) => e.skill === CHEMIST_INJECT)?.enabled).toBe(true);
  });

  it('空间女王：弃牌阶段，「造物」可用', () => {
    const { G } = skillEntriesOf('skill-space-queen');
    expect(G.turnPhase).toBe('discard');
    expect(enabledSkills('skill-space-queen')).toContain(SPACE_QUEEN_STASH);
  });

  it('空间女王（别人的弃牌阶段）：回合主人是别人，「造物」仍然可用', () => {
    const sc = buildFixtureScenario('skill-space-queen-other');
    const G = sc.view.G as MatchView;
    expect(G.turnPhase).toBe('discard');
    expect(G.currentPlayerID).not.toBe(sc.seat);
    expect(G.players[sc.seat]!.characterId).toBe('thief_space_queen');
    const ctx = buildActiveSkillContext({
      G,
      seat: sc.seat,
      isMyTurn: false,
      hand: G.players[sc.seat]!.hand ?? [],
    });
    expect(
      getSkillEntries(ctx)
        .filter((e) => e.enabled)
        .map((e) => e.skill),
    ).toEqual([SPACE_QUEEN_STASH]);
  });

  it('盖亚：本人所在层有两名同伴，「撼动」可用', () => {
    const { sc, G } = skillEntriesOf('skill-gaia');
    expect(G.players[sc.seat]!.characterId).toBe('thief_gaia');
    const mates = Object.entries(G.players).filter(
      ([id, p]) => id !== sc.seat && p.currentLayer === G.players[sc.seat]!.currentLayer,
    );
    expect(mates.length).toBeGreaterThanOrEqual(2);
    expect(enabledSkills('skill-gaia')).toContain(GAIA_SHIFT);
  });

  it('白羊：抽牌阶段、弃掉过 2 张梦魇，「闪耀」可用', () => {
    const { sc, G } = skillEntriesOf('skill-aries-glow');
    expect(G.players[sc.seat]!.characterId).toBe('thief_aries');
    expect(G.turnPhase).toBe('draw');
    expect(G.usedNightmareCount).toBe(2);
    expect(enabledSkills('skill-aries-glow')).toContain(ARIES_GLOW);
  });

  it('黑洞：「吸纳」可用', () => {
    expect(enabledSkills('skill-black-hole')).toContain(BLACK_HOLE_ABSORB);
  });

  it('皇城：本人有一次 SHOOT 机会，梦主是皇城；土星：本人持贿赂，梦主是土星', () => {
    expect(enabledSkills('skill-imperial')).toContain(IMPERIAL_WORLD_SHOOT);
    expect(enabledSkills('skill-saturn')).toContain(SATURN_FREE_MOVE);
    const { G } = skillEntriesOf('skill-saturn');
    expect(G.players[G.dreamMasterID]!.characterId).toBe('dm_saturn_territory');
  });

  it('梦主走查：金星、密道各有自己的技能，梦魇场景有三层已翻开的梦魇', () => {
    expect(enabledSkills('skill-venus')).toContain(VENUS_DOUBLE);
    expect(enabledSkills('skill-passage')).toContain(SECRET_PASSAGE_TELEPORT);
    const night = skillEntriesOf('skill-nightmare');
    const skills = night.entries.filter((e) => e.enabled).map((e) => e.skill);
    expect(skills).toContain(MASTER_DISCARD_NIGHTMARE);
    expect(skills).toContain(MASTER_ACTIVATE_NIGHTMARE);
    for (const layer of [1, 2, 3]) expect(night.G.layers[layer]!.nightmareRevealed).toBe(true);
    // 梦主看得到翻开的梦魇是什么：邪念瘟疫、致命漩涡、回音萦绕各在一层
    expect(night.G.layers[1]!.nightmareId).toBe('nightmare_plague');
    expect(night.G.layers[2]!.nightmareId).toBe('nightmare_vortex');
    expect(night.G.layers[3]!.nightmareId).toBe('nightmare_echo');
  });

  it('射手 / 恐怖分子：本人角色正确，手里有 SHOOT', () => {
    for (const [id, character] of [
      ['skill-sagittarius', 'thief_sagittarius'],
      ['skill-terrorist', 'thief_terrorist'],
    ] as const) {
      const sc = buildFixtureScenario(id);
      const p = (sc.view.G as MatchView).players[sc.seat]!;
      expect(p.characterId).toBe(character);
      expect(p.hand).toContain('action_shoot');
    }
  });

  it('解封预判场景：心锁为 0 / 解封次数用尽时，【解封】打不出', () => {
    const none = buildFixtureScenario('skill-unlock-none');
    expect(
      playBlockReason('action_unlock', derivePlayRules(none.view.G as MatchView, none.seat)),
    ).toBe('noHeartLock');
    const spent = buildFixtureScenario('skill-unlock-spent');
    expect(
      playBlockReason('action_unlock', derivePlayRules(spent.view.G as MatchView, spent.seat)),
    ).toBe('unlockLimit');
  });

  it('梦魇场景：梦主视角列出的暗置梦魇层不含已翻开的三层', () => {
    const sc = buildFixtureScenario('skill-nightmare');
    expect(nightmareUnlockLayers((sc.view.G as MatchView).layers)).toEqual([4]);
  });

  it('黑天鹅场景：抽牌阶段，本人是黑天鹅，坞里有「纷飞」入口且可用', () => {
    const sc = buildFixtureScenario('skill-black-swan');
    const G = sc.view.G as MatchView;
    expect(G.turnPhase).toBe('draw');
    expect(G.players[sc.seat]!.characterId).toBe('thief_black_swan');
    const entries = deriveDockEntries({
      seat: sc.seat,
      dreamMasterID: G.dreamMasterID,
      players: G.players,
      hand: G.players[sc.seat]!.hand ?? [],
      isMyTurn: true,
      turnPhase: G.turnPhase,
      winner: null,
      busy: false,
    });
    expect(entries.map((e) => [e.kind, e.enabled])).toEqual([
      ['skipDraw', true],
      ['blackSwanTour', true],
    ]);
  });

  it('露娜 / 双鱼背面场景：本人是背面角色，有一名同伴在迷失层，满月 / 洗礼可用', () => {
    for (const [id, character, skill] of [
      ['skill-luna', 'thief_luna_back', LUNA_FULL_MOON],
      ['skill-pisces', 'thief_pisces_back', PISCES_BLESSING],
    ] as const) {
      const { sc, G } = skillEntriesOf(id);
      expect(G.players[sc.seat]!.characterId).toBe(character);
      expect(Object.values(G.players).filter((p) => !p.isAlive)).toHaveLength(1);
      expect(enabledSkills(id)).toContain(skill);
    }
  });

  it('达尔文场景：本人是达尔文，手牌够放回 2 张，「淘汰」可用', () => {
    const { sc, G } = skillEntriesOf('skill-darwin');
    expect(G.players[sc.seat]!.characterId).toBe('thief_darwin');
    expect(enabledSkills('skill-darwin')).toContain(DARWIN_EVOLUTION);
  });

  it('格林射线 / 水瓶 / 射手 / 金星复制场景：对应技能可用', () => {
    expect(enabledSkills('skill-green-ray')).toContain(GREEN_RAY_ARREST);
    expect(enabledSkills('skill-aquarius')).toContain(AQUARIUS_COHERENCE);
    expect(enabledSkills('skill-heart-lock')).toContain(SAGITTARIUS_HEART_LOCK);
    expect(enabledSkills('skill-venus-mirror')).toContain(VENUS_MIRROR_COPY);
    const aq = skillEntriesOf('skill-aquarius');
    expect(aq.G.playedCardsThisTurn).toEqual(['action_kick', 'action_kick']);
    const sag = skillEntriesOf('skill-heart-lock');
    expect(sag.G.players[sag.sc.seat]!.skillUsedThisTurn?.['thief_sagittarius.kills']).toBe(1);
  });

  it('盗梦者视角的角色走查场景里，视图看不到梦魇是什么、也看不到他人手牌', () => {
    for (const id of ['skill-chemist', 'skill-imperial', 'skill-saturn'] as const) {
      const { state, viewer } = buildFixtureMatch(id);
      const G = viewG(id);
      expect(
        Object.values(G.layers).every((l) => l.nightmareId === null || l.nightmareRevealed),
      ).toBe(true);
      for (const [seat, p] of Object.entries(G.players)) {
        if (seat === viewer) continue;
        expect(p.hand).toBeNull();
        expect(p.handCount).toBe(state.G.players[seat]!.hand.length);
      }
    }
  });
});
