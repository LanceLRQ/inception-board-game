// 底部坞入口发出的 move，经真实引擎校验：界面推导出「可用」的入口，按界面拼的参数发过去引擎必须接受；
// 界面推导出「已用过 / 不可用」的，引擎也确实拒绝。固定场景的完整状态由引擎建出，视图经引擎过滤。

import { describe, it, expect } from 'vitest';
import {
  InceptionCityGame,
  applyMove,
  viewMatch,
  type GameDef,
  type MatchState,
  type MatchView,
} from '@icgame/game-engine';
import type { SetupState } from '@icgame/game-engine/setup';
import { buildFixtureMatch } from '../../match/fixtures/buildScenario';
import type { FixtureScenarioId } from '../../match/fixtures/scenarios';
import { computeMasterBribeInspectState } from '../MasterBribeInspectBanner/logic';
import { bribeHolderIds, buildPlayArgs, pendingPlayFor } from './controllerDerive';
import {
  EMPTY_DRAFT,
  awaitedActions,
  awaitedResponse,
  sheetCommand,
  type MineAwaited,
} from './response/awaitedResponse';
import {
  BLACK_HOLE_LEVY_SKILL_KEY,
  BLACK_SWAN_SKILL_KEY,
  adjacentLayers,
  deriveDockEntries,
  reviveArgs,
} from './model/dockEntries';
import {
  EMPTY_TOUR,
  buildDistribution,
  canConfirmTour,
  pickTourRecipient,
  tapTourCard,
  tourRecipientIds,
} from './model/tourDistribution';

const game: GameDef<SetupState> = InceptionCityGame;

function apply(
  state: MatchState<SetupState>,
  playerID: string,
  move: string,
  args: unknown[],
): MatchState<SetupState> | null {
  const res = applyMove(game, state, { playerID, move, args });
  return res.ok ? res.state : null;
}

function entriesFor(state: MatchState<SetupState>, seat: string) {
  const G = viewMatch(game, state, seat).G as MatchView;
  return deriveDockEntries({
    seat,
    dreamMasterID: G.dreamMasterID,
    players: G.players,
    hand: G.players[seat]!.hand ?? [],
    isMyTurn: G.currentPlayerID === seat,
    turnPhase: G.turnPhase,
    winner: null,
    busy: false,
  });
}

const sceneOf = (id: FixtureScenarioId) => buildFixtureMatch(id);

describe('复活：界面拼的参数引擎接受', () => {
  it('在迷失层复活自己：按手牌位置选 2 张，复活后在第 1 层、入口消失', () => {
    const { state, viewer } = sceneOf('thief-dead');
    expect(entriesFor(state, viewer).map((e) => [e.kind, e.enabled])).toEqual([
      ['reviveSelf', true],
    ]);
    const hand = state.G.players[viewer]!.hand;
    const [target, cards] = reviveArgs(null, hand, [0, 1]);
    const after = apply(state, viewer, 'playRevive', [target, cards]);
    expect(after).not.toBeNull();
    expect(after!.G.players[viewer]!.isAlive).toBe(true);
    expect(after!.G.players[viewer]!.currentLayer).toBe(1);
    expect(entriesFor(after!, viewer)).toEqual([]);
  });

  it('同名牌各按位置选：手里有两张同名牌时弃这两张', () => {
    const { state, viewer } = sceneOf('thief-dead');
    const player = state.G.players[viewer]!;
    const twin = player.hand[0]!;
    const withTwins: MatchState<SetupState> = {
      ...state,
      G: {
        ...state.G,
        players: {
          ...state.G.players,
          [viewer]: { ...player, hand: [twin, twin, ...player.hand.slice(1)] },
        },
      },
    };
    const [t, cards] = reviveArgs(null, withTwins.G.players[viewer]!.hand, [0, 1]);
    expect(cards).toEqual([twin, twin]);
    expect(apply(withTwins, viewer, 'playRevive', [t, cards])).not.toBeNull();
  });

  it('复活同伴：同伴移到自己所在层；复活后入口消失', () => {
    const { state, viewer } = sceneOf('thief-mate-dead');
    const G = viewMatch(game, state, viewer).G as MatchView;
    const mate = Object.keys(G.players).find((id) => !G.players[id]!.isAlive)!;
    const hand = state.G.players[viewer]!.hand;
    const [target, cards] = reviveArgs(mate, hand, [0, 2]);
    const after = apply(state, viewer, 'playRevive', [target, cards]);
    expect(after).not.toBeNull();
    expect(after!.G.players[mate]!.isAlive).toBe(true);
    expect(after!.G.players[mate]!.currentLayer).toBe(state.G.players[viewer]!.currentLayer);
    expect(entriesFor(after!, viewer)).toEqual([]);
  });

  it('手牌不够（只剩 1 张）：界面禁用入口，引擎也拒绝', () => {
    const { state, viewer } = sceneOf('thief-dead');
    const player = state.G.players[viewer]!;
    const short: MatchState<SetupState> = {
      ...state,
      G: {
        ...state.G,
        players: { ...state.G.players, [viewer]: { ...player, hand: [player.hand[0]!] } },
      },
    };
    const [entry] = entriesFor(short, viewer);
    expect(entry).toMatchObject({ kind: 'reviveSelf', enabled: false });
    expect(apply(short, viewer, 'playRevive', [null, [player.hand[0]!]])).toBeNull();
  });

  it('已复活自己的当回合：【解封】被界面标为不可打，引擎也拒绝', () => {
    const { state, viewer } = sceneOf('thief-dead');
    const hand = state.G.players[viewer]!.hand;
    const unlockAt = hand.indexOf('action_unlock' as never);
    expect(unlockAt).toBeGreaterThanOrEqual(0);
    const others = hand.map((_, i) => i).filter((i) => i !== unlockAt);
    const after = apply(state, viewer, 'playRevive', reviveArgs(null, hand, others.slice(0, 2)));
    expect(after).not.toBeNull();
    // 复活用掉了别的牌，【解封】还在手里
    expect(after!.G.players[viewer]!.hand).toContain('action_unlock');
    expect(apply(after!, viewer, 'playUnlock', ['action_unlock'])).toBeNull();
  });
});

describe('梦主的免费移动：界面推导与引擎一致', () => {
  it('第一次移动被接受；之后入口禁用（本回合已移动），引擎也拒绝第二次', () => {
    const { state, viewer } = sceneOf('master');
    expect(entriesFor(state, viewer)).toEqual([
      { kind: 'masterMove', enabled: true, reason: null },
    ]);
    const layer = state.G.players[viewer]!.currentLayer;
    const [to] = adjacentLayers(layer);
    const after = apply(state, viewer, 'dreamMasterMove', [to]);
    expect(after).not.toBeNull();
    expect(after!.G.players[viewer]!.currentLayer).toBe(to);
    const [entry] = entriesFor(after!, viewer);
    expect(entry).toMatchObject({ kind: 'masterMove', enabled: false });
    expect(entry!.reason).toEqual({ key: 'entries.move.reason.used' });
    expect(apply(after!, viewer, 'dreamMasterMove', [layer])).toBeNull();
  });

  it('界面只给相邻层，引擎对非相邻层也拒绝', () => {
    const { state, viewer } = sceneOf('master');
    const layer = state.G.players[viewer]!.currentLayer;
    const far = [1, 2, 3, 4].find((l) => Math.abs(l - layer) > 1)!;
    expect(adjacentLayers(layer)).not.toContain(far);
    expect(apply(state, viewer, 'dreamMasterMove', [far])).toBeNull();
  });
});

describe('梦主的梦境窥视效果②：从出牌到确认查看的整条链路', () => {
  it('打出 → 选持有贿赂牌的盗梦者 → 梦主看到他的贿赂牌 → peekerAcknowledge 清掉', () => {
    const { state, viewer } = sceneOf('master-bribe');
    const view = viewMatch(game, state, viewer).G as MatchView;
    const holders = bribeHolderIds(view.bribePool);
    expect(holders).toHaveLength(1);

    const pending = pendingPlayFor('action_dream_peek', 'master')!;
    expect(pending.move).toBe('playPeekMaster');
    const args = buildPlayArgs(pending, holders[0]);
    expect(args).toEqual(['action_dream_peek', holders[0]]);

    const played = apply(state, viewer, pending.move, args);
    expect(played).not.toBeNull();

    // 查看弹窗的数据来自引擎过滤后的视图：梦主此刻看得到被查看者持有的贿赂牌的成败
    const after = viewMatch(game, played!, viewer).G as MatchView;
    const inspect = computeMasterBribeInspectState(after, viewer);
    expect(inspect.visible).toBe(true);
    expect(inspect.targetThiefID).toBe(holders[0]);
    expect(inspect.bribes).toHaveLength(1);
    expect(inspect.bribes[0]!.kind).not.toBeNull();

    // 确认查看完毕：弹窗里的按钮发 peekerAcknowledge
    const acked = apply(played!, viewer, 'peekerAcknowledge', []);
    expect(acked).not.toBeNull();
    expect(acked!.G.peekReveal).toBeNull();
  });

  it('没有人持有贿赂牌：界面不让打，引擎也拒绝任何目标', () => {
    const { state, viewer } = sceneOf('master');
    const other = Object.keys(state.G.players).find((id) => id !== viewer)!;
    expect(apply(state, viewer, 'playPeekMaster', ['action_dream_peek', other])).toBeNull();
  });
});

describe('界面可点但必被拒的出牌', () => {
  it('梦主出【解封】：引擎拒绝（界面标为不可打）', () => {
    const { state, viewer } = sceneOf('master');
    expect(apply(state, viewer, 'playUnlock', ['action_unlock'])).toBeNull();
  });
});

describe('黑天鹅·纷飞：界面拼的分发表引擎接受', () => {
  /** 界面上的操作：选接收者、逐张点牌，直到全部分完 */
  function distributeLikeUi(state: MatchState<SetupState>, seat: string) {
    const G = viewMatch(game, state, seat).G as MatchView;
    const hand = G.players[seat]!.hand ?? [];
    const recipients = tourRecipientIds(G.players, seat, G.dreamMasterID);
    let ui = EMPTY_TOUR;
    hand.forEach((_, i) => {
      // 手牌轮流分给各接收者
      ui = pickTourRecipient(ui, recipients[i % recipients.length]!);
      ui = tapTourCard(ui, i, hand.length);
    });
    return { hand, recipients, assigned: ui.assigned, G };
  }

  it('抽牌阶段：手牌分完后引擎接受，接收者收到牌，本人再抽 4 张', () => {
    const { state, viewer } = sceneOf('skill-black-swan');
    const { hand, recipients, assigned } = distributeLikeUi(state, viewer);
    expect(canConfirmTour(assigned, hand.length, recipients)).toBe(true);
    const dist = buildDistribution(hand, assigned);
    const before = Object.fromEntries(
      recipients.map((id) => [id, state.G.players[id]!.hand.length]),
    );
    const after = apply(state, viewer, 'playBlackSwanTour', [dist]);
    expect(after).not.toBeNull();
    for (const id of recipients) {
      expect(after!.G.players[id]!.hand).toHaveLength(before[id]! + (dist[id]?.length ?? 0));
    }
    expect(after!.G.players[viewer]!.hand).toHaveLength(4);
    expect(after!.G.players[viewer]!.skillUsedThisTurn[BLACK_SWAN_SKILL_KEY]).toBe(1);
  });

  it('没分完 / 分给自己 / 分给梦主 / 分给迷失层的人：界面不让确认，引擎也拒绝', () => {
    const { state, viewer } = sceneOf('skill-black-swan');
    const { hand, recipients, G } = distributeLikeUi(state, viewer);
    const first = recipients[0]!;
    const partial = buildDistribution(
      hand,
      hand.map((_, i) => (i === 0 ? first : null)),
    );
    expect(
      canConfirmTour(
        hand.map((_, i) => (i === 0 ? first : null)),
        hand.length,
        recipients,
      ),
    ).toBe(false);
    expect(apply(state, viewer, 'playBlackSwanTour', [partial])).toBeNull();
    for (const bad of [viewer, G.dreamMasterID]) {
      expect(recipients).not.toContain(bad);
      expect(apply(state, viewer, 'playBlackSwanTour', [{ [bad]: hand }])).toBeNull();
    }
    // 接收者已在迷失层：界面不列，引擎也拒绝
    const dead = sceneOf('skill-luna');
    const deadId = Object.keys(dead.state.G.players).find(
      (id) => !dead.state.G.players[id]!.isAlive,
    )!;
    const swan = { ...dead.state, G: { ...dead.state.G, turnPhase: 'draw' as const } };
    const swanG = {
      ...swan,
      G: {
        ...swan.G,
        players: {
          ...swan.G.players,
          [dead.viewer]: {
            ...swan.G.players[dead.viewer]!,
            characterId: 'thief_black_swan' as never,
          },
        },
      },
    };
    const view = viewMatch(game, swanG, dead.viewer).G as MatchView;
    expect(tourRecipientIds(view.players, dead.viewer, view.dreamMasterID)).not.toContain(deadId);
    expect(
      apply(swanG, dead.viewer, 'playBlackSwanTour', [
        { [deadId]: swanG.G.players[dead.viewer]!.hand },
      ]),
    ).toBeNull();
  });

  it('本回合已发动：入口禁用（回合限一次），引擎也拒绝', () => {
    const { state, viewer } = sceneOf('skill-black-swan');
    const used = {
      ...state,
      G: {
        ...state.G,
        players: {
          ...state.G.players,
          [viewer]: {
            ...state.G.players[viewer]!,
            skillUsedThisTurn: { [BLACK_SWAN_SKILL_KEY]: 1 },
          },
        },
      },
    };
    const entry = entriesFor(used, viewer).find((e) => e.kind === 'blackSwanTour')!;
    expect(entry).toMatchObject({ enabled: false });
    expect(entry.reason).toEqual({ key: 'entries.reason.tourUsed' });
    const { hand, assigned } = distributeLikeUi(used, viewer);
    expect(
      apply(used, viewer, 'playBlackSwanTour', [buildDistribution(hand, assigned)]),
    ).toBeNull();
  });

  it('没有手牌：入口禁用，引擎也拒绝', () => {
    const { state, viewer } = sceneOf('skill-black-swan');
    const empty = {
      ...state,
      G: {
        ...state.G,
        players: { ...state.G.players, [viewer]: { ...state.G.players[viewer]!, hand: [] } },
      },
    };
    const entry = entriesFor(empty, viewer).find((e) => e.kind === 'blackSwanTour')!;
    expect(entry.reason).toEqual({ key: 'entries.reason.tourNoHand' });
    expect(apply(empty, viewer, 'playBlackSwanTour', [{}])).toBeNull();
  });
});

describe('黑洞·吞噬：界面入口与应答经真实引擎', () => {
  it('抽牌阶段入口可用时，不带实参的发动被引擎接受，同层有手牌的人进入等待名单', () => {
    const { state, viewer } = sceneOf('skill-black-hole-draw');
    const entry = entriesFor(state, viewer).find((e) => e.kind === 'blackHoleLevy')!;
    expect(entry).toMatchObject({ enabled: true, reason: null });
    const started = apply(state, viewer, 'playBlackHoleLevy', [])!;
    expect(started).not.toBeNull();
    const waiting = started.G.pendingBlackHoleLevy!.waiting;
    expect(waiting.length).toBeGreaterThan(0);
    for (const id of waiting) {
      expect(started.G.players[id]!.currentLayer).toBe(state.G.players[viewer]!.currentLayer);
      expect(started.G.players[id]!.hand.length).toBeGreaterThan(0);
    }
    expect(started.G.players[viewer]!.skillUsedThisTurn[BLACK_HOLE_LEVY_SKILL_KEY]).toBe(1);
  });

  it('同层没有人有手牌：入口禁用并说明，引擎也拒绝', () => {
    const { state, viewer } = sceneOf('skill-black-hole-draw');
    const mates = state.G.playerOrder.filter(
      (id) =>
        id !== viewer &&
        state.G.players[id]!.currentLayer === state.G.players[viewer]!.currentLayer,
    );
    const players = { ...state.G.players };
    for (const id of mates) players[id] = { ...players[id]!, hand: [] };
    const empty = { ...state, G: { ...state.G, players } };
    const entry = entriesFor(empty, viewer).find((e) => e.kind === 'blackHoleLevy')!;
    expect(entry).toMatchObject({ enabled: false });
    expect(entry.reason).toEqual({ key: 'entries.reason.levyNoGiver' });
    expect(apply(empty, viewer, 'playBlackHoleLevy', [])).toBeNull();
  });

  it('本回合已发动：入口禁用，引擎也拒绝', () => {
    const { state, viewer } = sceneOf('skill-black-hole-draw');
    const used = {
      ...state,
      G: {
        ...state.G,
        players: {
          ...state.G.players,
          [viewer]: {
            ...state.G.players[viewer]!,
            skillUsedThisTurn: { [BLACK_HOLE_LEVY_SKILL_KEY]: 1 },
          },
        },
      },
    };
    const entry = entriesFor(used, viewer).find((e) => e.kind === 'blackHoleLevy')!;
    expect(entry.reason).toEqual({ key: 'entries.reason.levyUsed' });
    expect(apply(used, viewer, 'playBlackHoleLevy', [])).toBeNull();
  });

  it('界面构造的交牌命令引擎接受：名单交齐后抽牌阶段结束', () => {
    let { state } = sceneOf('thief-pending-levy');
    const levy = state.G.pendingBlackHoleLevy!;
    for (const seat of [...levy.waiting]) {
      const view = viewMatch(game, state, seat).G as MatchView;
      const awaited = awaitedResponse(view, seat);
      expect(awaited).toMatchObject({ mine: true, kind: 'levy' });
      const cmd = sheetCommand(awaited as MineAwaited, 'levy-give', {
        ...EMPTY_DRAFT,
        giveIndex: 0,
      })!;
      const next = apply(state, seat, cmd.move, [...cmd.args]);
      expect(next, seat).not.toBeNull();
      state = next!;
    }
    expect(state.G.pendingBlackHoleLevy ?? null).toBeNull();
    expect(state.G.turnPhase).toBe('action');
  });
});

describe('雅典娜·急智：界面构造的应答经真实引擎', () => {
  it('选弃牌堆里的牌：引擎接受，牌入手后那张 KICK 照常结算', () => {
    const { state, viewer } = sceneOf('thief-pending-athena');
    const view = viewMatch(game, state, viewer).G as MatchView;
    const awaited = awaitedResponse(view, viewer) as MineAwaited;
    expect(awaited.kind).toBe('athena');
    const pick = awaited.kind === 'athena' ? awaited.discard[1]! : '';
    const cmd = sheetCommand(awaited, 'athena-pick', { ...EMPTY_DRAFT, athenaCard: pick })!;
    const wit = state.G.pendingAthenaWit!;
    const handBefore = state.G.players[viewer]!.hand.length;
    const next = apply(state, viewer, cmd.move, [...cmd.args])!;
    expect(next).not.toBeNull();
    expect(next.G.players[viewer]!.hand.length).toBe(handBefore + 1);
    expect(next.G.pendingAthenaWit ?? null).toBeNull();
    // KICK 已结算：出牌者的 KICK 进了弃牌堆
    expect(next.G.players[wit.userID]!.hand).not.toContain('action_kick');
  });

  it('放弃：界面按钮发 respondAthenaWit null，引擎接受', () => {
    const { state, viewer } = sceneOf('thief-pending-athena');
    const view = viewMatch(game, state, viewer).G as MatchView;
    const awaited = awaitedResponse(view, viewer) as MineAwaited;
    const pass = awaitedActions(awaited).find((a) => a.id === 'pass')!;
    expect(pass.effect.type).toBe('move');
    if (pass.effect.type !== 'move') return;
    const next = apply(state, viewer, pass.effect.move, [...pass.effect.args]);
    expect(next).not.toBeNull();
    expect(next!.G.pendingAthenaWit ?? null).toBeNull();
  });
});

describe('土星·律令：界面构造的应答经真实引擎', () => {
  it('选同名手牌抵消：引擎接受，被打出的 KICK 作废、梦主弃 1 抽 1', () => {
    const { state, viewer } = sceneOf('master-pending-saturn');
    const view = viewMatch(game, state, viewer).G as MatchView;
    const awaited = awaitedResponse(view, viewer) as MineAwaited;
    expect(awaited.kind).toBe('saturn');
    const index = awaited.kind === 'saturn' ? awaited.matches[0]! : -1;
    const cmd = sheetCommand(awaited, 'saturn-pick', { ...EMPTY_DRAFT, saturnIndex: index })!;
    const decree = state.G.pendingSaturnDecree!;
    const handBefore = state.G.players[viewer]!.hand.length;
    const next = apply(state, viewer, cmd.move, [...cmd.args])!;
    expect(next).not.toBeNull();
    expect(next.G.pendingSaturnDecree ?? null).toBeNull();
    // 弃 1 张、抽 1 张：张数不变，且 KICK 少了一张
    expect(next.G.players[viewer]!.hand.length).toBe(handBefore);
    expect(next.G.players[viewer]!.hand.filter((c) => c === 'action_kick')).toHaveLength(
      state.G.players[viewer]!.hand.filter((c) => c === 'action_kick').length - 1,
    );
    // 被抵消的 KICK 离开出牌者手牌、没有结算（出牌者层数不变）
    expect(next.G.players[decree.userID]!.hand).not.toContain('action_kick');
    expect(next.G.players[decree.userID]!.currentLayer).toBe(
      state.G.players[decree.userID]!.currentLayer,
    );
  });

  it('不抵消：界面按钮发 respondSaturnDecree null，引擎接受，那张 KICK 照常结算', () => {
    const { state, viewer } = sceneOf('master-pending-saturn');
    const view = viewMatch(game, state, viewer).G as MatchView;
    const awaited = awaitedResponse(view, viewer) as MineAwaited;
    const pass = awaitedActions(awaited).find((a) => a.id === 'pass')!;
    expect(pass.effect.type).toBe('move');
    if (pass.effect.type !== 'move') return;
    const decree = state.G.pendingSaturnDecree!;
    const next = apply(state, viewer, pass.effect.move, [...pass.effect.args])!;
    expect(next).not.toBeNull();
    expect(next.G.pendingSaturnDecree ?? null).toBeNull();
    expect(next.G.deck.discardPile).toContain('action_kick');
    expect(next.G.players[decree.userID]!.hand).not.toContain('action_kick');
  });

  it('没有同名牌：界面不给抵消，引擎也拒绝用别的牌抵消；只能不抵消', () => {
    const { state, viewer } = sceneOf('master-pending-saturn-nomatch');
    const view = viewMatch(game, state, viewer).G as MatchView;
    const awaited = awaitedResponse(view, viewer) as MineAwaited;
    expect(awaitedActions(awaited)[0]!.disabled).toBe(true);
    for (const card of state.G.players[viewer]!.hand) {
      expect(apply(state, viewer, 'respondSaturnDecree', [card]), card).toBeNull();
    }
    expect(apply(state, viewer, 'respondSaturnDecree', [null])).not.toBeNull();
  });
});

describe('达尔文·淘汰：界面构造的放回命令经真实引擎', () => {
  it('选刚好 2 张（可含新抽的）按顺序放回：引擎接受，牌库顶就是选的顺序', () => {
    const { state, viewer } = sceneOf('thief-pending-darwin');
    const view = viewMatch(game, state, viewer).G as MatchView;
    const awaited = awaitedResponse(view, viewer) as MineAwaited;
    const hand = awaited.kind === 'darwin' ? awaited.hand : [];
    // 最后两张是刚抽到的
    const cmd = sheetCommand(awaited, 'darwin-return', {
      ...EMPTY_DRAFT,
      returnPicks: [hand.length - 1, 0],
    })!;
    const next = apply(state, viewer, cmd.move, [...cmd.args])!;
    expect(next).not.toBeNull();
    expect(next.G.deck.cards.slice(0, 2)).toEqual([hand[hand.length - 1], hand[0]]);
    expect(next.G.players[viewer]!.hand).toHaveLength(hand.length - 2);
  });
});
