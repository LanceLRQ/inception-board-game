// 土星·领地 · 律令（dm_saturn_territory.skill_0）：梦主可以弃掉 1 张手牌抵消 1 张同名牌的效果，并从牌库顶抽 1 张牌。
// 对照：docs/manual/06-dream-master.md:168-173 土星·领地
//   技能：「律令 - 你可以弃掉1张手牌抵消1张同名牌的效果，并从牌库顶抽1张牌。」
//   详述：「【律令】是先抵消了同名牌效果，然后再抽牌。」
//        「【死亡宣言】可以被抵消然后该梦主抽1张牌，但对方使用的【死亡宣言】不会因此而弃掉。」
// 同名牌：docs/manual/04-action-cards.md:165 「【SHOOT·梦境穿梭剂】视为一张【SHOOT】的同名牌，同时也视为一张【梦境穿梭剂】的同名牌」
//
// 口径（项目负责人确认）：梦主是土星时，别的玩家在出牌阶段每打出一张行动牌都开一个应答窗口问梦主，
// 不论梦主手里有没有同名牌；梦主自己的牌不开窗口；技能「视为」的牌不开窗口；不限次数。
// 全部经对局运行器驱动真实 move。

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import { listAwaiting } from './engine/actionRights.js';
import { viewFor } from './engine/matchView.js';
import { checkInvariants } from './invariants.js';
import { applyMove, eventsFor, type MatchState } from './runner/matchRunner.js';
import type { SetupState } from './setup.js';
import { SATURN_DECREE_TRIGGER_MOVES } from './engine/saturnDecree.js';
import { PLAY_MOVE_CARD_IDS } from './engine/playCardKinds.js';
import { fixedRandom, game, load, scene, withPlayer } from './testing/runnerHarness.js';

const c = (id: string) => id as CardID;
const KICK = c('action_kick');
const SHOOT = c('action_shoot');
const SHOOT_DT = c('action_shoot_dream_transit');
const TRANSIT = c('action_dream_transit');
const UNLOCK = c('action_unlock');
const GRAFT = c('action_graft');
const PEEK = c('action_dream_peek');
const CREATION = c('action_creation');
const STORM = c('action_time_storm');
const DECREE = c('action_death_decree_3');
const SATURN = c('dm_saturn_territory');

/**
 * p1 是回合主人（盗梦者，出牌阶段）；p2、p3 同在第 1 层；p4 在第 2 层；
 * pM 是土星·领地，在第 1 层，手牌 [KICK, SHOOT_DT]。
 * 牌库用互不相同的牌铺开，抽到的是哪一张一目了然。
 */
const DECK_TOP = [PEEK, GRAFT, CREATION, TRANSIT];
function saturnScene(extra: Partial<SetupState> = {}, masterHand: CardID[] = [KICK, SHOOT_DT]) {
  const G = scene(
    {
      p1: { layer: 1, hand: [KICK, SHOOT, UNLOCK, STORM, CREATION, SHOOT_DT, TRANSIT, DECREE] },
      p2: { layer: 1, hand: [PEEK] },
      p3: { layer: 1, hand: [UNLOCK] },
      p4: { layer: 2, hand: [PEEK] },
      pM: { layer: 1, hand: masterHand },
    },
    {
      turnPhase: 'action',
      currentPlayerID: 'p1',
      deck: {
        cards: [...DECK_TOP, ...Array<CardID>(30).fill(c('action_telekinesis'))],
        discardPile: [],
      },
      ...extra,
    },
  );
  return withPlayer(G, 'pM', { characterId: SATURN });
}

function run(
  state: MatchState<SetupState>,
  playerID: string,
  move: string,
  args: unknown[] = [],
  roll = 3,
) {
  return applyMove(game, state, { playerID, move, args }, { random: fixedRandom(roll) });
}

function mustRun(
  state: MatchState<SetupState>,
  playerID: string,
  move: string,
  args: unknown[] = [],
  roll = 3,
) {
  const res = run(state, playerID, move, args, roll);
  if (!res.ok) throw new Error(`${move} by ${playerID} 被拒绝：${res.reason}`);
  return res;
}

/** p1 打出 KICK 对 p3，挂起梦主的律令应答 */
function kickWindow(extra: Partial<SetupState> = {}, masterHand?: CardID[]) {
  return mustRun(load(saturnScene(extra, masterHand)), 'p1', 'playKick', [KICK, 'p3']);
}

describe('土星·律令 · 开窗口的条件', () => {
  it('梦主是土星：别人打出行动牌先不结算，挂起梦主的应答；牌仍在出牌者手里，弃牌堆与出牌记录不变', () => {
    const before = load(saturnScene());
    const res = kickWindow();
    const G = res.state.G;
    expect(G.pendingSaturnDecree).toMatchObject({ masterID: 'pM', userID: 'p1', cardId: KICK });
    expect(G.players.p1!.hand).toEqual(before.G.players.p1!.hand);
    expect(G.players.p1!.currentLayer).toBe(1);
    expect(G.deck.discardPile).toEqual([]);
    expect(G.playedCardsThisTurn).toEqual([]);
    expect(listAwaiting(G)).toContainEqual({
      field: 'pendingSaturnDecree',
      actors: ['pM'],
      moves: ['respondSaturnDecree'],
      blocking: true,
    });
    expect(checkInvariants(G)).toEqual([]);
  });

  it('梦主不是土星：不开窗口，照常结算（轨迹不变）', () => {
    const G = withPlayer(saturnScene(), 'pM', { characterId: c('dm_fortress') });
    const res = mustRun(load(G), 'p1', 'playKick', [KICK, 'p3']);
    expect(res.state.G.pendingSaturnDecree ?? null).toBeNull();
    expect(res.state.G.deck.discardPile).toEqual([KICK]);
    expect(res.state.G.players.p1!.currentLayer).toBe(1);
  });

  it('梦主自己出牌不开窗口', () => {
    const G = saturnScene({ currentPlayerID: 'pM' });
    const res = mustRun(load(G), 'pM', 'playKick', [KICK, 'p3']);
    expect(res.state.G.pendingSaturnDecree ?? null).toBeNull();
    expect(res.state.G.deck.discardPile).toContain(KICK);
  });

  it('梦主手里没有同名牌也照样开窗口（窗口的有无不泄露手牌）', () => {
    const withSame = kickWindow({}, [KICK]).state.G.pendingSaturnDecree;
    const without = kickWindow({}, [CREATION, GRAFT]).state.G.pendingSaturnDecree;
    const empty = kickWindow({}, []).state.G.pendingSaturnDecree;
    expect(withSame).toMatchObject({ masterID: 'pM', cardId: KICK });
    expect(without).toMatchObject({ masterID: 'pM', cardId: KICK });
    expect(empty).toMatchObject({ masterID: 'pM', cardId: KICK });
  });

  it('梦主已死亡：不开窗口', () => {
    const G = withPlayer(saturnScene(), 'pM', { isAlive: false });
    const res = mustRun(load(G), 'p1', 'playKick', [KICK, 'p3']);
    expect(res.state.G.pendingSaturnDecree ?? null).toBeNull();
  });

  it('出牌本身不合法（牌不在手里）：直接被拒绝，不会先挂起再卡住', () => {
    const s = load(saturnScene());
    const res = run(s, 'p1', 'playKick', [GRAFT, 'p3']);
    expect(res.ok).toBe(false);
    expect(res.state).toBe(s);
  });

  it('覆盖的出牌 move 就是出牌记录表里的 move，且都真实存在于对局定义里', () => {
    const moves = Object.keys(game.phases.playing!.moves!);
    for (const name of SATURN_DECREE_TRIGGER_MOVES) {
      expect(moves, name).toContain(name);
      expect(Object.keys(PLAY_MOVE_CARD_IDS), name).toContain(name);
    }
    expect([...SATURN_DECREE_TRIGGER_MOVES].sort()).toEqual(Object.keys(PLAY_MOVE_CARD_IDS).sort());
  });

  it('各种出牌 move 都会开窗口：SHOOT 类、解封、梦境穿梭剂、梦境窥视、凭空造物、时间风暴', () => {
    for (const [move, args, card] of [
      ['playShoot', ['p3', SHOOT], SHOOT],
      ['playShootDreamTransit', [SHOOT_DT, 'shoot', 'p3'], SHOOT_DT],
      ['playShootDreamTransit', [SHOOT_DT, 'transit', 2], SHOOT_DT],
      ['playUnlock', [UNLOCK], UNLOCK],
      ['playDreamTransit', [TRANSIT, 2], TRANSIT],
      ['playCreation', [CREATION], CREATION],
      ['playTimeStorm', [STORM], STORM],
      ['playPeek', [c('action_dream_peek'), 1], c('action_dream_peek')],
    ] as const) {
      const G = withPlayer(saturnScene(), 'p1', {
        hand: [card, c('action_dream_peek')],
      });
      const res = mustRun(load(G), 'p1', move, [...args]);
      expect(res.state.G.pendingSaturnDecree, move).toMatchObject({ userID: 'p1', cardId: card });
    }
  });

  it('技能「视为」的牌和不经出牌 move 的路径不开窗口', () => {
    for (const name of [
      'playHaleyImpact',
      'useFortressColdness',
      'useImperialCityWorldShoot',
      'playGreenRayArrest',
      'playShootSudger',
      'respondCancelUnlock',
    ]) {
      expect(SATURN_DECREE_TRIGGER_MOVES, name).not.toContain(name);
    }
  });

  it('意念判官·定罪不经出牌 move 表：按最窄读法不开窗口，照常结算（歧义点，见汇报）', () => {
    const G = withPlayer(saturnScene(), 'p1', { characterId: c('thief_sudger_of_mind') });
    const res = mustRun(load(G), 'p1', 'playShootSudger', ['p3', SHOOT]);
    expect(res.state.G.pendingSaturnDecree ?? null).toBeNull();
  });

  it('回合外打出的牌（别人解封时抵消用的另一张解封）不开窗口', () => {
    const unlockWindow = mustRun(load(saturnScene()), 'p1', 'playUnlock', [UNLOCK]).state;
    const passed = mustRun(unlockWindow, 'pM', 'respondSaturnDecree', [null]).state;
    expect(passed.G.pendingUnlock).toMatchObject({ playerID: 'p1' });
    expect(passed.G.pendingResponseWindow).not.toBeNull();
    const cancelled = mustRun(passed, 'p3', 'respondCancelUnlock');
    expect(cancelled.state.G.pendingSaturnDecree ?? null).toBeNull();
    expect(cancelled.state.G.pendingUnlock ?? null).toBeNull();
  });
});

describe('土星·律令 · 同名牌的口径', () => {
  /** p1 打出 played，梦主手里是 held：能不能抵消 */
  function canCounter(
    played: 'shoot' | 'shoot_dt_shoot' | 'shoot_dt_transit' | 'transit',
    held: CardID,
  ) {
    const play = {
      shoot: ['playShoot', ['p3', SHOOT]],
      shoot_dt_shoot: ['playShootDreamTransit', [SHOOT_DT, 'shoot', 'p3']],
      shoot_dt_transit: ['playShootDreamTransit', [SHOOT_DT, 'transit', 2]],
      transit: ['playDreamTransit', [TRANSIT, 2]],
    }[played] as [string, unknown[]];
    const pending = mustRun(load(saturnScene({}, [held])), 'p1', play[0], play[1]).state;
    return run(pending, 'pM', 'respondSaturnDecree', [held]).ok;
  }

  it('普通 SHOOT 与 SHOOT·梦境穿梭剂互为同名', () => {
    expect(canCounter('shoot', SHOOT_DT)).toBe(true);
    expect(canCounter('shoot_dt_shoot', SHOOT)).toBe(true);
    expect(canCounter('shoot_dt_transit', SHOOT)).toBe(true);
  });

  it('SHOOT·梦境穿梭剂也是梦境穿梭剂的同名牌', () => {
    expect(canCounter('transit', SHOOT_DT)).toBe(true);
    expect(canCounter('shoot_dt_shoot', TRANSIT)).toBe(true);
  });

  it('同一种牌当然同名', () => {
    expect(canCounter('shoot', SHOOT)).toBe(true);
    expect(canCounter('transit', TRANSIT)).toBe(true);
  });

  it('SHOOT 与梦境穿梭剂本身不同名（同名关系不传递）', () => {
    expect(canCounter('shoot', TRANSIT)).toBe(false);
    expect(canCounter('transit', SHOOT)).toBe(false);
  });

  it('特殊 SHOOT 各有各的名字，与普通 SHOOT 不同名', () => {
    expect(canCounter('shoot', c('action_shoot_assassin'))).toBe(false);
    expect(canCounter('shoot', c('action_shoot_burst'))).toBe(false);
  });
});

describe('土星·律令 · 应答', () => {
  it('抵消：弃 1 张同名手牌，被抵消的牌作废进弃牌堆、不结算，最后从牌库顶抽 1 张', () => {
    const pending = kickWindow().state;
    const res = mustRun(pending, 'pM', 'respondSaturnDecree', [KICK]);
    const G = res.state.G;
    expect(G.pendingSaturnDecree ?? null).toBeNull();
    // 梦主：弃掉 KICK，抽到牌库顶的 PEEK
    expect(G.players.pM!.hand).toEqual([SHOOT_DT, PEEK]);
    expect(G.deck.cards[0]).toBe(GRAFT);
    // 被抵消的 KICK 离开出牌者的手牌，进弃牌堆；KICK 的效果（交换层数）没有发生
    expect(G.players.p1!.hand).not.toContain(KICK);
    expect(G.players.p3!.currentLayer).toBe(1);
    expect(G.deck.discardPile).toEqual([KICK, KICK]);
    // 算打出过
    expect(G.playedCardsThisTurn).toEqual([KICK]);
    expect(G.lastPlayedCardThisTurn).toBe(KICK);
    // 仍是出牌者的回合，出牌阶段继续
    expect(res.state.ctx.currentPlayer).toBe('p1');
    expect(G.turnPhase).toBe('action');
    expect(checkInvariants(G)).toEqual([]);
  });

  it('放过：被打出的牌照常结算，与不开窗口时的结果一致（含随机结果）', () => {
    const plain = withPlayer(saturnScene(), 'pM', { characterId: c('dm_fortress') });
    const direct = mustRun(load(plain), 'p1', 'playShoot', ['p3', SHOOT], 4).state.G;
    const pending = mustRun(load(saturnScene()), 'p1', 'playShoot', ['p3', SHOOT], 4).state;
    const passed = mustRun(pending, 'pM', 'respondSaturnDecree', [null], 4).state.G;
    expect(passed.pendingSaturnDecree ?? null).toBeNull();
    expect(passed.players.p3).toEqual(direct.players.p3);
    expect(passed.players.p1).toEqual(direct.players.p1);
    expect(passed.deck.discardPile).toEqual(direct.deck.discardPile);
    expect(passed.lastShootRoll).toBe(direct.lastShootRoll);
    expect(passed.playedCardsThisTurn).toEqual(direct.playedCardsThisTurn);
  });

  it('梦主没有同名牌：选任何牌都被拒绝，只能放过', () => {
    const pending = kickWindow({}, [CREATION, SHOOT]).state;
    for (const pick of [CREATION, SHOOT, KICK, c('no_such_card')]) {
      const res = run(pending, 'pM', 'respondSaturnDecree', [pick]);
      expect(res.ok, String(pick)).toBe(false);
      expect(res.state).toBe(pending);
    }
    const passed = mustRun(pending, 'pM', 'respondSaturnDecree', [null]);
    expect(passed.state.G.deck.discardPile).toEqual([KICK]);
  });

  it('不同名的牌不能用来抵消（被拒绝，仍然挂起）', () => {
    const pending = kickWindow({}, [UNLOCK, KICK]).state;
    const res = run(pending, 'pM', 'respondSaturnDecree', [UNLOCK]);
    expect(res.ok).toBe(false);
    expect(res.state).toBe(pending);
  });

  it('参数形状不对（缺参数、数组、数字）被拒绝', () => {
    const pending = kickWindow().state;
    expect(run(pending, 'pM', 'respondSaturnDecree').ok).toBe(false);
    expect(run(pending, 'pM', 'respondSaturnDecree', [[KICK]]).ok).toBe(false);
    expect(run(pending, 'pM', 'respondSaturnDecree', [5]).ok).toBe(false);
  });

  it('只有梦主能应答：出牌者与其他座位都被拒绝，状态不变', () => {
    const pending = kickWindow().state;
    for (const who of ['p1', 'p2', 'p3', 'p4']) {
      for (const args of [[KICK], [null]]) {
        const res = run(pending, who, 'respondSaturnDecree', args);
        expect(res.ok, who).toBe(false);
        if (!res.ok) expect(res.reason).toBe('not_active');
        expect(res.state).toBe(pending);
      }
    }
  });

  it('没有挂起时任何人（含梦主）发应答都被拒绝，拒绝理由一致', () => {
    const s = load(saturnScene());
    const reasons = new Set<string>();
    for (const who of ['p1', 'p2', 'pM']) {
      const res = run(s, who, 'respondSaturnDecree', [null]);
      expect(res.ok, who).toBe(false);
      if (!res.ok) reasons.add(res.reason);
    }
    expect(reasons.size).toBe(1);
  });

  it('挂起期间其他 move 都被挡住：出牌者不能改出别的牌 / 结束阶段，梦主不能出牌', () => {
    const pending = kickWindow().state;
    for (const [who, move, args] of [
      ['p1', 'playKick', [KICK, 'p2']],
      ['p1', 'playCreation', [CREATION]],
      ['p1', 'endActionPhase', []],
      ['pM', 'playKick', [KICK, 'p2']],
      ['pM', 'endActionPhase', []],
      ['p3', 'endActionPhase', []],
    ] as const) {
      const res = run(pending, who, move, [...args]);
      expect(res.ok, `${who} ${move}`).toBe(false);
      expect(res.state).toBe(pending);
    }
  });

  it('不限次数：同一回合里每打出一张牌都开一次窗口，抵消与放过可以交替', () => {
    let s = kickWindow({}, [KICK, KICK, CREATION]).state;
    s = mustRun(s, 'pM', 'respondSaturnDecree', [KICK]).state;
    // 第二张牌：打出 SHOOT，放过
    s = mustRun(s, 'p1', 'playShoot', ['p3', SHOOT]).state;
    expect(s.G.pendingSaturnDecree).toMatchObject({ cardId: SHOOT });
    s = mustRun(s, 'pM', 'respondSaturnDecree', [null]).state;
    // 第三张牌：再来一张 KICK，再抵消（梦主手里还剩一张 KICK）
    const withKick = load({
      ...s.G,
      players: {
        ...s.G.players,
        p1: { ...s.G.players.p1!, hand: [KICK, ...s.G.players.p1!.hand] },
      },
    });
    const third = mustRun(withKick, 'p1', 'playKick', [KICK, 'p3']).state;
    expect(third.G.pendingSaturnDecree).toMatchObject({ cardId: KICK });
    const done = mustRun(third, 'pM', 'respondSaturnDecree', [KICK]).state;
    expect(done.G.playedCardsThisTurn).toEqual([KICK, SHOOT, KICK]);
    expect(done.G.players.pM!.hand).not.toContain(KICK);
    expect(checkInvariants(done.G)).toEqual([]);
  });

  it('梦主手里有两张同名牌：只弃 1 张', () => {
    const pending = kickWindow({}, [KICK, KICK]).state;
    const G = mustRun(pending, 'pM', 'respondSaturnDecree', [KICK]).state.G;
    expect(G.players.pM!.hand).toEqual([KICK, PEEK]);
  });

  it('牌库被梦主弃出的时间风暴翻空：照样抵消，抽不到牌，对局按牌库耗尽结束', () => {
    const G = saturnScene({ deck: { cards: [PEEK, GRAFT, CREATION], discardPile: [] } }, [STORM]);
    const pending = mustRun(load(G), 'p1', 'playTimeStorm', [STORM]).state;
    const res = mustRun(pending, 'pM', 'respondSaturnDecree', [STORM]);
    expect(res.state.G.deck.cards).toEqual([]);
    expect(res.state.G.players.pM!.hand).toEqual([]);
    expect(res.state.G.pendingSaturnDecree ?? null).toBeNull();
    expect(res.state.ctx.gameover).toBeDefined();
    expect(checkInvariants(res.state.G)).toEqual([]);
  });
});

describe('土星·律令 · 被抵消的牌的后续', () => {
  it('解封被抵消：不进入解封响应窗口、不消耗本回合的解封次数，两张解封都进弃牌堆', () => {
    const G = saturnScene({}, [UNLOCK, KICK]);
    const pending = mustRun(load(G), 'p1', 'playUnlock', [UNLOCK]).state;
    expect(pending.G.pendingUnlock ?? null).toBeNull();
    expect(pending.G.pendingResponseWindow ?? null).toBeNull();
    const res = mustRun(pending, 'pM', 'respondSaturnDecree', [UNLOCK]).state.G;
    expect(res.pendingUnlock ?? null).toBeNull();
    expect(res.pendingResponseWindow ?? null).toBeNull();
    expect(res.unlockThisTurn).toBe(0);
    expect(res.players.p1!.successfulUnlocksThisTurn).toBe(0);
    expect(res.layers[1]!.heartLockValue).toBe(3);
    expect(res.deck.discardPile).toEqual([UNLOCK, UNLOCK]);
  });

  it('解封放过后才进入原来的解封响应窗口', () => {
    const pending = mustRun(load(saturnScene()), 'p1', 'playUnlock', [UNLOCK]).state;
    const res = mustRun(pending, 'pM', 'respondSaturnDecree', [null]).state.G;
    expect(res.pendingUnlock).toMatchObject({ playerID: 'p1', layer: 1 });
    expect(res.pendingResponseWindow?.responders).toContain('p3');
  });

  it('时间风暴对时间风暴：被抵消的那张不发生效果、留在弃牌堆；梦主弃的那张按从手牌弃掉触发，再抽牌', () => {
    const pending = mustRun(load(saturnScene({}, [STORM, CREATION])), 'p1', 'playTimeStorm', [
      STORM,
    ]).state;
    const res = mustRun(pending, 'pM', 'respondSaturnDecree', [STORM]).state.G;
    // 只有梦主弃掉的那张触发：翻 10 张、风暴移出游戏；出牌者的风暴没有生效，留在弃牌堆（可被技能重新拾取）
    expect(res.removedFromGame).toEqual([STORM]);
    expect(res.deck.discardPile.filter((x) => x === STORM)).toEqual([STORM]);
    const flipped = res.deck.discardPile.filter((x) => x !== STORM);
    expect(flipped).toHaveLength(10);
    expect(flipped.slice(0, 4)).toEqual(DECK_TOP);
    // 先弃牌（触发风暴）后抽牌：抽到的是被翻走的 10 张之后的第 1 张
    expect(res.players.pM!.hand).toEqual([CREATION, c('action_telekinesis')]);
    expect(checkInvariants(res)).toEqual([]);
  });

  it('死亡宣言随 SHOOT 展示：SHOOT 被抵消后宣言牌仍在出牌者手里（不会因此弃掉）', () => {
    const pending = mustRun(load(saturnScene({}, [SHOOT])), 'p1', 'playShoot', [
      'p3',
      SHOOT,
      DECREE,
    ]).state;
    const res = mustRun(pending, 'pM', 'respondSaturnDecree', [SHOOT]).state.G;
    expect(res.players.p1!.hand).toContain(DECREE);
    expect(res.players.p1!.hand).not.toContain(SHOOT);
    expect(res.lastShootRoll).toBeNull();
    expect(res.players.p3!.isAlive).toBe(true);
  });

  it('被抵消的牌记入本回合出牌记录（水瓶·凝聚等据此计数）', () => {
    const pending = kickWindow().state;
    const res = mustRun(pending, 'pM', 'respondSaturnDecree', [KICK]).state.G;
    expect(res.playedCardsThisTurn).toEqual([KICK]);
  });
});

describe('土星·律令 · 与雅典娜·急智、解封响应窗口的先后', () => {
  /** p2 是雅典娜；p1 对她打出 KICK；弃牌堆里有牌可选 */
  function athenaScene() {
    const G = withPlayer(saturnScene({}, [KICK]), 'p2', { characterId: c('thief_athena') });
    return { ...G, deck: { ...G.deck, discardPile: [GRAFT, UNLOCK] } };
  }

  it('同一张牌既触发律令又以雅典娜为目标：先问梦主，雅典娜的应答还没出现', () => {
    const res = mustRun(load(athenaScene()), 'p1', 'playKick', [KICK, 'p2']);
    expect(res.state.G.pendingSaturnDecree).toMatchObject({ cardId: KICK });
    expect(res.state.G.pendingAthenaWit ?? null).toBeNull();
  });

  it('梦主放过：再问雅典娜；雅典娜应答后牌照常结算', () => {
    const first = mustRun(load(athenaScene()), 'p1', 'playKick', [KICK, 'p2']).state;
    const second = mustRun(first, 'pM', 'respondSaturnDecree', [null]).state;
    expect(second.G.pendingSaturnDecree ?? null).toBeNull();
    expect(second.G.pendingAthenaWit).toMatchObject({ athenaID: 'p2', userID: 'p1', cardId: KICK });
    expect(second.G.deck.discardPile).toEqual([GRAFT, UNLOCK]);
    const done = mustRun(second, 'p2', 'respondAthenaWit', [GRAFT]).state.G;
    expect(done.players.p2!.hand).toContain(GRAFT);
    expect(done.deck.discardPile).toContain(KICK);
    expect(done.pendingSaturnDecree ?? null).toBeNull();
  });

  it('梦主抵消：不再问雅典娜，雅典娜的急智次数也没有消耗', () => {
    const first = mustRun(load(athenaScene()), 'p1', 'playKick', [KICK, 'p2']).state;
    const done = mustRun(first, 'pM', 'respondSaturnDecree', [KICK]).state;
    expect(done.G.pendingAthenaWit ?? null).toBeNull();
    expect(done.G.players.p2!.hand).toEqual([PEEK]);
    expect(done.G.deck.discardPile).toEqual([GRAFT, UNLOCK, KICK, KICK]);
    expect(done.G.players.p2!.skillUsedThisGame).toEqual(first.G.players.p2!.skillUsedThisGame);
  });
});

describe('土星·律令 · 信息隔离', () => {
  const options = { gameOver: false };

  it('挂起中：出牌者与牌是公开的，梦主是谁本来就公开；重放用的 move 名与实参不进视图', () => {
    const G = kickWindow().state.G;
    for (const viewer of ['p1', 'p2', 'p4', 'pM', null]) {
      const view = viewFor(G, viewer, options);
      expect(view.pendingSaturnDecree, String(viewer)).toEqual({
        masterID: 'pM',
        userID: 'p1',
        cardId: KICK,
      });
      const json = JSON.stringify(view);
      expect(json, String(viewer)).not.toContain('"args"');
      expect(json, String(viewer)).not.toContain('playKick');
    }
  });

  it('梦主的手牌在视图里照旧只有本人可见，窗口与否都一样', () => {
    const G = kickWindow().state.G;
    expect(viewFor(G, 'pM', options).players.pM!.hand).toEqual([KICK, SHOOT_DT]);
    for (const viewer of ['p1', 'p2', 'p4', null]) {
      const v = viewFor(G, viewer, options).players.pM!;
      expect(v.hand, String(viewer)).toBeNull();
      expect(v.handCount).toBe(2);
    }
  });

  it('挂起事件：等待清单公开、不带任何手牌信息；有没有同名牌看不出来', () => {
    const withSame = kickWindow({}, [KICK]);
    const without = kickWindow({}, [CREATION]);
    const strip = (ev: { kind: string; data: unknown }[]) =>
      ev.map((e) => ({ kind: e.kind, data: e.data }));
    expect(strip(eventsFor(withSame.events, 'p3'))).toEqual(strip(eventsFor(without.events, 'p3')));
    const await1 = withSame.events.find((e) => e.kind === 'awaiting_changed')!;
    expect(await1.data).toEqual({
      awaiting: [
        {
          field: 'pendingSaturnDecree',
          actors: ['pM'],
          moves: ['respondSaturnDecree'],
          blocking: true,
        },
      ],
    });
  });

  it('抵消的事件：打出的牌记在出牌者名下，抽到的牌只给梦主，弃掉的牌公开', () => {
    const pending = kickWindow().state;
    const res = mustRun(pending, 'pM', 'respondSaturnDecree', [KICK]);
    const played = res.events.filter((e) => e.kind === 'card_played');
    expect(played.map((e) => e.data)).toEqual([{ player: 'p1', card: KICK }]);
    const drawn = res.events.filter((e) => e.kind === 'cards_drawn');
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.data).toEqual({ player: 'pM', count: 1 });
    expect(drawn[0]!.secret).toEqual({ to: ['pM'], data: { cards: [PEEK] } });
    for (const viewer of ['p1', 'p2', 'p4', null]) {
      const seen = eventsFor(res.events, viewer).find((e) => e.kind === 'cards_drawn')!;
      expect(JSON.stringify(seen), String(viewer)).not.toContain(PEEK);
    }
    const discarded = res.events.find((e) => e.kind === 'cards_discarded')!;
    expect(discarded.data).toEqual({ count: 1, cards: [KICK] });
  });

  it('梦主弃掉的牌与抽到的牌同种时，抽牌事件也不丢', () => {
    const G = saturnScene({ deck: { cards: [KICK, GRAFT], discardPile: [] } }, [KICK]);
    const pending = mustRun(load(G), 'p1', 'playKick', [KICK, 'p3']).state;
    const res = mustRun(pending, 'pM', 'respondSaturnDecree', [KICK]);
    const drawn = res.events.filter((e) => e.kind === 'cards_drawn');
    expect(drawn.map((e) => e.data)).toEqual([{ player: 'pM', count: 1 }]);
  });
});
