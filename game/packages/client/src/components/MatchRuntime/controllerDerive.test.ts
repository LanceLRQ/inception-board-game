// 对局界面控制层纯推导的测试：输入尽量用固定场景里引擎真实产出的视图

import { describe, it, expect } from 'vitest';
import type { MatchView, RunnerCtx } from '@icgame/game-engine';
import { HAND_LIMIT } from '@icgame/game-engine/config';
import { buildFixtureScenario } from '../../match/fixtures/buildScenario';
import {
  adaptPlayForCharacter,
  SUDGER_CHARACTER_ID,
  activeSkillTargetIds,
  buildActiveSkillContext,
  buildPlayArgs,
  CHESS_MAX_USES,
  chessAvailable,
  chessDialogOpen,
  unopenedVaultCount,
  classifyShoot,
  decreeApplicable,
  decreeCardsIn,
  commitPlanFor,
  deriveHandItems,
  deriveOutcome,
  discardCardsFor,
  discardRequiredOf,
  dreamTransitPending,
  effectiveDiscardSelection,
  effectivePendingPlay,
  gravityCurrentPicker,
  handCardMode,
  isShootMove,
  isShootPlay,
  layersOfPlayers,
  nicknameMap,
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

describe('discardRequiredOf', () => {
  it('视图里是几就是几；null（非本人弃牌阶段）和没有视图都按 0', () => {
    expect(discardRequiredOf({ discardRequired: 3 })).toBe(3);
    expect(discardRequiredOf({ discardRequired: 0 })).toBe(0);
    expect(discardRequiredOf({ discardRequired: null })).toBe(0);
    expect(discardRequiredOf(undefined)).toBe(0);
  });

  it('固定场景「弃牌阶段」：取引擎视图给的超出张数', () => {
    const G = buildFixtureScenario('thief-discard').view.G as MatchView;
    const seat = buildFixtureScenario('thief-discard').seat;
    expect(discardRequiredOf(G)).toBe(G.players[seat]!.hand!.length - HAND_LIMIT);
    expect(discardRequiredOf(G)).toBeGreaterThan(0);
  });

  it('固定场景「行动阶段」：视图里没有这个数，按 0', () => {
    const G = buildFixtureScenario('thief').view.G as MatchView;
    expect(G.discardRequired).toBeNull();
    expect(discardRequiredOf(G)).toBe(0);
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

  it('弃牌阶段已选位置的牌标 selected，其余不标', () => {
    const kickAt = hand.indexOf('action_kick');
    expect(kickAt).toBeGreaterThanOrEqual(0);
    const items = deriveHandItems(hand, {
      turnPhase: 'discard',
      isMyTurn: true,
      winner: null,
      overHand: 1,
      selectedDiscard: [kickAt],
      pendingCard: undefined,
    });
    expect(items.every((it) => it.mode === 'discard')).toBe(true);
    expect(items.filter((it) => it.selected).map((it) => it.index)).toEqual([kickAt]);
  });

  it('手里有两张同名牌时，两张可以同时被选中', () => {
    const twin = ['action_shoot', 'action_shoot', 'action_unlock'];
    const items = deriveHandItems(twin, {
      turnPhase: 'discard',
      isMyTurn: true,
      winner: null,
      overHand: 2,
      selectedDiscard: [0, 1],
      pendingCard: undefined,
    });
    expect(items.map((it) => it.selected)).toEqual([true, true, false]);
  });

  it('不在弃牌模式时，选中记录不生效', () => {
    const items = deriveHandItems(hand, {
      ...ACTION_TURN,
      selectedDiscard: [0],
      pendingCard: null,
    });
    expect(items.some((it) => it.selected)).toBe(false);
  });
});

describe('effectiveDiscardSelection', () => {
  it('只保留仍在手牌范围内的位置，并去重', () => {
    expect(effectiveDiscardSelection([0, 2, 5, 2], 3, 'discard', true)).toEqual([0, 2]);
  });

  it('不在弃牌阶段或不是我的回合时清空', () => {
    expect(effectiveDiscardSelection([0], 3, 'action', true)).toEqual([]);
    expect(effectiveDiscardSelection([0], 3, 'discard', false)).toEqual([]);
  });
});

describe('toggleDiscardSelection', () => {
  it('未选则加入，已选则取消', () => {
    expect(toggleDiscardSelection([], 0, 2)).toEqual([0]);
    expect(toggleDiscardSelection([0, 1], 0, 2)).toEqual([1]);
  });

  it('已选满需弃数量时不再加入，且原样返回', () => {
    const prev = [0, 1];
    expect(toggleDiscardSelection(prev, 2, 2)).toBe(prev);
  });

  it('不修改传入的数组', () => {
    const prev = [0, 1];
    toggleDiscardSelection(prev, 0, 2);
    expect(prev).toEqual([0, 1]);
  });

  it('同名牌按位置各算一张：先后点两张同名牌，两张都留在选择里', () => {
    const hand = ['action_shoot', 'action_shoot', 'action_unlock'];
    let picked = toggleDiscardSelection([], 0, 2);
    picked = toggleDiscardSelection(picked, 1, 2);
    expect(picked).toEqual([0, 1]);
    expect(discardCardsFor(hand, picked)).toEqual(['action_shoot', 'action_shoot']);
  });
});

describe('discardCardsFor', () => {
  it('按选中位置换成卡牌 ID，顺序与位置顺序一致', () => {
    expect(discardCardsFor(['a', 'b', 'c'], [2, 0])).toEqual(['c', 'a']);
  });

  it('越界的位置被忽略', () => {
    expect(discardCardsFor(['a'], [0, 3])).toEqual(['a']);
  });
});

describe('commitPlanFor', () => {
  it('无目标的牌直接出', () => {
    const plan = commitPlanFor('action_unlock');
    expect(plan).toEqual({
      kind: 'direct',
      pending: expect.objectContaining({ card: 'action_unlock', move: 'playUnlock' }),
    });
  });

  it('需要目标的牌进入选目标流程', () => {
    expect(commitPlanFor('action_shoot')).toEqual({
      kind: 'target',
      pending: expect.objectContaining({ move: 'playShoot', needsTarget: 'player' }),
    });
    expect(commitPlanFor('action_dream_transit')).toEqual({
      kind: 'target',
      pending: expect.objectContaining({ needsTarget: 'layer' }),
    });
  });

  it('穿梭剂 SHOOT 与万有引力走各自的选择器', () => {
    expect(commitPlanFor('action_shoot_dream_transit')).toEqual({ kind: 'dreamTransit' });
    expect(commitPlanFor('action_gravity')).toEqual({ kind: 'gravity' });
  });

  it('不能出的牌没有计划', () => {
    expect(commitPlanFor('action_death_decree_3')).toBeNull();
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

describe('意念判官：打出 SHOOT 类牌改走【定罪】', () => {
  const SUDGER = SUDGER_CHARACTER_ID;

  it('角色 id 与引擎一致', () => {
    expect(SUDGER).toBe('thief_sudger_of_mind');
  });

  it.each([
    ['action_shoot', 'playShoot'],
    ['action_shoot_burst', 'playShootBurst'],
    ['action_shoot_assassin', 'playShootKing'],
    ['action_shoot_drill', 'playShootArmor'],
  ])('%s：move 由 %s 换成 playShootSudger，参数顺序与宣言不变', (card, move) => {
    const base = pendingPlayFor(card)!;
    expect(base.move).toBe(move);
    const adapted = adaptPlayForCharacter(base, SUDGER)!;
    expect(adapted.move).toBe('playShootSudger');
    expect(adapted.card).toBe(card);
    expect(buildPlayArgs(adapted, '3', 'action_death_decree_a')).toEqual([
      '3',
      card,
      'action_death_decree_a',
    ]);
    expect(buildPlayArgs(adapted, '3', null)).toEqual(['3', card]);
  });

  it('梦境穿梭剂的 SHOOT 模式：同样走定罪，目标在前、牌在后；transit 模式不受影响', () => {
    const shoot = adaptPlayForCharacter(
      dreamTransitPending('action_shoot_dream_transit', 'shoot'),
      SUDGER,
    )!;
    expect(shoot.move).toBe('playShootSudger');
    expect(shoot.dreamMode).toBeUndefined();
    expect(shoot.needsTarget).toBe('player');
    expect(buildPlayArgs(shoot, '2', 'action_death_decree_a')).toEqual([
      '2',
      'action_shoot_dream_transit',
      'action_death_decree_a',
    ]);
    const transit = dreamTransitPending('action_shoot_dream_transit', 'transit');
    expect(adaptPlayForCharacter(transit, SUDGER)).toBe(transit);
  });

  it('不是 SHOOT 类的牌不受影响', () => {
    const kick = pendingPlayFor('action_kick')!;
    expect(adaptPlayForCharacter(kick, SUDGER)).toBe(kick);
  });

  it('别的角色、没有出牌意图：原样返回', () => {
    const shoot = pendingPlayFor('action_shoot')!;
    expect(adaptPlayForCharacter(shoot, 'thief_pisces')).toBe(shoot);
    expect(adaptPlayForCharacter(shoot, '')).toBe(shoot);
    expect(adaptPlayForCharacter(null, SUDGER)).toBeNull();
  });

  it('改走定罪后仍算 SHOOT 出牌：死亡宣言可选项照常出现', () => {
    const adapted = adaptPlayForCharacter(pendingPlayFor('action_shoot')!, SUDGER)!;
    expect(isShootMove(adapted.move)).toBe(true);
    expect(isShootPlay(adapted)).toBe(true);
    expect(decreeApplicable(adapted, ['action_death_decree_a'])).toBe(true);
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

describe('棋局·易位弹窗', () => {
  const base = {
    characterId: 'dm_chess',
    isMyTurn: true,
    turnPhase: 'action',
    winner: null,
    busy: false,
    usedThisGame: 0,
    unopenedVaults: 4,
  };

  it('棋局梦主在自己的行动阶段、次数未满且有 2 个以上未开金库时可用', () => {
    expect(chessAvailable(base)).toBe(true);
  });

  it.each([
    ['不是棋局', { characterId: 'dm_neptune_ocean' }],
    ['不是本人回合', { isMyTurn: false }],
    ['不是行动阶段', { turnPhase: 'discard' }],
    ['对局已结束', { winner: 'master' }],
    ['有别的待办占着界面', { busy: true }],
    ['次数已用完', { usedThisGame: CHESS_MAX_USES }],
    ['未开金库不足 2 个', { unopenedVaults: 1 }],
  ] as const)('%s：不可用', (_label, patch) => {
    expect(chessAvailable({ ...base, ...patch })).toBe(false);
  });

  it('本回合还没处理过：自动弹出一次', () => {
    expect(chessDialogOpen(true, 5, null)).toBe(true);
  });

  it('关闭后本回合不再自动弹出，下一回合恢复自动弹出', () => {
    const dismissed = { turn: 5, mode: 'dismissed' } as const;
    expect(chessDialogOpen(true, 5, dismissed)).toBe(false);
    expect(chessDialogOpen(true, 6, dismissed)).toBe(true);
  });

  it('关闭后仍能从技能入口主动打开，主动打开的记录只在本回合有效', () => {
    const shown = { turn: 5, mode: 'shown' } as const;
    expect(chessDialogOpen(true, 5, shown)).toBe(true);
    expect(chessDialogOpen(true, 6, shown)).toBe(true);
    expect(chessDialogOpen(true, 6, { turn: 5, mode: 'dismissed' })).toBe(true);
  });

  it('技能不可用时弹窗必然关闭，不论记录是什么', () => {
    expect(chessDialogOpen(false, 5, null)).toBe(false);
    expect(chessDialogOpen(false, 5, { turn: 5, mode: 'shown' })).toBe(false);
  });

  it('unopenedVaultCount 只数没打开的', () => {
    expect(unopenedVaultCount([{ isOpened: true }, { isOpened: false }, {}])).toBe(2);
  });
});
