// 轮到本人应答的待决情形：推导、按钮、草稿与确认命令

import { describe, it, expect } from 'vitest';
import type { MatchView, PlayerView } from '@icgame/game-engine';
import {
  EMPTY_DRAFT,
  groupDiscard,
  awaitedActions,
  awaitedKey,
  awaitedResponse,
  ariesParamsOf,
  hasOwnDeadline,
  libraPickCommand,
  sheetCommand,
  shootResultOf,
  splitPiles,
  toggleIndex,
  type AwaitedDraft,
  type MineAwaited,
} from './awaitedResponse';

function player(id: string, patch: Partial<PlayerView> = {}): PlayerView {
  return {
    id,
    nickname: `N${id}`,
    faction: 'thief',
    characterId: null,
    isRevealed: false,
    currentLayer: 2,
    isAlive: true,
    handCount: 0,
    hand: null,
    ...patch,
  } as PlayerView;
}

function viewWith(patch: Partial<MatchView> = {}): MatchView {
  return {
    currentPlayerID: '0',
    dreamMasterID: '9',
    turnNumber: 5,
    players: {
      '0': player('0', { hand: ['a', 'b'] }),
      '1': player('1', { hand: ['c', 'd', 'e'], currentLayer: 3 }),
      '2': player('2', { isAlive: false, currentLayer: 0 }),
      '3': player('3', { isAlive: false, currentLayer: 0, faction: 'master', isRevealed: true }),
      '4': player('4', { isAlive: false, currentLayer: 0 }),
      '9': player('9', { faction: 'master', isRevealed: true }),
    },
    layers: {
      1: { layer: 1, nightmareId: null },
      2: { layer: 2, nightmareId: 'nightmare_echo' },
    },
    pendingLibra: null,
    pendingAriesChoice: null,
    pendingVirgoChoice: null,
    pendingShootResponse: null,
    pendingSudgerRolls: null,
    ...patch,
  } as unknown as MatchView;
}

const shootResponse = (
  responseType: 'pisces' | 'terrorist' | null,
  cardId: string | null = 'action_shoot',
) =>
  ({
    shooterID: '0',
    targetPlayerID: '1',
    cardId,
    sameLayerRequired: true,
    deathFaces: [1],
    moveFaces: [2],
    extraOnMove: null,
    decreeId: null,
    preventMove: false,
    responseType,
  }) as MatchView['pendingShootResponse'];

function mine(view: MatchView, seat: string): MineAwaited {
  const a = awaitedResponse(view, seat);
  if (a === null || !a.mine) throw new Error('应当轮到本人');
  return a;
}

describe('awaitedResponse · 没有待决状态', () => {
  it('没有待决状态为 null', () => {
    expect(awaitedResponse(viewWith(), '1')).toBeNull();
  });
});

describe('awaitedResponse · SHOOT 响应', () => {
  it('双鱼窗口：目标本人可闪避到更小的相邻层', () => {
    const a = mine(viewWith({ pendingShootResponse: shootResponse('pisces') }), '1');
    expect(a).toMatchObject({
      kind: 'shoot-evade',
      shooterID: '0',
      cardId: 'action_shoot',
      canEvade: true,
      evadeLayer: 2,
    });
  });

  it('哈雷·冲击没有实体牌：窗口照常给出闪避与放弃，牌为 null', () => {
    const a = mine(viewWith({ pendingShootResponse: shootResponse('pisces', null) }), '1');
    expect(a).toMatchObject({ kind: 'shoot-evade', shooterID: '0', cardId: null, canEvade: true });
    expect(awaitedActions(a).map((x) => x.effect)).toEqual([
      { type: 'move', move: 'respondShootEvade', args: [] },
      { type: 'move', move: 'respondShootPass', args: [] },
    ]);
    expect(awaitedKey(a, 3)).toBe('shoot-evade|3|0|null');
  });

  it('双鱼在第 1 层：不能闪避（引擎守卫），只能放弃', () => {
    const view = viewWith({
      pendingShootResponse: shootResponse('pisces'),
      players: { ...viewWith().players, '1': player('1', { currentLayer: 1, hand: [] }) },
    });
    const a = mine(view, '1');
    expect(a).toMatchObject({ kind: 'shoot-evade', canEvade: false, evadeLayer: null });
    const evade = awaitedActions(a).find((x) => x.id === 'evade')!;
    expect(evade.disabled).toBe(true);
  });

  it('恐怖分子窗口：目标本人可以弃任一张手牌或接受 -1', () => {
    const a = mine(viewWith({ pendingShootResponse: shootResponse('terrorist') }), '1');
    expect(a).toMatchObject({ kind: 'shoot-zealot', hand: ['c', 'd', 'e'] });
  });

  it('恐怖分子窗口：没有手牌时「弃牌」不可点，只能接受惩罚', () => {
    const view = viewWith({
      pendingShootResponse: shootResponse('terrorist'),
      players: { ...viewWith().players, '1': player('1', { hand: [] }) },
    });
    const actions = awaitedActions(mine(view, '1'));
    expect(actions.find((x) => x.id === 'discard')!.disabled).toBe(true);
    expect(actions.find((x) => x.id === 'accept')!.disabled).toBe(false);
  });

  it('不是目标的人、响应类型对本人不可见时都不是本人', () => {
    const view = viewWith({ pendingShootResponse: shootResponse('pisces') });
    expect(awaitedResponse(view, '0')).toEqual({ mine: false });
    expect(awaitedResponse(view, null)).toEqual({ mine: false });
    const hidden = viewWith({ pendingShootResponse: shootResponse(null) });
    expect(awaitedResponse(hidden, '1')).toEqual({ mine: false });
  });

  it('按钮发出的 move：闪避 / 放弃 / 接受惩罚', () => {
    const evade = awaitedActions(
      mine(viewWith({ pendingShootResponse: shootResponse('pisces') }), '1'),
    );
    expect(evade.map((x) => [x.id, x.effect])).toEqual([
      ['evade', { type: 'move', move: 'respondShootEvade', args: [] }],
      ['pass', { type: 'move', move: 'respondShootPass', args: [] }],
    ]);
    expect(evade.find((x) => x.id === 'pass')!.decline).toBe(true);
    const zealot = awaitedActions(
      mine(viewWith({ pendingShootResponse: shootResponse('terrorist') }), '1'),
    );
    expect(zealot.find((x) => x.id === 'accept')!.effect).toEqual({
      type: 'move',
      move: 'respondTerroristAccept',
      args: [],
    });
    expect(zealot.find((x) => x.id === 'discard')!.effect).toEqual({
      type: 'sheet',
      sheet: 'zealot-discard',
    });
  });

  it('狂热弃牌：按位置选牌，同名牌各算一张，确认发 respondTerroristDiscard', () => {
    const view = viewWith({
      pendingShootResponse: shootResponse('terrorist'),
      players: { ...viewWith().players, '1': player('1', { hand: ['x', 'x', 'y'] }) },
    });
    const a = mine(view, '1');
    expect(sheetCommand(a, 'zealot-discard', EMPTY_DRAFT)).toBeNull();
    expect(sheetCommand(a, 'zealot-discard', { ...EMPTY_DRAFT, discardIndex: 1 })).toEqual({
      move: 'respondTerroristDiscard',
      args: ['x'],
    });
    expect(sheetCommand(a, 'zealot-discard', { ...EMPTY_DRAFT, discardIndex: 9 })).toBeNull();
  });
});

describe('awaitedResponse · 天秤', () => {
  const libraView = (split: NonNullable<MatchView['pendingLibra']>['split']) =>
    viewWith({ pendingLibra: { bonderPlayerID: '0', targetPlayerID: '1', split } });

  it('未分牌：轮到目标，手牌是本人全部手牌', () => {
    const a = mine(libraView(null), '1');
    expect(a).toMatchObject({ kind: 'libra-split', bonderID: '0', hand: ['c', 'd', 'e'] });
    expect(awaitedResponse(libraView(null), '0')).toEqual({ mine: false });
  });

  it('分牌：一份可以为空，确认发 resolveLibraSplit 两堆', () => {
    const a = mine(libraView(null), '1');
    expect(sheetCommand(a, 'libra-split', EMPTY_DRAFT)).toEqual({
      move: 'resolveLibraSplit',
      args: [['c', 'd', 'e'], []],
    });
    expect(sheetCommand(a, 'libra-split', { ...EMPTY_DRAFT, secondPile: [0, 2] })).toEqual({
      move: 'resolveLibraSplit',
      args: [['d'], ['c', 'e']],
    });
  });

  it('已分牌：轮到发动者，看到两份的内容', () => {
    const view = libraView({ pile1: ['c'], pile2: ['d', 'e'], pile1Count: 1, pile2Count: 2 });
    const a = mine(view, '0');
    expect(a).toMatchObject({ kind: 'libra-pick', targetID: '1', pile1: ['c'], pile2: ['d', 'e'] });
    expect(awaitedResponse(view, '1')).toEqual({ mine: false });
    expect(libraPickCommand('pile2')).toEqual({ move: 'resolveLibraPick', args: ['pile2'] });
  });

  it('两份的内容对本人不可见（为 null）时不是本人', () => {
    const view = libraView({ pile1: null, pile2: null, pile1Count: 1, pile2Count: 2 });
    expect(awaitedResponse(view, '0')).toEqual({ mine: false });
  });

  it('打开弹窗的按钮：分牌 / 挑一份', () => {
    expect(awaitedActions(mine(libraView(null), '1'))[0]!.effect).toEqual({
      type: 'sheet',
      sheet: 'libra-split',
    });
    const view = libraView({ pile1: [], pile2: ['d'], pile1Count: 0, pile2Count: 1 });
    expect(awaitedActions(mine(view, '0'))[0]!.effect).toEqual({
      type: 'sheet',
      sheet: 'libra-pick',
    });
  });
});

describe('awaitedResponse · 意念判官', () => {
  const sudgerView = () =>
    viewWith({
      pendingSudgerRolls: {
        rollA: 1,
        rollB: 4,
        targetPlayerID: '1',
        cardId: 'action_shoot',
        deathFaces: [1],
        moveFaces: [2, 3, 4],
        extraOnMove: null,
      },
    });

  it('轮到回合主人；两个骰值各自给出结算结果', () => {
    const a = mine(sudgerView(), '0');
    expect(a).toMatchObject({ kind: 'sudger', targetID: '1', cardId: 'action_shoot' });
    expect((a as Extract<MineAwaited, { kind: 'sudger' }>).rolls).toEqual([
      { pick: 'A', roll: 1, result: 'kill' },
      { pick: 'B', roll: 4, result: 'move' },
    ]);
    expect(awaitedResponse(sudgerView(), '1')).toEqual({ mine: false });
  });

  it('两个按钮分别发 resolveSudgerPick A / B', () => {
    const actions = awaitedActions(mine(sudgerView(), '0'));
    expect(actions.map((x) => x.effect)).toEqual([
      { type: 'move', move: 'resolveSudgerPick', args: ['A'] },
      { type: 'move', move: 'resolveSudgerPick', args: ['B'] },
    ]);
    expect(actions.map((x) => x.hintKey)).toEqual(['awaited.result.kill', 'awaited.result.move']);
  });

  it('shootResultOf：死亡面优先，其次移动面，否则落空', () => {
    expect(shootResultOf(1, [1, 2], [2, 3])).toBe('kill');
    expect(shootResultOf(3, [1, 2], [2, 3])).toBe('move');
    expect(shootResultOf(6, [1, 2], [2, 3])).toBe('miss');
  });
});

describe('awaitedResponse · 处女', () => {
  const virgoView = (virgoID: string | null) =>
    viewWith({ pendingVirgoChoice: { virgoID, triggerRoll: 6, shooterID: '1' } });

  it('只有点名对本人可见时才是本人', () => {
    expect(awaitedResponse(virgoView('0'), '0')?.mine).toBe(true);
    expect(awaitedResponse(virgoView(null), '0')).toEqual({ mine: false });
    expect(awaitedResponse(virgoView('0'), '1')).toEqual({ mine: false });
  });

  it('可复活的人：任何已死亡的玩家，不限阵营，不含自己', () => {
    const a = mine(virgoView('0'), '0');
    expect(a).toMatchObject({ kind: 'virgo', alive: true, reviveTargets: ['2', '3', '4'] });
    expect((a as Extract<MineAwaited, { kind: 'virgo' }>).teleportLayers).toEqual([1, 2, 3, 4]);
  });

  it('梦主死亡时也在可复活名单里', () => {
    const view = viewWith({
      pendingVirgoChoice: { virgoID: '0', triggerRoll: 6, shooterID: '1' },
      players: {
        '0': player('0'),
        '1': player('1'),
        '9': player('9', { isAlive: false, currentLayer: 0, faction: 'master', isRevealed: true }),
      },
    });
    expect(mine(view, '0')).toMatchObject({ kind: 'virgo', reviveTargets: ['9'] });
    const a = mine(view, '0');
    expect(sheetCommand(a, 'virgo-revive', { ...EMPTY_DRAFT, reviveTarget: '9' })).toEqual({
      move: 'respondVirgoPerfect',
      args: ['revive', { targetID: '9' }],
    });
  });

  it('活着的人不在可复活名单里，不能确认', () => {
    const a = mine(virgoView('0'), '0');
    expect(sheetCommand(a, 'virgo-revive', { ...EMPTY_DRAFT, reviveTarget: '1' })).toBeNull();
  });

  it('没有可复活的人：复活按钮不可点；抽牌与传送可点', () => {
    const view = viewWith({
      pendingVirgoChoice: { virgoID: '0', triggerRoll: 6, shooterID: '1' },
      players: { '0': player('0'), '1': player('1'), '9': player('9', { faction: 'master' }) },
    });
    const actions = awaitedActions(mine(view, '0'));
    const byId = Object.fromEntries(actions.map((x) => [x.id, x]));
    expect(byId.revive!.disabled).toBe(true);
    expect(byId['draw-two']!.disabled).toBe(false);
    expect(byId.teleport!.disabled).toBe(false);
    expect(byId.skip!.decline).toBe(true);
  });

  it('处女已死亡：只能放弃', () => {
    const view = viewWith({
      pendingVirgoChoice: { virgoID: '2', triggerRoll: 6, shooterID: '1' },
    });
    const actions = awaitedActions(mine(view, '2'));
    expect(actions.filter((x) => !x.disabled).map((x) => x.id)).toEqual(['skip']);
  });

  it('按钮与确认命令：抽 2 张 / 放弃直接发；复活与传送要选完才能确认', () => {
    const a = mine(virgoView('0'), '0');
    const byId = Object.fromEntries(awaitedActions(a).map((x) => [x.id, x]));
    expect(byId['draw-two']!.effect).toEqual({
      type: 'move',
      move: 'respondVirgoPerfect',
      args: ['draw_two'],
    });
    expect(byId.skip!.effect).toEqual({
      type: 'move',
      move: 'respondVirgoPerfect',
      args: ['skip'],
    });
    expect(byId.revive!.effect).toEqual({ type: 'sheet', sheet: 'virgo-revive' });
    expect(byId.teleport!.effect).toEqual({ type: 'sheet', sheet: 'virgo-teleport' });

    expect(sheetCommand(a, 'virgo-revive', EMPTY_DRAFT)).toBeNull();
    expect(sheetCommand(a, 'virgo-revive', { ...EMPTY_DRAFT, reviveTarget: '4' })).toEqual({
      move: 'respondVirgoPerfect',
      args: ['revive', { targetID: '4' }],
    });
    // 不在可复活名单里的人不能确认
    expect(sheetCommand(a, 'virgo-revive', { ...EMPTY_DRAFT, reviveTarget: '9' })).toBeNull();
    expect(sheetCommand(a, 'virgo-teleport', EMPTY_DRAFT)).toBeNull();
    expect(sheetCommand(a, 'virgo-teleport', { ...EMPTY_DRAFT, teleportLayer: 4 })).toEqual({
      move: 'respondVirgoPerfect',
      args: ['teleport', { layer: 4 }],
    });
    expect(sheetCommand(a, 'virgo-teleport', { ...EMPTY_DRAFT, teleportLayer: 0 })).toBeNull();
  });
});

describe('awaitedResponse · 白羊', () => {
  const ariesView = (ariesID: string | null, layers?: MatchView['layers']) =>
    viewWith({
      pendingAriesChoice: { ariesID, victimLayer: 2, victimID: '1' },
      ...(layers ? { layers } : {}),
    });

  it('只有白羊本人看到点名；梦魇来自视图里该层的梦魇', () => {
    const a = mine(ariesView('0'), '0');
    expect(a).toMatchObject({
      kind: 'aries',
      victimID: '1',
      victimLayer: 2,
      nightmareId: 'nightmare_echo',
      params: 'echo',
    });
    expect(awaitedResponse(ariesView(null), '0')).toEqual({ mine: false });
    expect(awaitedResponse(ariesView('0'), '1')).toEqual({ mine: false });
  });

  it('梦魇不同，发动是否要选择不同', () => {
    expect(ariesParamsOf('nightmare_echo')).toBe('echo');
    expect(ariesParamsOf('nightmare_plague')).toBe('plague');
    expect(ariesParamsOf('nightmare_vortex')).toBe('none');
    expect(ariesParamsOf(null)).toBe('none');
  });

  it('无需选择的梦魇：发动与弃掉都是直接发 move', () => {
    const layers = {
      2: { layer: 2, nightmareId: 'nightmare_vortex' },
    } as unknown as MatchView['layers'];
    const actions = awaitedActions(mine(ariesView('0', layers), '0'));
    expect(actions.map((x) => x.effect)).toEqual([
      { type: 'move', move: 'playAriesStardustActivate', args: [] },
      { type: 'move', move: 'playAriesStardustDiscard', args: [] },
    ]);
    expect(actions.every((x) => !x.disabled)).toBe(true);
  });

  it('回音萦绕：发动要先选层与方式，选完才有确认命令', () => {
    const a = mine(ariesView('0'), '0');
    const activate = awaitedActions(a)[0]!;
    expect(activate.effect).toEqual({ type: 'sheet', sheet: 'aries-echo' });
    expect(sheetCommand(a, 'aries-echo', EMPTY_DRAFT)).toBeNull();
    expect(sheetCommand(a, 'aries-echo', { ...EMPTY_DRAFT, echoLayer: 3 })).toBeNull();
    expect(
      sheetCommand(a, 'aries-echo', { ...EMPTY_DRAFT, echoLayer: 3, echoAction: 'add' }),
    ).toEqual({
      move: 'playAriesStardustActivate',
      args: [{ targetLayer: 3, action: 'add' }],
    });
  });

  it('邪念瘟疫：发动要先点名派发贿赂牌的盗梦者（可以一个都不点），候选是被击杀者所在层存活的非梦主座位', () => {
    const layers = {
      2: {
        layer: 2,
        nightmareId: 'nightmare_plague',
        playersInLayer: ['0', '1', '2', '9'],
      },
    } as unknown as MatchView['layers'];
    const a = mine(ariesView('0', layers), '0');
    expect(a).toMatchObject({ kind: 'aries', params: 'plague', candidates: ['0', '1'] });
    const activate = awaitedActions(a)[0]!;
    expect(activate.effect).toEqual({ type: 'sheet', sheet: 'aries-plague' });
    expect(sheetCommand(a, 'aries-plague', EMPTY_DRAFT)).toEqual({
      move: 'playAriesStardustActivate',
      args: [{ bribedTargets: [] }],
    });
    expect(sheetCommand(a, 'aries-plague', { ...EMPTY_DRAFT, bribed: ['1'] })).toEqual({
      move: 'playAriesStardustActivate',
      args: [{ bribedTargets: ['1'] }],
    });
    // 回音萦绕的弹窗命令不会用在邪念瘟疫上
    expect(
      sheetCommand(a, 'aries-echo', { ...EMPTY_DRAFT, echoLayer: 1, echoAction: 'add' }),
    ).toBeNull();
  });

  it('看不到梦魇（该层已没有）时两个按钮都不可点', () => {
    const layers = { 2: { layer: 2, nightmareId: null } } as unknown as MatchView['layers'];
    const actions = awaitedActions(mine(ariesView('0', layers), '0'));
    expect(actions.every((x) => x.disabled)).toBe(true);
  });

  it('白羊的选择不挡人，没有自己的时限；其余应答有', () => {
    expect(hasOwnDeadline(mine(ariesView('0'), '0'))).toBe(false);
    expect(
      hasOwnDeadline(mine(viewWith({ pendingShootResponse: shootResponse('pisces') }), '1')),
    ).toBe(true);
  });
});

describe('优先级', () => {
  it('同时存在多个待决状态时，阻塞类先于白羊', () => {
    const view = viewWith({
      pendingShootResponse: shootResponse('pisces'),
      pendingAriesChoice: { ariesID: '1', victimLayer: 2, victimID: '3' },
    });
    expect(mine(view, '1').kind).toBe('shoot-evade');
  });
});

describe('草稿工具', () => {
  it('toggleIndex 切换并保持升序', () => {
    expect(toggleIndex([], 2)).toEqual([2]);
    expect(toggleIndex([2], 0)).toEqual([0, 2]);
    expect(toggleIndex([0, 2], 2)).toEqual([0]);
  });

  it('splitPiles 越界位置忽略', () => {
    expect(splitPiles(['a', 'b'], [5])).toEqual({ pile1: ['a', 'b'], pile2: [] });
  });

  it('awaitedKey：换了一次待决状态，识别串就变', () => {
    const a = mine(viewWith({ pendingShootResponse: shootResponse('pisces') }), '1');
    expect(awaitedKey(null, 5)).toBeNull();
    expect(awaitedKey(a, 5)).not.toEqual(awaitedKey(a, 6));
  });

  it('草稿类型可以不带可选项直接用 EMPTY_DRAFT 展开', () => {
    const d: AwaitedDraft = { ...EMPTY_DRAFT, secondPile: [1] };
    expect(d.discardIndex).toBeNull();
  });
});

describe('awaitedResponse · 黑洞·吞噬 / 达尔文·淘汰 / 雅典娜·急智', () => {
  it('黑洞·吞噬：名单里的每个人都轮到本人；不在名单里（含黑洞自己）与旁观者只需要等', () => {
    const view = viewWith({
      pendingBlackHoleLevy: { blackHoleID: '9', waiting: ['0', '1'] },
    } as Partial<MatchView>);
    expect(awaitedResponse(view, '0')).toEqual({
      mine: true,
      kind: 'levy',
      blackHoleID: '9',
      hand: ['a', 'b'],
    });
    expect(awaitedResponse(view, '1')).toMatchObject({ mine: true, kind: 'levy' });
    expect(awaitedResponse(view, '2')).toEqual({ mine: false });
    expect(awaitedResponse(view, '9')).toEqual({ mine: false });
    expect(awaitedResponse(view, null)).toEqual({ mine: false });
  });

  it('黑洞·吞噬：交牌是必须的，只有一个按钮（打开选牌弹窗），没有放弃', () => {
    const view = viewWith({
      pendingBlackHoleLevy: { blackHoleID: '9', waiting: ['0'] },
    } as Partial<MatchView>);
    const a = awaitedResponse(view, '0') as MineAwaited;
    const actions = awaitedActions(a);
    expect(actions.map((x) => [x.id, x.decline, x.disabled, x.effect])).toEqual([
      ['give', false, false, { type: 'sheet', sheet: 'levy-give' }],
    ]);
    expect(hasOwnDeadline(a)).toBe(true);
  });

  it('黑洞·吞噬：选中的手牌位置换成牌 id 发 respondBlackHoleLevy；没选 / 越界不能确认', () => {
    const view = viewWith({
      pendingBlackHoleLevy: { blackHoleID: '9', waiting: ['0'] },
    } as Partial<MatchView>);
    const a = awaitedResponse(view, '0') as MineAwaited;
    expect(sheetCommand(a, 'levy-give', EMPTY_DRAFT)).toBeNull();
    expect(sheetCommand(a, 'levy-give', { ...EMPTY_DRAFT, giveIndex: 1 })).toEqual({
      move: 'respondBlackHoleLevy',
      args: ['b'],
    });
    expect(sheetCommand(a, 'levy-give', { ...EMPTY_DRAFT, giveIndex: 7 })).toBeNull();
    // 弹窗与待决状态对不上
    expect(sheetCommand(a, 'darwin-return', { ...EMPTY_DRAFT, returnPicks: [0, 1] })).toBeNull();
  });

  it('达尔文·淘汰：只有达尔文本人；手牌包含新抽的牌，选 2 张按选择顺序放回', () => {
    const view = viewWith({ pendingDarwinReturn: { playerID: '0' } } as Partial<MatchView>);
    const a = awaitedResponse(view, '0') as MineAwaited;
    expect(a).toEqual({ mine: true, kind: 'darwin', hand: ['a', 'b'] });
    expect(awaitedResponse(view, '1')).toEqual({ mine: false });
    expect(awaitedActions(a)[0]).toMatchObject({
      id: 'return',
      decline: false,
      effect: { type: 'sheet', sheet: 'darwin-return' },
    });
    // 先选的在最顶：选 [1, 0] 就是 b 在最上面
    expect(sheetCommand(a, 'darwin-return', { ...EMPTY_DRAFT, returnPicks: [1, 0] })).toEqual({
      move: 'respondDarwinReturn',
      args: [['b', 'a']],
    });
    // 必须刚好 2 张
    expect(sheetCommand(a, 'darwin-return', { ...EMPTY_DRAFT, returnPicks: [0] })).toBeNull();
    expect(sheetCommand(a, 'darwin-return', EMPTY_DRAFT)).toBeNull();
    expect(sheetCommand(a, 'darwin-return', { ...EMPTY_DRAFT, returnPicks: [0, 5] })).toBeNull();
  });

  it('达尔文·淘汰：手牌不足 2 张时按钮置灰（引擎不会出现这种局面，仅作防御）', () => {
    const view = viewWith({
      pendingDarwinReturn: { playerID: '2' },
      players: { ...viewWith().players, '2': player('2', { hand: ['x'] }) },
    } as Partial<MatchView>);
    const a = awaitedResponse(view, '2') as MineAwaited;
    expect(awaitedActions(a)[0]!.disabled).toBe(true);
  });

  it('雅典娜·急智：只有雅典娜本人的视图里点了名；别人（athenaID 为 null）只需要等', () => {
    const own = viewWith({
      pendingAthenaWit: { athenaID: '0', userID: '1', cardId: 'action_kick' },
      deck: { cardCount: 5, discardPile: ['x', 'y', 'x'] },
    } as Partial<MatchView>);
    expect(awaitedResponse(own, '0')).toEqual({
      mine: true,
      kind: 'athena',
      userID: '1',
      cardId: 'action_kick',
      discard: ['x', 'y', 'x'],
    });
    const hidden = viewWith({
      pendingAthenaWit: { athenaID: null, userID: '1', cardId: 'action_kick' },
      deck: { cardCount: 5, discardPile: ['x'] },
    } as Partial<MatchView>);
    for (const seat of ['0', '1', '2', null]) {
      expect(awaitedResponse(hidden, seat)).toEqual({ mine: false });
    }
  });

  it('雅典娜·急智：可以放弃（respondAthenaWit null），或打开选牌弹窗', () => {
    const view = viewWith({
      pendingAthenaWit: { athenaID: '0', userID: '1', cardId: 'action_kick' },
      deck: { cardCount: 5, discardPile: ['x', 'y'] },
    } as Partial<MatchView>);
    const a = awaitedResponse(view, '0') as MineAwaited;
    const actions = awaitedActions(a);
    expect(actions.map((x) => [x.id, x.decline, x.disabled])).toEqual([
      ['take', false, false],
      ['pass', true, false],
    ]);
    expect(actions[0]!.effect).toEqual({ type: 'sheet', sheet: 'athena-pick' });
    expect(actions[1]!.effect).toEqual({ type: 'move', move: 'respondAthenaWit', args: [null] });
  });

  it('雅典娜·急智：选的牌必须在弃牌堆里才能确认，命令带牌 id', () => {
    const view = viewWith({
      pendingAthenaWit: { athenaID: '0', userID: '1', cardId: 'action_kick' },
      deck: { cardCount: 5, discardPile: ['x', 'y'] },
    } as Partial<MatchView>);
    const a = awaitedResponse(view, '0') as MineAwaited;
    expect(sheetCommand(a, 'athena-pick', EMPTY_DRAFT)).toBeNull();
    expect(sheetCommand(a, 'athena-pick', { ...EMPTY_DRAFT, athenaCard: 'y' })).toEqual({
      move: 'respondAthenaWit',
      args: ['y'],
    });
    expect(sheetCommand(a, 'athena-pick', { ...EMPTY_DRAFT, athenaCard: 'z' })).toBeNull();
  });

  it('groupDiscard：弃牌堆按牌种归并，保持首次出现的顺序', () => {
    expect(groupDiscard(['x', 'y', 'x', 'z', 'x'])).toEqual([
      { card: 'x', count: 3 },
      { card: 'y', count: 1 },
      { card: 'z', count: 1 },
    ]);
    expect(groupDiscard([])).toEqual([]);
  });

  it('awaitedKey：换了一次待决状态（回合 / 出牌者 / 手牌）就换识别串', () => {
    const levy = awaitedResponse(
      viewWith({
        pendingBlackHoleLevy: { blackHoleID: '9', waiting: ['0'] },
      } as Partial<MatchView>),
      '0',
    ) as MineAwaited;
    expect(awaitedKey(levy, 5)).toBe('levy|5|9|a,b');
    expect(awaitedKey(levy, 6)).not.toBe(awaitedKey(levy, 5));
    const darwin = awaitedResponse(
      viewWith({ pendingDarwinReturn: { playerID: '0' } } as Partial<MatchView>),
      '0',
    ) as MineAwaited;
    expect(awaitedKey(darwin, 5)).toBe('darwin|5|a,b');
    const athena = awaitedResponse(
      viewWith({
        pendingAthenaWit: { athenaID: '0', userID: '1', cardId: 'action_kick' },
        deck: { cardCount: 1, discardPile: ['x'] },
      } as Partial<MatchView>),
      '0',
    ) as MineAwaited;
    expect(awaitedKey(athena, 5)).toBe('athena|5|1|action_kick');
  });
});
