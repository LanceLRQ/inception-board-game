// 对局视图的泄露扫描：逐个观察者，两种方法互相印证
//   1. 随机对局扫描：跑真实的随机对局，每隔几步对每个观察者取视图，检查常态下有没有漏
//   2. 结构性断言：对同一个状态把某个对该观察者保密的值改掉，视图序列化结果必须逐字节不变
//      （并且反向断言：该看到这个值的人，视图必须跟着变，证明测试不是恒真）

import { describe, it, expect } from 'vitest';
import type { CardID } from '@icgame/shared';
import { InceptionCityGame } from '../game.js';
import type { BribeSetup, PlayerSetup, SetupState } from '../setup.js';
import { applyMove, viewMatch, type GameDef, type MatchState } from '../runner/matchRunner.js';
import { makeTestRng, pickLegalMove } from '../runner/moveFuzzer.js';
import { buildViewScene, IMPERIAL_CITY, startedMatch } from '../testing/viewScene.js';
import { viewFor, type MatchView, type Viewer } from './matchView.js';

const game: GameDef<SetupState> = InceptionCityGame;

// ---------------------------------------------------------------------------
// 一、随机对局扫描
// ---------------------------------------------------------------------------

/** 独立于实现的「谁可以知道这张贿赂牌成败」判断，只用来核对视图 */
function mayKnowBribeKind(
  G: SetupState,
  viewer: Viewer,
  bribe: BribeSetup,
  gameOver: boolean,
): boolean {
  if (gameOver) return true;
  if (viewer === null) return false;
  if (bribe.status !== 'inPool' && bribe.heldBy === viewer) return true;
  const isImperial =
    viewer === G.dreamMasterID && G.players[viewer]?.characterId === 'dm_imperial_city';
  if (isImperial && bribe.status === 'inPool') return true;
  const peek = G.peekReveal;
  return (
    peek !== null &&
    peek.revealKind === 'bribe' &&
    viewer === G.dreamMasterID &&
    peek.peekerID === viewer &&
    bribe.heldBy === peek.targetThiefID
  );
}

/** 各类秘密实际被检查的次数，用来证明扫描没有空转 */
interface ScanCounts {
  otherHands: number;
  hiddenVaults: number;
  hiddenNightmares: number;
  poolBribes: number;
  dispatchedBribesOfOthers: number;
  unrevealedRoles: number;
  roleTextChecks: number;
}

const emptyCounts = (): ScanCounts => ({
  otherHands: 0,
  hiddenVaults: 0,
  hiddenNightmares: 0,
  poolBribes: 0,
  dispatchedBribesOfOthers: 0,
  unrevealedRoles: 0,
  roleTextChecks: 0,
});

function addCounts(into: ScanCounts, from: ScanCounts): void {
  for (const key of Object.keys(into) as (keyof ScanCounts)[]) into[key] += from[key];
}

/**
 * 随机对局里已派出的贿赂牌出现得不稳定、「有人在窥视」则几乎不出现，这里从真实对局状态出发做最小改动补出这类局面：
 * 把池里的两张牌（一成一败）派给两名盗梦者（成功的那张同时转阵营），并让第三名盗梦者窥视某一层金库。
 * 状态字段之间保持引擎真实派发后的一致关系（成功 deal / 失败 dealt，heldBy、bribeReceived、faction）。
 */
function withDispatchedBribes(G: SetupState): SetupState {
  const thieves = G.playerOrder.filter((id) => id !== G.dreamMasterID);
  if (thieves.length < 3) return G;
  const [x, y, z] = thieves as [string, string, string];
  const dealIdx = G.bribePool.findIndex((b) => b.status === 'inPool' && b.kind === 'deal');
  const failIdx = G.bribePool.findIndex((b) => b.status === 'inPool' && b.kind === 'fail');
  if (dealIdx < 0 || failIdx < 0) return G;
  return {
    ...G,
    bribePool: G.bribePool.map((bribe, i) => {
      if (i === dealIdx)
        return { ...bribe, status: 'deal' as const, heldBy: x, originalOwnerId: x };
      if (i === failIdx)
        return { ...bribe, status: 'dealt' as const, heldBy: y, originalOwnerId: y };
      return { ...bribe };
    }),
    players: {
      ...G.players,
      [x]: { ...G.players[x]!, faction: 'master', bribeReceived: G.players[x]!.bribeReceived + 1 },
      [y]: { ...G.players[y]!, bribeReceived: G.players[y]!.bribeReceived + 1 },
    },
    peekReveal: { peekerID: z, revealKind: 'vault', vaultLayer: 2 },
  };
}

/** 扫描一个时刻：每个观察者（每名玩家加旁观者）的视图 */
function scanMoment(
  def: GameDef<SetupState>,
  state: MatchState<SetupState>,
  seed: string,
  label: string,
): ScanCounts {
  const { G } = state;
  const gameOver = state.ctx.gameover !== undefined;
  const viewers: Viewer[] = [...G.playerOrder, null];
  const counts = emptyCounts();
  for (const viewer of viewers) {
    const at = `${label} 观察者=${viewer ?? '旁观者'}`;
    const out = viewMatch(def, state, viewer);
    expect(Object.keys(out).sort(), at).toEqual(['G', 'ctx', 'stateID']);
    const json = JSON.stringify(out);
    expect(json, `${at} 种子`).not.toContain(seed);
    expect(json, `${at} rngSeed`).not.toContain('rngSeed');
    expect(json, `${at} rngState`).not.toContain('rngState');

    const view = out.G as MatchView;
    // 牌库：视图里拿不到任何牌的列表
    expect(Object.keys(view.deck).sort(), `${at} 牌库`).toEqual(['cardCount', 'discardPile']);
    expect(view.deck.cardCount, at).toBe(G.deck.cards.length);

    for (const id of G.playerOrder) {
      const p = view.players[id]!;
      const real = G.players[id]!;
      const mine = id === viewer;
      // 别人手里的牌：不是数组
      if (!mine && !gameOver) {
        expect(Array.isArray(p.hand), `${at} 玩家${id}手牌`).toBe(false);
        expect(p.hand, at).toBeNull();
        counts.otherHands++;
      }
      expect(p.handCount, at).toBe(real.hand.length);
      // 非本人、未翻开：角色为空，阵营是盗梦者——即使真实阵营已经因为贿赂变成梦主
      if (!mine && !real.isRevealed && !gameOver) {
        expect(p.characterId, `${at} 玩家${id}角色`).toBeNull();
        expect(p.faction, `${at} 玩家${id}阵营`).toBe('thief');
        expect(p.skillUsedThisGame, at).toBeNull();
        expect(p.skillUsedThisTurn, at).toBeNull();
        counts.unrevealedRoles++;
      }
    }

    // 金库：非梦主观察者看不到没打开、也没在看的金库的内容
    const peek = G.peekReveal;
    for (let i = 0; i < G.vaults.length; i++) {
      const real = G.vaults[i]!;
      const seen = view.vaults[i]!;
      const peeking =
        viewer !== null &&
        peek !== null &&
        peek.revealKind === 'vault' &&
        peek.peekerID === viewer &&
        peek.vaultLayer === real.layer;
      const allowed = gameOver || real.isOpened || viewer === G.dreamMasterID || peeking;
      if (!allowed) {
        expect(seen.contentType, `${at} 金库${real.id}`).toBeNull();
        expect(seen.contentType).not.toBe(real.contentType);
        counts.hiddenVaults++;
      } else {
        expect(seen.contentType, `${at} 金库${real.id}`).toBe(real.contentType);
      }
    }

    // 梦魇：未翻开的层，视图里拿不到是哪张（梦主除外）
    for (const key of Object.keys(G.layers)) {
      const l = Number(key);
      const real = G.layers[l]!;
      const allowed = gameOver || real.nightmareRevealed || viewer === G.dreamMasterID;
      if (!allowed) {
        expect(view.layers[l]!.nightmareId, `${at} 第${l}层梦魇`).toBeNull();
        counts.hiddenNightmares++;
      }
    }
    if (viewer !== G.dreamMasterID && !gameOver) {
      expect(view.usedNightmareIds, `${at} 已用梦魇`).toBeNull();
    }

    // 贿赂牌：不该他知道成败的，拿不到 kind，也拿不到区分成败的状态值
    for (let i = 0; i < G.bribePool.length; i++) {
      const real = G.bribePool[i]!;
      const seen = view.bribePool[i]!;
      expect(['inPool', 'dispatched'], `${at} 贿赂状态`).toContain(seen.status);
      if (mayKnowBribeKind(G, viewer, real, gameOver)) {
        expect(seen.kind, `${at} 贿赂${real.id}`).toBe(real.kind);
      } else {
        expect(seen.kind, `${at} 贿赂${real.id}`).toBeNull();
        if (real.status === 'inPool') counts.poolBribes++;
        else if (real.heldBy !== viewer) counts.dispatchedBribesOfOthers++;
      }
    }

    // 未翻开且不是本人的玩家，其角色编号不得出现在序列化文本里。
    // 角色编号带引号整串匹配，避免子串误报；每名玩家的角色编号互不相同，不会与本人的撞上
    if (!gameOver) {
      for (const id of G.playerOrder) {
        const real = G.players[id]!;
        if (id === viewer || real.isRevealed) continue;
        const quoted = `"${real.characterId}"`;
        // 移形换影之后，观察者自己的快照条目里合法地带着他原来的角色编号，而那个角色此刻在别人身上。
        // 这一个编号只允许出现在他本人的快照条目里，视图别处出现仍然算泄露。
        const ownSnapshot = viewer === null ? undefined : G.shiftSnapshot?.[viewer];
        if (ownSnapshot !== undefined && ownSnapshot === real.characterId) {
          expect(view.shiftSnapshot?.[viewer!], `${at} 自己的快照条目`).toBe(real.characterId);
          expect(json.split(quoted).length - 1, `${at} 玩家${id}的角色只在自己的快照条目里`).toBe(
            1,
          );
        } else {
          expect(json, `${at} 玩家${id}的角色`).not.toContain(quoted);
        }
        counts.roleTextChecks++;
      }
    }
  }
  return counts;
}

function playout(numPlayers: number, seed: string, maxSteps: number, every: number): ScanCounts {
  let s = startedMatch(numPlayers, seed);
  const rnd = makeTestRng(numPlayers * 7919 + seed.length);
  const total = emptyCounts();
  const scan = (state: MatchState<SetupState>, label: string): void => {
    addCounts(total, scanMoment(game, state, seed, label));
    // 补出已派出贿赂牌、窥视中的局面（理由见 withDispatchedBribes）
    const derived = { ...state, G: withDispatchedBribes(state.G) };
    addCounts(total, scanMoment(game, derived, seed, `${label} 派出贿赂`));
  };
  scan(s, `${numPlayers}人 开局`);
  for (let step = 1; step <= maxSteps && s.ctx.gameover === undefined; step++) {
    const cand = pickLegalMove(game, s, rnd);
    if (!cand) break;
    const res = applyMove(game, s, cand);
    if (!res.ok) throw new Error(`试跑通过的 move 正式执行被拒绝：${cand.move}`);
    s = res.state;
    if (step % every === 0) scan(s, `${numPlayers}人 第${step}步`);
  }
  scan(s, `${numPlayers}人 结束`);
  return total;
}

describe('泄露扫描 · 随机对局（4 到 10 人）', () => {
  it('每个观察者的视图在整局里都不泄露秘密', () => {
    const total = emptyCounts();
    // 多组不同后缀的种子：检查结论不能依赖某一个种子的布局
    for (const suffix of ['xyzzy', 'plugh', 'qwert', 'foo', 'bar', 'baz']) {
      for (let n = 4; n <= 10; n++) {
        addCounts(total, playout(n, `leak-seed-${n}-${suffix}`, 120, 6));
      }
    }
    // 每一类秘密都确实被检查过，样本为零会失败
    for (const key of Object.keys(total) as (keyof ScanCounts)[]) {
      expect(total[key], `类别 ${key} 的样本数`).toBeGreaterThan(0);
    }
  }, 60_000);

  it('扫描能发现泄露：换成不过滤的视图钩子，同一份扫描立即失败', () => {
    const s = startedMatch(5, 'leak-canary');
    const leaky: GameDef<SetupState> = { ...game, view: ({ G: full }) => full };
    expect(() => scanMoment(leaky, s, 'leak-canary', '金丝雀')).toThrow();
    // 对照：真正的钩子通过同一份扫描
    expect(() => scanMoment(game, s, 'leak-canary', '对照')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 二、结构性断言
// ---------------------------------------------------------------------------

const scene = buildViewScene();
const { G, master, a, b, c, d } = scene;
const OPEN = { gameOver: false };
const OVER = { gameOver: true };

const json = (state: SetupState, viewer: Viewer, over = false): string =>
  JSON.stringify(viewFor(state, viewer, over ? OVER : OPEN));

/** 断言：把状态改成 mutated 之后，这些观察者的视图逐字节不变 */
function expectUnchanged(
  mutated: SetupState,
  viewers: readonly Viewer[],
  label: string,
  base: SetupState = G,
  over = false,
): void {
  for (const viewer of viewers) {
    expect(json(mutated, viewer, over), `${label} 观察者=${viewer ?? '旁观者'}`).toBe(
      json(base, viewer, over),
    );
  }
}

/** 反向断言：这些观察者本来就该看到这个值，视图必须跟着变 */
function expectChanged(
  mutated: SetupState,
  viewers: readonly Viewer[],
  label: string,
  base: SetupState = G,
  over = false,
): void {
  for (const viewer of viewers) {
    expect(json(mutated, viewer, over), `${label} 观察者=${viewer ?? '旁观者'}`).not.toBe(
      json(base, viewer, over),
    );
  }
}

function patchPlayer(state: SetupState, id: string, patch: Partial<PlayerSetup>): SetupState {
  return { ...state, players: { ...state.players, [id]: { ...state.players[id]!, ...patch } } };
}

function patchBribe(state: SetupState, id: string, patch: Partial<BribeSetup>): SetupState {
  return {
    ...state,
    bribePool: state.bribePool.map((x) => (x.id === id ? { ...x, ...patch } : { ...x })),
  };
}

const imperial = patchPlayer(G, master, { characterId: IMPERIAL_CITY });
const everyone: Viewer[] = [a, b, c, d, master, null, 'ghost'];
const exceptOwner = (owner: string): Viewer[] => everyone.filter((x) => x !== owner);

describe('泄露扫描 · 结构性断言：改掉保密的值，视图逐字节不变', () => {
  it('别人的手牌内容（张数不变）', () => {
    const mutated = patchPlayer(G, a, {
      hand: ['action_graft', 'action_graft', 'action_graft'] as CardID[],
    });
    expect(mutated.players[a]!.hand).toHaveLength(G.players[a]!.hand.length);
    expectUnchanged(mutated, exceptOwner(a), '换 a 的手牌');
    expectChanged(mutated, [a], '换 a 的手牌');
    // 梦主的手牌同理
    const m2 = patchPlayer(G, master, { hand: ['action_graft', 'action_graft'] as CardID[] });
    expectUnchanged(m2, exceptOwner(master), '换梦主的手牌');
    expectChanged(m2, [master], '换梦主的手牌');
    // 只换顺序也不能让别人看出来
    const m3 = patchPlayer(G, d, { hand: [...G.players[d]!.hand].reverse() });
    expectUnchanged(m3, exceptOwner(d), '调换 d 的手牌顺序');
  });

  it('牌库顺序与内容（张数不变），对局结束后也一样', () => {
    const cards = G.deck.cards.map((_, i) => (i % 2 === 0 ? 'action_kick' : 'action_shoot'));
    const mutated: SetupState = { ...G, deck: { ...G.deck, cards: cards as CardID[] } };
    expect(JSON.stringify(mutated.deck.cards)).not.toBe(JSON.stringify(G.deck.cards));
    expect(mutated.deck.cards).toHaveLength(G.deck.cards.length);
    expectUnchanged(mutated, everyone, '换牌库');
    expectUnchanged(mutated, everyone, '换牌库（对局结束）', G, true);
    const reversed: SetupState = { ...G, deck: { ...G.deck, cards: [...G.deck.cards].reverse() } };
    expectUnchanged(reversed, everyone, '牌库倒序');
    // 张数是公开的：少一张视图要变
    const shorter: SetupState = { ...G, deck: { ...G.deck, cards: G.deck.cards.slice(1) } };
    expectChanged(shorter, everyone, '牌库少一张');
  });

  it('随机种子，对局结束后也一样', () => {
    const mutated: SetupState = { ...G, rngSeed: 'a-completely-different-seed' };
    expectUnchanged(mutated, everyone, '换种子');
    expectUnchanged(mutated, everyone, '换种子（对局结束）', G, true);
  });

  it('开局顺序的内部计数器', () => {
    expectUnchanged({ ...G, moveCounter: G.moveCounter + 17 }, everyone, '换 moveCounter');
  });

  it('未开且没在看的金库的内容', () => {
    const secretIdx = G.vaults.findIndex((x) => x.contentType === 'secret');
    const coinIdx = G.vaults.findIndex((x) => x.contentType === 'coin');
    const swapped: SetupState = {
      ...G,
      vaults: G.vaults.map((x, i) => {
        if (i === secretIdx) return { ...x, contentType: 'coin' as const };
        if (i === coinIdx) return { ...x, contentType: 'secret' as const };
        return { ...x };
      }),
    };
    expectUnchanged(
      swapped,
      everyone.filter((x) => x !== master),
      '互换两个金库的内容',
    );
    expectChanged(swapped, [master], '互换两个金库的内容');
  });

  it('梦境窥视：看牌者只看被看那一层；改别的金库不影响他，改被看的那层他才会变', () => {
    const secretVault = G.vaults.find((x) => x.contentType === 'secret')!;
    const coinVault = G.vaults.find((x) => x.contentType === 'coin')!;
    const peeking: SetupState = {
      ...G,
      peekReveal: { peekerID: b, revealKind: 'vault', vaultLayer: secretVault.layer },
    };
    const changeVault = (state: SetupState, id: string): SetupState => ({
      ...state,
      vaults: state.vaults.map((x) =>
        x.id === id
          ? {
              ...x,
              contentType: x.contentType === 'secret' ? ('coin' as const) : ('secret' as const),
            }
          : { ...x },
      ),
    });
    // 被看的那一层变了：看牌者和梦主变，其他人不变
    const peekedChanged = changeVault(peeking, secretVault.id);
    expectUnchanged(peekedChanged, [a, c, d, null, 'ghost'], '改被看的金库', peeking);
    expectChanged(peekedChanged, [b, master], '改被看的金库', peeking);
    // 没被看的那一层变了：看牌者也不变
    const otherChanged = changeVault(peeking, coinVault.id);
    expectUnchanged(otherChanged, [a, b, c, d, null, 'ghost'], '改没被看的金库', peeking);
    expectChanged(otherChanged, [master], '改没被看的金库', peeking);
  });

  it('未翻开层的梦魇是哪张', () => {
    const swapLayers = (state: SetupState, x: number, y: number): SetupState => ({
      ...state,
      layers: {
        ...state.layers,
        [x]: { ...state.layers[x]!, nightmareId: state.layers[y]!.nightmareId },
        [y]: { ...state.layers[y]!, nightmareId: state.layers[x]!.nightmareId },
      },
    });
    const mutated = swapLayers(G, 1, 2);
    expectUnchanged(
      mutated,
      everyone.filter((x) => x !== master),
      '互换第 1、2 层梦魇',
    );
    expectChanged(mutated, [master], '互换第 1、2 层梦魇');
    // 已翻开的第 3 层互换：所有人都该看到变化
    expectChanged(swapLayers(G, 3, 4), [a, master], '换已翻开的第 3 层梦魇');
    // 对局结束后梦魇公开：此时观察者也会变
    expectChanged(mutated, [a, null], '互换第 1、2 层梦魇（对局结束）', G, true);
  });

  it('池里的贿赂牌的成败：普通梦主、盗梦者、旁观者看不出；皇城梦主能', () => {
    const flip = patchBribe(G, 'bribe-0', { kind: 'fail' });
    expectUnchanged(flip, everyone, '翻转池里 bribe-0 的成败');
    const flipImperial = patchBribe(imperial, 'bribe-0', { kind: 'fail' });
    expectUnchanged(
      flipImperial,
      everyone.filter((x) => x !== master),
      '翻转池里 bribe-0（皇城）',
      imperial,
    );
    expectChanged(flipImperial, [master], '翻转池里 bribe-0（皇城）', imperial);
  });

  it('已派出的贿赂牌的成败：只有持有者本人看得出，皇城梦主也看不出', () => {
    // b 持有 bribe-3（失败，状态 dealt）→ 改成成功（状态 deal），两个字段一起改，模拟真实的派发结果
    const flip = patchBribe(G, 'bribe-3', { kind: 'deal', status: 'deal' });
    expectUnchanged(flip, exceptOwner(b), '翻转 b 持有的 bribe-3');
    expectChanged(flip, [b], '翻转 b 持有的 bribe-3');
    const flipImperial = patchBribe(imperial, 'bribe-3', { kind: 'deal', status: 'deal' });
    expectUnchanged(flipImperial, exceptOwner(b), '翻转 b 持有的 bribe-3（皇城）', imperial);
  });

  it('区分成败的状态值：成功 / 失败 / 碎裂互相改成对方，任何人的视图都不变', () => {
    for (const status of ['deal', 'dealt', 'shattered'] as const) {
      expectUnchanged(patchBribe(G, 'bribe-3', { status }), everyone, `bribe-3 状态=${status}`);
      expectUnchanged(
        patchBribe(imperial, 'bribe-3', { status }),
        everyone,
        `bribe-3 状态=${status}（皇城）`,
        imperial,
      );
    }
    for (const status of ['deal', 'dealt', 'shattered'] as const) {
      expectUnchanged(patchBribe(G, 'bribe-2', { status }), everyone, `bribe-2 状态=${status}`);
    }
  });

  it('梦境窥视（梦主看贿赂牌）：被看那名玩家持有的牌，梦主能看出，别人不能', () => {
    const peeking: SetupState = {
      ...G,
      peekReveal: { peekerID: master, revealKind: 'bribe', targetThiefID: b },
    };
    const flipTarget = patchBribe(peeking, 'bribe-3', { kind: 'deal', status: 'deal' });
    expectUnchanged(flipTarget, [a, c, d, null, 'ghost'], '翻转被看者的牌', peeking);
    expectChanged(flipTarget, [master, b], '翻转被看者的牌', peeking);
    // 不是被看者持有的牌，梦主仍看不出
    const flipOther = patchBribe(peeking, 'bribe-2', { kind: 'fail', status: 'dealt' });
    expectUnchanged(flipOther, exceptOwner(a), '翻转没被看的 a 的牌', peeking);
    expectChanged(flipOther, [a], '翻转没被看的 a 的牌', peeking);
    // 池里的牌仍然看不出
    const flipPool = patchBribe(peeking, 'bribe-1', { kind: 'deal' });
    expectUnchanged(flipPool, everyone, '翻转池里的牌（窥视中）', peeking);
  });

  it('梦境窥视（梦主看贿赂牌）的授权只属于梦主本人，不属于别人，也不是别的窥视者', () => {
    const peeking: SetupState = {
      ...G,
      peekReveal: { peekerID: master, revealKind: 'bribe', targetThiefID: b },
    };
    const flip = patchBribe(peeking, 'bribe-3', { kind: 'deal', status: 'deal' });
    expectUnchanged(flip, [c, null], '别人看不出窥视结果', peeking);
  });

  it('未翻开玩家的真实角色与真实阵营', () => {
    // c 是未翻开的盗梦者：改他的角色和阵营，除他本人外任何人的视图都不变
    const mutated = patchPlayer(G, c, { characterId: 'thief_darwin' as CardID, faction: 'master' });
    expect(mutated.players[c]!.characterId).not.toBe(G.players[c]!.characterId);
    expectUnchanged(mutated, exceptOwner(c), '换 c 的角色与阵营');
    expectChanged(mutated, [c], '换 c 的角色与阵营');
    // 只改阵营（贿赂生效）
    const faction = patchPlayer(G, d, { faction: 'master' });
    expectUnchanged(faction, exceptOwner(d), '改 d 的阵营');
    expectChanged(faction, [d], '改 d 的阵营');
    // 已经转阵营的 a 改回去，别人也看不出（对皇城梦主同样）
    const back = patchPlayer(G, a, { faction: 'thief' });
    expectUnchanged(back, exceptOwner(a), 'a 的阵营改回盗梦者');
    const backImperial = patchPlayer(imperial, a, { faction: 'thief' });
    expectUnchanged(backImperial, exceptOwner(a), 'a 的阵营改回盗梦者（皇城）', imperial);
    // 反向：翻开之后别人就看得到了
    const revealed = patchPlayer(G, c, { isRevealed: true });
    expectChanged(revealed, [a, master, null], '翻开 c');
  });

  it('别人「用过的技能」记录', () => {
    const mutated = patchPlayer(G, c, {
      skillUsedThisTurn: { 'some-other-skill': 3 },
      skillUsedThisGame: { 'some-other-skill': 3, again: 1 },
      forcedDiscardArmedAtTurn: 9,
    });
    expectUnchanged(mutated, exceptOwner(c), '换 c 的技能记录');
    expectChanged(mutated, [c], '换 c 的技能记录');
    expectChanged(mutated, [null, a], '换 c 的技能记录（对局结束）', G, true);
  });

  it('天秤分出的两堆牌的内容（张数不变）', () => {
    const split = (pile1: CardID[], pile2: CardID[]): SetupState => ({
      ...G,
      pendingLibra: { bonderPlayerID: a, targetPlayerID: c, split: { pile1, pile2 } },
    });
    const base = split(['action_shoot', 'action_kick'] as CardID[], ['action_unlock'] as CardID[]);
    const mutated = split(
      ['action_graft', 'action_graft'] as CardID[],
      ['action_graft'] as CardID[],
    );
    expectUnchanged(mutated, [b, d, master, null, 'ghost'], '换天秤分出的牌', base);
    expectChanged(mutated, [a, c], '换天秤分出的牌', base);
    // 堆的张数是公开的
    const moved = split(['action_shoot'] as CardID[], ['action_kick', 'action_unlock'] as CardID[]);
    expectChanged(moved, [b, master, null], '天秤两堆张数变化', base);
  });

  it('盗梦者视角下已用梦魇的具体内容（数量不变）', () => {
    const mutated: SetupState = {
      ...G,
      usedNightmareIds: ['nightmare_echo', 'nightmare_space_fall'],
    };
    expectUnchanged(
      mutated,
      everyone.filter((x) => x !== master),
      '换已用梦魇的内容',
    );
    expectChanged(mutated, [master], '换已用梦魇的内容');
    // 数量是公开的
    expectChanged({ ...G, usedNightmareIds: [] }, [a, null], '已用梦魇少了');
  });

  it('移形换影快照里未翻开的他人条目', () => {
    const snapshot = (cOwn: CardID): SetupState => ({
      ...G,
      shiftSnapshot: {
        [master]: G.players[master]!.characterId,
        [a]: G.players[a]!.characterId,
        [b]: G.players[b]!.characterId,
        [c]: cOwn,
        [d]: G.players[d]!.characterId,
      },
    });
    const base = snapshot('thief_gemini' as CardID);
    const mutated = snapshot('thief_luna' as CardID);
    // c 本人看得到自己的条目；别人（含梦主、旁观者）看不到
    expectUnchanged(mutated, exceptOwner(c), '换快照里 c 的条目', base);
    expectChanged(mutated, [c], '换快照里 c 的条目', base);
    // 已翻开的梦主的条目：所有人都看得到
    const masterEntry: SetupState = {
      ...base,
      shiftSnapshot: { ...base.shiftSnapshot!, [master]: 'dm_mercury_route' as CardID },
    };
    expectChanged(masterEntry, [a, null], '换快照里梦主的条目', base);
  });

  it('白羊、处女、SHOOT 响应窗口里会暴露角色的字段', () => {
    const aries = (id: string): SetupState => ({
      ...G,
      pendingAriesChoice: { ariesID: id, victimLayer: 2, victimID: c },
    });
    expectUnchanged(aries(d), [a, c, master, null, 'ghost'], '白羊换人', aries(b));
    expectChanged(aries(d), [b, d], '白羊换人', aries(b));

    const virgo = (id: string): SetupState => ({
      ...G,
      pendingVirgoChoice: { virgoID: id, triggerRoll: 6, shooterID: a },
    });
    expectUnchanged(virgo(d), [a, c, master, null, 'ghost'], '处女换人', virgo(b));
    expectChanged(virgo(d), [b, d], '处女换人', virgo(b));

    const shoot = (responseType: 'pisces' | 'terrorist'): SetupState => ({
      ...G,
      pendingShootResponse: {
        shooterID: a,
        targetPlayerID: c,
        cardId: 'action_shoot',
        sameLayerRequired: true,
        deathFaces: [1],
        moveFaces: [2],
        extraOnMove: null,
        responseType,
      },
    });
    expectUnchanged(shoot('terrorist'), exceptOwner(c), 'SHOOT 响应类型', shoot('pisces'));
    expectChanged(shoot('terrorist'), [c], 'SHOOT 响应类型', shoot('pisces'));
  });

  it('对局结束后只公开该公开的：改种子与牌库仍然不影响任何人', () => {
    const mutated: SetupState = {
      ...G,
      rngSeed: 'zzz',
      deck: { ...G.deck, cards: [...G.deck.cards].reverse() },
    };
    expectUnchanged(mutated, everyone, '对局结束后换种子与牌库', G, true);
  });
});

describe('泄露扫描 · 已死亡的玩家', () => {
  const dead = patchPlayer(G, c, { isAlive: false, deathTurn: 3 });

  it('死者的手牌和角色对别人仍是 null', () => {
    for (const viewer of [a, b, d, master, null, 'ghost']) {
      const p = viewFor(dead, viewer, OPEN).players[c]!;
      expect(p.isAlive).toBe(false);
      expect(p.hand).toBeNull();
      expect(p.characterId).toBeNull();
      expect(p.faction).toBe('thief');
      expect(p.handCount).toBe(2);
    }
    expectUnchanged(
      patchPlayer(dead, c, { hand: ['action_graft', 'action_graft'] as CardID[] }),
      exceptOwner(c),
      '换死者的手牌',
      dead,
    );
  });

  it('死者作为观察者仍只看到自己的牌，看不到别人的保密内容', () => {
    const view = viewFor(dead, c, OPEN);
    expect(view.players[c]!.hand).toEqual(G.players[c]!.hand);
    for (const id of [a, b, d, master]) expect(view.players[id]!.hand).toBeNull();
    expect(view.players[a]!.characterId).toBeNull();
    expect(view.players[a]!.faction).toBe('thief');
    expect(view.vaults.every((x) => x.contentType === null)).toBe(true);
    expect(Object.values(view.layers)[0]!.nightmareId).toBeNull();
    expect(view.bribePool.every((x) => x.kind === null)).toBe(true);
    expect(view.usedNightmareIds).toBeNull();
    // 死者的视图与活着时对别人保密的部分一样不随秘密变化
    const mutated = patchPlayer(dead, a, {
      hand: ['action_graft', 'action_graft', 'action_graft'] as CardID[],
    });
    expectUnchanged(mutated, [c], '死者看不到 a 的手牌', dead);
  });
});

describe('泄露扫描 · 观察者的组合', () => {
  it('同一个状态下不同观察者的视图确实不同（扫描不是在比较同一份东西）', () => {
    const views = new Set([a, b, master, null].map((viewer) => json(G, viewer)));
    expect(views.size).toBe(4);
    // 皇城梦主与普通梦主的视图不同
    expect(json(imperial, master)).not.toBe(json(G, master));
    // 对局结束后旁观者与进行中的旁观者不同
    expect(json(G, null, true)).not.toBe(json(G, null));
  });
});
