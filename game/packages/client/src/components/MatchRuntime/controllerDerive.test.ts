// 对局界面控制层纯推导的测试：输入尽量用固定场景里引擎真实产出的视图

import { describe, it, expect } from 'vitest';
import type { MatchView, RunnerCtx, SeatInfo } from '@icgame/game-engine';
import { buildFixtureScenario } from '../../match/fixtures/buildScenario';
import {
  HAND_LIMIT,
  activeSkillTargetIds,
  buildActiveSkillContext,
  buildLayerViews,
  buildPlayArgs,
  buildPlayerRows,
  buildPlayerViews,
  classifyShoot,
  decreeApplicable,
  decreeCardsIn,
  deriveHandItems,
  deriveOutcome,
  dreamTransitPending,
  effectiveDiscardSelection,
  effectivePendingPlay,
  gravityCurrentPicker,
  handCardMode,
  isShootMove,
  isShootPlay,
  layersOfPlayers,
  nicknameMap,
  overflowCount,
  pendingPlayFor,
  shootToastFor,
  toggleDiscardSelection,
  toggleGravityTargets,
  toggleKeepLastTwo,
  viewOf,
} from './controllerDerive';
import type { PendingPlay } from './controllerTypes';

const thief = buildFixtureScenario('thief');
const thiefG = thief.view.G as MatchView;
const master = buildFixtureScenario('master');
const masterG = master.view.G as MatchView;

/** 我的回合、行动阶段、没有胜负、没有超出手牌 */
const ACTION_TURN = { turnPhase: 'action', isMyTurn: true, winner: null, overHand: 0 };

describe('viewOf', () => {
  it('没有视图返回 null', () => {
    expect(viewOf(null)).toBeNull();
  });

  it('把视图拆成 G 与 ctx', () => {
    const v = viewOf(thief.view);
    expect(v?.G).toBe(thief.view.G);
    expect(v?.ctx).toBe(thief.view.ctx);
  });
});

describe('deriveOutcome', () => {
  const ctxOf = (gameover?: unknown): Pick<RunnerCtx, 'gameover'> => ({ gameover });

  it('运行器的 gameover 优先于 G 里的胜负', () => {
    const G = { winner: 'master', winReason: 'a' } as Pick<MatchView, 'winner' | 'winReason'>;
    expect(deriveOutcome(G, ctxOf({ winner: 'thief', reason: 'b' }))).toEqual({
      winner: 'thief',
      winReason: 'b',
    });
  });

  it('没有 gameover 时回退到 G.winner 与 G.winReason', () => {
    const G = { winner: 'master', winReason: 'all_dead' } as Pick<
      MatchView,
      'winner' | 'winReason'
    >;
    expect(deriveOutcome(G, ctxOf())).toEqual({ winner: 'master', winReason: 'all_dead' });
  });

  it('进行中的对局两者都是 null', () => {
    expect(deriveOutcome(thiefG, thief.view.ctx)).toEqual({ winner: null, winReason: null });
  });

  it('没有视图时都是 null；空串也按没有处理', () => {
    expect(deriveOutcome(undefined, undefined)).toEqual({ winner: null, winReason: null });
    expect(deriveOutcome(undefined, ctxOf({ winner: '', reason: '' }))).toEqual({
      winner: null,
      winReason: null,
    });
  });
});

describe('overflowCount', () => {
  it('不超过上限为 0，超出按张数算', () => {
    expect(overflowCount(0)).toBe(0);
    expect(overflowCount(HAND_LIMIT)).toBe(0);
    expect(overflowCount(HAND_LIMIT + 2)).toBe(2);
  });
});

describe('handCardMode', () => {
  it('行动阶段、我的回合、能打出的牌是 play', () => {
    expect(handCardMode('action_shoot', ACTION_TURN)).toBe('play');
  });

  it('弃牌阶段且超出上限时所有牌都是 discard', () => {
    const input = { turnPhase: 'discard', isMyTurn: true, winner: null, overHand: 2 };
    expect(handCardMode('action_shoot', input)).toBe('discard');
    expect(handCardMode('thief_pointman', input)).toBe('discard');
  });

  it('弃牌阶段但没有超出上限时不能选牌', () => {
    expect(
      handCardMode('action_shoot', {
        turnPhase: 'discard',
        isMyTurn: true,
        winner: null,
        overHand: 0,
      }),
    ).toBe('idle');
  });

  it('不是我的回合、对局已结束、不是行动牌都是 idle', () => {
    expect(handCardMode('action_shoot', { ...ACTION_TURN, isMyTurn: false })).toBe('idle');
    expect(handCardMode('action_shoot', { ...ACTION_TURN, winner: 'thief' })).toBe('idle');
    expect(handCardMode('thief_pointman', ACTION_TURN)).toBe('idle');
  });

  it('抽牌阶段不能出牌', () => {
    expect(handCardMode('action_shoot', { ...ACTION_TURN, turnPhase: 'draw' })).toBe('idle');
  });
});

describe('deriveHandItems', () => {
  const hand = thiefG.players[thief.seat]!.hand as string[];

  it('每张手牌一项，带位置、名称与用途', () => {
    const items = deriveHandItems(hand, {
      ...ACTION_TURN,
      selectedDiscard: [],
      pendingCard: null,
    });
    expect(items).toHaveLength(hand.length);
    items.forEach((it, i) => {
      expect(it.card).toBe(hand[i]);
      expect(it.index).toBe(i);
      expect(it.name.length).toBeGreaterThan(0);
      expect(it.selected).toBe(false);
      expect(it.pending).toBe(false);
    });
    const shoot = items.find((it) => it.card === 'action_shoot')!;
    expect(shoot.mode).toBe('play');
    expect(shoot.name).toBe('SHOOT');
  });

  it('当前出牌意图对应的牌标 pending', () => {
    const items = deriveHandItems(hand, {
      ...ACTION_TURN,
      selectedDiscard: [],
      pendingCard: 'action_kick',
    });
    expect(items.filter((it) => it.pending).map((it) => it.card)).toEqual(['action_kick']);
  });

  it('弃牌阶段已选的牌标 selected，其余不标', () => {
    const items = deriveHandItems(hand, {
      turnPhase: 'discard',
      isMyTurn: true,
      winner: null,
      overHand: 1,
      selectedDiscard: ['action_kick'],
      pendingCard: undefined,
    });
    expect(items.every((it) => it.mode === 'discard')).toBe(true);
    expect(items.filter((it) => it.selected).map((it) => it.card)).toEqual(['action_kick']);
  });

  it('不在弃牌模式时，选中记录不生效', () => {
    const items = deriveHandItems(hand, {
      ...ACTION_TURN,
      selectedDiscard: ['action_kick'],
      pendingCard: null,
    });
    expect(items.some((it) => it.selected)).toBe(false);
  });
});

describe('effectiveDiscardSelection', () => {
  const hand = ['a', 'b', 'c'];

  it('只保留仍在手牌里的选择', () => {
    expect(effectiveDiscardSelection(['a', 'z'], hand, 'discard', true)).toEqual(['a']);
  });

  it('不在弃牌阶段或不是我的回合时清空', () => {
    expect(effectiveDiscardSelection(['a'], hand, 'action', true)).toEqual([]);
    expect(effectiveDiscardSelection(['a'], hand, 'discard', false)).toEqual([]);
  });
});

describe('toggleDiscardSelection', () => {
  it('未选则加入，已选则取消', () => {
    expect(toggleDiscardSelection([], 'a', 2)).toEqual(['a']);
    expect(toggleDiscardSelection(['a', 'b'], 'a', 2)).toEqual(['b']);
  });

  it('已选满需弃数量时不再加入，且原样返回', () => {
    const prev = ['a', 'b'];
    expect(toggleDiscardSelection(prev, 'c', 2)).toBe(prev);
  });

  it('不修改传入的数组', () => {
    const prev = ['a', 'b'];
    toggleDiscardSelection(prev, 'a', 2);
    expect(prev).toEqual(['a', 'b']);
  });
});

describe('toggleKeepLastTwo', () => {
  it('不足两个时追加', () => {
    expect(toggleKeepLastTwo([], 1)).toEqual([1]);
    expect(toggleKeepLastTwo([1], 2)).toEqual([1, 2]);
  });

  it('已选的再点则取消', () => {
    expect(toggleKeepLastTwo([1, 2], 1)).toEqual([2]);
    expect(toggleKeepLastTwo(['x', 'y'], 'y')).toEqual(['x']);
  });

  it('已有两个时丢掉最早的，保留最后 2 个', () => {
    expect(toggleKeepLastTwo([1, 2], 3)).toEqual([2, 3]);
    expect(toggleKeepLastTwo(['x', 'y'], 'z')).toEqual(['y', 'z']);
  });
});

describe('toggleGravityTargets', () => {
  it('追加、取消、满 2 个后不再加入（原样返回）', () => {
    expect(toggleGravityTargets([], '1')).toEqual(['1']);
    expect(toggleGravityTargets(['1', '2'], '1')).toEqual(['2']);
    const full = ['1', '2'];
    expect(toggleGravityTargets(full, '3')).toBe(full);
  });
});

describe('出牌意图', () => {
  it('SHOOT 需要目标玩家，目标在前', () => {
    expect(pendingPlayFor('action_shoot')).toEqual({
      card: 'action_shoot',
      move: 'playShoot',
      needsTarget: 'player',
      argOrder: 'target_first',
    });
  });

  it('解封无需目标；穿梭剂需要目标层', () => {
    expect(pendingPlayFor('action_unlock')?.needsTarget).toBe('none');
    expect(pendingPlayFor('action_dream_transit')).toMatchObject({
      move: 'playDreamTransit',
      needsTarget: 'layer',
      argOrder: 'card_first',
    });
  });

  it('不是行动牌返回 null', () => {
    expect(pendingPlayFor('thief_pointman')).toBeNull();
  });

  it('梦境穿梭剂选模式：shoot 选玩家，transit 选层', () => {
    expect(dreamTransitPending('action_shoot_dream_transit', 'shoot')).toEqual({
      card: 'action_shoot_dream_transit',
      move: 'playShootDreamTransit',
      needsTarget: 'player',
      argOrder: 'card_first',
      dreamMode: 'shoot',
    });
    expect(dreamTransitPending('action_shoot_dream_transit', 'transit').needsTarget).toBe('layer');
  });

  describe('effectivePendingPlay', () => {
    const pending = pendingPlayFor('action_kick')!;
    const hand = ['action_kick', 'action_shoot'];

    it('牌在手里、行动阶段、我的回合时有效', () => {
      expect(effectivePendingPlay(pending, 'action', true, hand)).toBe(pending);
    });

    it('牌已不在手里、阶段变了、不是我的回合或没有意图时失效', () => {
      expect(effectivePendingPlay(pending, 'action', true, ['action_shoot'])).toBeNull();
      expect(effectivePendingPlay(pending, 'discard', true, hand)).toBeNull();
      expect(effectivePendingPlay(pending, 'action', false, hand)).toBeNull();
      expect(effectivePendingPlay(null, 'action', true, hand)).toBeNull();
    });
  });
});

describe('死亡宣言', () => {
  it('SHOOT 系 move 才算 SHOOT', () => {
    for (const move of ['playShoot', 'playShootKing', 'playShootArmor', 'playShootBurst']) {
      expect(isShootMove(move)).toBe(true);
    }
    expect(isShootMove('playKick')).toBe(false);
    expect(isShootMove('playShootDreamTransit')).toBe(false);
  });

  it('穿梭剂只有 shoot 模式算 SHOOT', () => {
    expect(isShootPlay(dreamTransitPending('action_shoot_dream_transit', 'shoot'))).toBe(true);
    expect(isShootPlay(dreamTransitPending('action_shoot_dream_transit', 'transit'))).toBe(false);
    expect(isShootPlay(pendingPlayFor('action_shoot')!)).toBe(true);
    expect(isShootPlay(pendingPlayFor('action_kick')!)).toBe(false);
  });

  it('取出手牌里的死亡宣言', () => {
    expect(
      decreeCardsIn(['action_shoot', 'action_death_decree_a', 'action_death_decree_b']),
    ).toEqual(['action_death_decree_a', 'action_death_decree_b']);
  });

  it('SHOOT 且手里有宣言牌时才适用', () => {
    const shoot = pendingPlayFor('action_shoot')!;
    const kick = pendingPlayFor('action_kick')!;
    const hand = ['action_shoot', 'action_death_decree_a'];
    expect(decreeApplicable(shoot, hand)).toBe(true);
    expect(decreeApplicable(shoot, ['action_shoot'])).toBe(false);
    expect(decreeApplicable(kick, hand)).toBe(false);
    expect(decreeApplicable(null, hand)).toBe(false);
  });
});

describe('buildPlayArgs', () => {
  const play = (over: Partial<PendingPlay>): PendingPlay => ({
    card: 'card_x',
    move: 'playX',
    needsTarget: 'player',
    ...over,
  });

  it('无目标：只有牌', () => {
    expect(buildPlayArgs(play({ needsTarget: 'none', move: 'playUnlock' }))).toEqual(['card_x']);
  });

  it('目标玩家 · 穿梭剂 shoot 模式：牌、模式、目标', () => {
    const p = play({ move: 'playShootDreamTransit', dreamMode: 'shoot', argOrder: 'card_first' });
    expect(buildPlayArgs(p, '3', null)).toEqual(['card_x', 'shoot', '3']);
  });

  it('目标玩家 · 穿梭剂 shoot 模式带死亡宣言：宣言附在末位', () => {
    const p = play({ move: 'playShootDreamTransit', dreamMode: 'shoot', argOrder: 'card_first' });
    expect(buildPlayArgs(p, '3', 'decree_a')).toEqual(['card_x', 'shoot', '3', 'decree_a']);
  });

  it('目标玩家 · 穿梭剂 transit 模式不附宣言', () => {
    const p = play({ move: 'playShootDreamTransit', dreamMode: 'transit' });
    expect(buildPlayArgs(p, '3', 'decree_a')).toEqual(['card_x', 'transit', '3']);
  });

  it('目标玩家 · card_first：牌在前，目标在后，不附宣言', () => {
    const p = play({ move: 'playKick', argOrder: 'card_first' });
    expect(buildPlayArgs(p, '2', 'decree_a')).toEqual(['card_x', '2']);
  });

  it('目标玩家 · target_first 的 SHOOT 系：目标在前，没有宣言时只有两项', () => {
    const p = play({ move: 'playShoot', argOrder: 'target_first' });
    expect(buildPlayArgs(p, '4', null)).toEqual(['4', 'card_x']);
  });

  it('目标玩家 · target_first 的 SHOOT 系带宣言：宣言附在末位', () => {
    for (const move of ['playShoot', 'playShootKing', 'playShootArmor', 'playShootBurst']) {
      const p = play({ move, argOrder: 'target_first' });
      expect(buildPlayArgs(p, '4', 'decree_a')).toEqual(['4', 'card_x', 'decree_a']);
    }
  });

  it('目标玩家 · target_first 但不是 SHOOT 系：不附宣言', () => {
    const p = play({ move: 'playOther', argOrder: 'target_first' });
    expect(buildPlayArgs(p, '4', 'decree_a')).toEqual(['4', 'card_x']);
  });

  it('目标层 · 穿梭剂 transit 模式：牌、模式、层', () => {
    const p = play({
      move: 'playShootDreamTransit',
      needsTarget: 'layer',
      dreamMode: 'transit',
    });
    expect(buildPlayArgs(p, 2)).toEqual(['card_x', 'transit', 2]);
  });

  it('目标层 · 普通：牌、层', () => {
    const p = play({ move: 'playDreamTransit', needsTarget: 'layer', argOrder: 'card_first' });
    expect(buildPlayArgs(p, 3)).toEqual(['card_x', 3]);
  });

  it('与真实出牌意图配合：SHOOT 带目标与宣言', () => {
    expect(buildPlayArgs(pendingPlayFor('action_shoot')!, '1', 'action_death_decree_a')).toEqual([
      '1',
      'action_shoot',
      'action_death_decree_a',
    ]);
  });
});

describe('SHOOT 结算分级', () => {
  it('layersOfPlayers 取各玩家所在层', () => {
    const layers = layersOfPlayers(thiefG.players);
    expect(Object.keys(layers).sort()).toEqual(Object.keys(thiefG.players).sort());
    for (const [id, p] of Object.entries(thiefG.players)) expect(layers[id]).toBe(p.currentLayer);
    expect(layersOfPlayers(undefined)).toEqual({});
  });

  it('有挂起的位移选择时不提示', () => {
    expect(classifyShoot({ '1': 2 }, { '1': 1 }, true)).toEqual({ kind: 'pending' });
    expect(shootToastFor({ kind: 'pending' }, 'SHOOT', (id) => id)).toBeNull();
  });

  it('所在层变为 0 是击杀', () => {
    const outcome = classifyShoot({ '1': 2, '2': 3 }, { '1': 0, '2': 3 }, false);
    expect(outcome).toEqual({ kind: 'kill', playerID: '1', layer: 0 });
    expect(shootToastFor(outcome, 'SHOOT', (id) => `P${id}`)).toEqual({
      level: 'error',
      text: 'SHOOT 击杀 · P1',
    });
  });

  it('所在层变化但不是 0 是位移', () => {
    const outcome = classifyShoot({ '1': 2, '2': 3 }, { '1': 2, '2': 1 }, false);
    expect(outcome).toEqual({ kind: 'move', playerID: '2', layer: 1 });
    expect(shootToastFor(outcome, 'SHOOT', (id) => `P${id}`)).toEqual({
      level: 'info',
      text: 'SHOOT 命中 · P2 被推至 L1',
    });
  });

  it('没有任何人变化是未命中', () => {
    const outcome = classifyShoot({ '1': 2 }, { '1': 2 }, false);
    expect(outcome).toEqual({ kind: 'miss' });
    expect(shootToastFor(outcome, 'SHOOT', (id) => id)).toEqual({
      level: 'warn',
      text: 'SHOOT 未命中 · 目标无位移',
    });
  });

  it('之前没有记录的玩家不算变化；有变化的取第一个', () => {
    expect(classifyShoot({}, { '1': 2 }, false)).toEqual({ kind: 'miss' });
    expect(classifyShoot({ '1': 1, '2': 1 }, { '1': 2, '2': 0 }, false)).toEqual({
      kind: 'move',
      playerID: '1',
      layer: 2,
    });
  });
});

describe('buildActiveSkillContext', () => {
  const ctxOf = (G: MatchView, seat: string) =>
    buildActiveSkillContext({
      G,
      seat,
      isMyTurn: true,
      hand: G.players[seat]!.hand as string[],
    });

  it('盗梦者视角：身份、阶段、所在层来自视图', () => {
    const me = thiefG.players[thief.seat]!;
    const c = ctxOf(thiefG, thief.seat);
    expect(c.characterId).toBe(me.characterId);
    expect(c.turnPhase).toBe('action');
    expect(c.isHumanTurn).toBe(true);
    expect(c.isAlive).toBe(true);
    expect(c.humanLayer).toBe(me.currentLayer);
    expect(c.masterLayer).toBe(thiefG.players[thiefG.dreamMasterID]!.currentLayer);
    expect(c.faction).toBe('thief');
    expect(c.hand).toEqual(me.hand);
    expect(c.hasPending).toBe(false);
    expect(c.hasBribe).toBe(me.bribeReceived > 0);
  });

  it('梦主视角阵营是 master', () => {
    expect(ctxOf(masterG, master.seat).faction).toBe('master');
  });

  it('同层其他存活玩家：不含本人，且都在同一层', () => {
    const c = ctxOf(thiefG, thief.seat);
    const myLayer = thiefG.players[thief.seat]!.currentLayer;
    const expected = Object.entries(thiefG.players)
      .filter(([id, p]) => id !== thief.seat && p.isAlive && p.currentLayer === myLayer)
      .map(([id]) => id);
    expect(c.sameLayerPlayerIds).toEqual(expected);
    expect(c.sameLayerPlayerIds).not.toContain(thief.seat);
  });

  it('贿赂池只列仍在池里的项，保留原始下标', () => {
    const c = ctxOf(thiefG, thief.seat);
    const expected = thiefG.bribePool
      .map((b, i) => ({ index: i, id: b.id, status: b.status }))
      .filter((b) => b.status === 'inPool')
      .map(({ index, id }) => ({ index, id }));
    expect(c.bribePoolItems).toEqual(expected);
    expect(c.bribePoolAvailable).toBe(expected.length > 0);
  });

  it('待决状态存在时 hasPending 为真', () => {
    const G = { ...thiefG, pendingGraft: { playerID: thief.seat } } as MatchView;
    expect(ctxOf(G, thief.seat).hasPending).toBe(true);
  });

  it('弃牌堆来自视图；梦主是火星·战场时标记生效', () => {
    expect(ctxOf(thiefG, thief.seat).discardPile).toEqual(thiefG.deck.discardPile);
    const mars = {
      ...thiefG,
      players: {
        ...thiefG.players,
        [thiefG.dreamMasterID]: {
          ...thiefG.players[thiefG.dreamMasterID]!,
          characterId: 'dm_mars_battlefield',
        },
      },
    } as MatchView;
    expect(ctxOf(mars, thief.seat).marsBattlefieldActive).toBe(true);
    expect(ctxOf(thiefG, thief.seat).marsBattlefieldActive).toBe(false);
  });

  it('没有本人座位时给出安全的缺省值', () => {
    const c = buildActiveSkillContext({ G: thiefG, seat: null, isMyTurn: false, hand: [] });
    expect(c.characterId).toBe('');
    expect(c.isAlive).toBe(false);
    expect(c.humanLayer).toBe(1);
    expect(c.faction).toBe('thief');
    expect(c.skillUsedThisTurn).toEqual({});
  });

  it('技能目标是除本人外的存活玩家；昵称表覆盖所有玩家', () => {
    const ids = activeSkillTargetIds(thiefG.players, thief.seat);
    expect(ids).not.toContain(thief.seat);
    expect(ids).toHaveLength(Object.keys(thiefG.players).length - 1);
    expect(activeSkillTargetIds(undefined, thief.seat)).toEqual([]);
    const nicks = nicknameMap(thiefG.players);
    for (const [id, p] of Object.entries(thiefG.players)) expect(nicks[id]).toBe(p.nickname);
    expect(nicknameMap(undefined)).toEqual({});
  });
});

describe('层与玩家的展示数据', () => {
  it('buildLayerViews：每层一项，金库数只算未开的，已开的列出内容', () => {
    const layers = buildLayerViews(thiefG);
    expect(layers).toHaveLength(Object.keys(thiefG.layers).length);
    for (const l of layers) {
      const raw = thiefG.layers[l.layer]!;
      expect(l.heartLockValue).toBe(raw.heartLockValue);
      expect(l.playerIds).toEqual(raw.playersInLayer);
      expect(l.nightmareRevealed).toBe(raw.nightmareRevealed);
      expect(l.vaultCount).toBe(
        thiefG.vaults.filter((v) => v.layer === l.layer && !v.isOpened).length,
      );
      expect(l.openedVaults).toHaveLength(
        thiefG.vaults.filter((v) => v.layer === l.layer && v.isOpened).length,
      );
    }
  });

  it('buildLayerViews：已翻开的梦魇带牌号，没有视图时为空', () => {
    const G = {
      layers: {
        1: {
          layer: 1,
          heartLockValue: 3,
          playersInLayer: ['2'],
          nightmareRevealed: true,
          nightmareId: 'nm_x',
        },
      },
      vaults: [
        { id: 'v1', layer: 1, isOpened: true, contentType: 'coin' },
        { id: 'v2', layer: 1, isOpened: false, contentType: null },
        { id: 'v3', layer: 2, isOpened: false, contentType: null },
      ],
    } as unknown as MatchView;
    expect(buildLayerViews(G)).toEqual([
      {
        layer: 1,
        heartLockValue: 3,
        vaultCount: 1,
        openedVaults: [{ contentType: 'coin' }],
        nightmareRevealed: true,
        nightmareCardId: 'nm_x',
        playerIds: ['2'],
      },
    ]);
    expect(buildLayerViews(undefined)).toEqual([]);
  });

  it('buildPlayerViews：昵称、阵营、所在层、存活', () => {
    const views = buildPlayerViews(thiefG.players);
    for (const [id, p] of Object.entries(thiefG.players)) {
      expect(views[id]).toEqual({
        id,
        nickname: p.nickname,
        faction: p.faction,
        currentLayer: p.currentLayer,
        isAlive: p.isAlive,
      });
    }
    expect(buildPlayerViews(undefined)).toEqual({});
  });
});

describe('buildPlayerRows', () => {
  const seatById = new Map<string, SeatInfo>(thief.seats.map((s) => [s.seat, s]));

  it('每个玩家一行，标出本人、当前行动者与梦主', () => {
    const rows = buildPlayerRows(thiefG, {
      mySeat: thief.seat,
      currentSeat: thief.seat,
      seatById,
    })!;
    expect(rows.map((r) => r.id)).toEqual(Object.keys(thiefG.players));
    expect(rows.filter((r) => r.isSelf).map((r) => r.id)).toEqual([thief.seat]);
    expect(rows.filter((r) => r.isCurrent).map((r) => r.id)).toEqual([thief.seat]);
    expect(rows.filter((r) => r.isMaster).map((r) => r.id)).toEqual([thiefG.dreamMasterID]);
  });

  it('他人的名字：真人用昵称，Bot 用「AI N」', () => {
    const seats = new Map<string, SeatInfo>([
      ['1', { seat: '1', nickname: '小明', isBot: false, connected: true, takenOver: false }],
      ['2', { seat: '2', nickname: '', isBot: false, connected: true, takenOver: false }],
      ['3', { seat: '3', nickname: 'x', isBot: true, connected: true, takenOver: false }],
    ]);
    const G = {
      dreamMasterID: '3',
      players: {
        '1': { characterId: null, faction: 'thief', currentLayer: 1, isAlive: true, handCount: 2 },
        '2': { characterId: null, faction: 'thief', currentLayer: 2, isAlive: false, handCount: 0 },
        '3': { characterId: 'dm_x', faction: 'master', currentLayer: 3, isAlive: true },
        '4': { characterId: null, faction: 'thief', currentLayer: 1, isAlive: true, handCount: 1 },
      },
    } as unknown as MatchView;
    const rows = buildPlayerRows(G, { mySeat: null, currentSeat: '', seatById: seats })!;
    expect(rows.map((r) => r.otherName)).toEqual(['小明', '2', 'AI 3', 'AI 4']);
    expect(rows[0]).toMatchObject({ characterId: '', handCount: 2, layer: 1, isAlive: true });
    expect(rows[1]!.isAlive).toBe(false);
    expect(rows[2]).toMatchObject({ characterId: 'dm_x', isMaster: true, handCount: 0 });
  });

  it('没有玩家时返回 null；状态标识来自座位表', () => {
    expect(buildPlayerRows(undefined, { mySeat: null, currentSeat: '', seatById })).toBeNull();
    const rows = buildPlayerRows(thiefG, { mySeat: thief.seat, currentSeat: '', seatById })!;
    const other = rows.find((r) => r.id !== thief.seat)!;
    expect(other.markers).toEqual(['bot']);
    expect(rows.find((r) => r.id === thief.seat)!.markers).toEqual([]);
  });
});

describe('gravityCurrentPicker', () => {
  it('按游标在挑选顺序里轮转', () => {
    expect(gravityCurrentPicker({ pickOrder: ['1', '2', '3'], pickCursor: 0 }, 'me')).toBe('1');
    expect(gravityCurrentPicker({ pickOrder: ['1', '2', '3'], pickCursor: 4 }, 'me')).toBe('2');
  });

  it('没有待决状态或顺序为空时回退', () => {
    expect(gravityCurrentPicker(null, 'me')).toBe('me');
    expect(gravityCurrentPicker({ pickOrder: [], pickCursor: 0 }, 'me')).toBe('me');
  });
});
