// 金币金库打开时梦主三选一：派贿赂并弃梦魇 / 翻开并发动梦魇 / 弃梦魇。
// 全部经对局运行器驱动真实 move；等待状态期间其他 move 被挡住，直到梦主应答。
// 对照：docs/manual/03-game-flow.md 金库（33-36 行）、贿赂（38-45 行）、梦魇牌（94-103 行）；
//       docs/manual/02-game-setup.md 人数配置表（45-52 行）；docs/manual/06-dream-master.md 皇城

import { describe, it, expect } from 'vitest';
import type { CardID } from '@icgame/shared';
import { InceptionCityGame } from './game.js';
import { createInitialState, type SetupState } from './setup.js';
import { migrateGameState } from './migrations.js';
import { SAGITTARIUS_KILLS_THIS_TURN_KEY } from './engine/death.js';
import { sendToLimbo } from './engine/death.js';
import { checkStateInvariants } from './engine/stateInvariants.js';
import { viewFor } from './engine/matchView.js';
import { applyMove } from './runner/matchRunner.js';
import { listAwaiting } from './engine/actionRights.js';
import { withBribes } from './testing/fixtures.js';
import {
  c,
  fixedRandom,
  game,
  KICK,
  load,
  scene,
  UNLOCK,
  withPlayer,
} from './testing/runnerHarness.js';

const DESPAIR = c('nightmare_despair_storm');
const ECHO = c('nightmare_echo');
const IMPERIAL = c('dm_imperial_city');

type Bribes = Parameters<typeof withBribes>[1];

const TWO_BRIBES: Bribes = [
  { id: 'bribe-0', kind: 'fail', status: 'inPool' },
  { id: 'bribe-1', kind: 'deal', status: 'inPool' },
];

function withNightmare(G: SetupState, layer: number, id: CardID | null, revealed = false) {
  const ls = G.layers[layer]!;
  return {
    ...G,
    layers: {
      ...G.layers,
      [layer]: { ...ls, nightmareId: id, nightmareRevealed: revealed },
    },
  };
}

/** p1 在第 2 层、该层心锁 1、手里有一张解封；第 2 层金库是金币，梦魇是绝望风暴 */
function unlockScene(extra: Partial<SetupState> = {}): SetupState {
  let G = scene(
    {
      p1: { layer: 2, hand: [UNLOCK] },
      p2: { layer: 1, hand: [KICK] },
      p3: { layer: 1, hand: [KICK] },
      p4: { layer: 1, hand: [KICK] },
      pM: { layer: 3, hand: [KICK] },
    },
    { currentPlayerID: 'p1', turnPhase: 'action', ...extra },
  );
  G = withBribes(G, extra.bribePool ?? TWO_BRIBES);
  G = {
    ...G,
    layers: { ...G.layers, 2: { ...G.layers[2]!, heartLockValue: 1 } },
  };
  return withNightmare(G, 2, DESPAIR);
}

/** 射手在第 layer 层把心锁 1 减到 0 */
function sagittariusScene(layer: number): SetupState {
  let G = scene(
    {
      p1: { layer, hand: [KICK] },
      p2: { layer: 1, hand: [KICK] },
      p3: { layer: 1, hand: [KICK] },
      p4: { layer: 1, hand: [KICK] },
      pM: { layer: 3, hand: [KICK] },
    },
    { currentPlayerID: 'p1', turnPhase: 'action' },
  );
  G = withPlayer(G, 'p1', {
    characterId: c('thief_sagittarius'),
    skillUsedThisTurn: { [SAGITTARIUS_KILLS_THIS_TURN_KEY]: 1 },
  });
  G = withBribes(G, TWO_BRIBES);
  G = withNightmare(G, layer, DESPAIR);
  return {
    ...G,
    layers: { ...G.layers, [layer]: { ...G.layers[layer]!, heartLockValue: 1 } },
  };
}

/** 直接构造「第 2 层金币金库已被 p1 打开，等梦主决定」 */
function pendingScene(extra: Partial<SetupState> = {}): SetupState {
  let G = scene(
    {
      p1: { layer: 2, hand: [KICK] },
      p2: { layer: 1, hand: [KICK] },
      p3: { layer: 1, hand: [KICK] },
      p4: { layer: 1, hand: [KICK] },
      pM: { layer: 3, hand: [KICK] },
    },
    { currentPlayerID: 'p1', turnPhase: 'action' },
  );
  G = withBribes(G, TWO_BRIBES);
  G = withNightmare(G, 2, DESPAIR);
  G = {
    ...G,
    vaults: G.vaults.map((v) => (v.layer === 2 ? { ...v, isOpened: true, openedBy: 'p1' } : v)),
    layers: { ...G.layers, 2: { ...G.layers[2]!, heartLockValue: 0 } },
    pendingVaultDecision: { layer: 2, openerID: 'p1' },
  };
  return { ...G, ...extra };
}

/** 其余玩家都不在场：解封没有可响应者，当场结算 */
function soleUnlocker(G: SetupState): SetupState {
  return {
    ...G,
    players: Object.fromEntries(
      Object.entries(G.players).map(([id, p]) => [id, id === 'p1' ? p : { ...p, isAlive: false }]),
    ),
  };
}

/** 打出解封，其他存活玩家依次放弃响应，直到解封结算 */
function unlockThroughWindow(G: SetupState) {
  let m = ok(G, 'p1', 'playUnlock', [UNLOCK]).state;
  while (m.G.pendingResponseWindow) {
    const w = m.G.pendingResponseWindow;
    const next = w.responders.find((id) => !w.responded.includes(id))!;
    const res = applyMove(
      game,
      m,
      { playerID: next, move: 'passResponse', args: [] },
      { random: fixedRandom(3) },
    );
    expect(res.ok, `${next} 放弃响应`).toBe(true);
    if (!res.ok) throw new Error('passResponse 被拒绝');
    m = res.state;
  }
  return m.G;
}

function run(G: SetupState, playerID: string, move: string, args: unknown[] = [], roll = 3) {
  return applyMove(game, load(G), { playerID, move, args }, { random: fixedRandom(roll) });
}

function ok(G: SetupState, playerID: string, move: string, args: unknown[] = [], roll = 3) {
  const res = run(G, playerID, move, args, roll);
  expect(res.ok, `${move} 应被接受`).toBe(true);
  if (!res.ok) throw new Error(`${move} 被拒绝：${res.reason}`);
  return res;
}

describe('金币金库打开：挂起梦主决定', () => {
  it('解封打开金币金库：挂起等待状态，打开者没有自动拿到贿赂', () => {
    const res = ok(soleUnlocker(unlockScene()), 'p1', 'playUnlock', [UNLOCK]);
    const G = res.state.G;
    expect(G.vaults.find((v) => v.layer === 2)!.isOpened).toBe(true);
    expect(G.pendingVaultDecision).toEqual({ layer: 2, openerID: 'p1' });
    expect(G.players.p1!.bribeReceived).toBe(0);
    expect(G.bribePool.every((b) => b.status === 'inPool')).toBe(true);
    // 梦魇原样留在该层，没被翻开
    expect(G.layers[2]!.nightmareId).toBe(DESPAIR);
    expect(G.layers[2]!.nightmareRevealed).toBe(false);
  });

  it('响应窗口全员放弃后解封成功：同样挂起', () => {
    const G = unlockThroughWindow(unlockScene());
    expect(checkStateInvariants(G)).toEqual([]);
    expect(G.vaults.find((v) => v.layer === 2)!.isOpened).toBe(true);
    expect(G.pendingVaultDecision).toEqual({ layer: 2, openerID: 'p1' });
    expect(G.players.p1!.bribeReceived).toBe(0);
  });

  it('贿赂池已空且该层没有梦魇：梦主没有可选的东西，不挂起', () => {
    const scene = withNightmare(soleUnlocker(unlockScene({ bribePool: [] })), 2, null);
    const G = ok(scene, 'p1', 'playUnlock', [UNLOCK]).state.G;
    expect(G.vaults.find((v) => v.layer === 2)!.isOpened).toBe(true);
    expect(G.pendingVaultDecision).toBeNull();
  });

  it('贿赂池已空但该层有梦魇：仍然挂起', () => {
    const G = ok(soleUnlocker(unlockScene({ bribePool: [] })), 'p1', 'playUnlock', [UNLOCK]).state
      .G;
    expect(G.pendingVaultDecision).toEqual({ layer: 2, openerID: 'p1' });
  });

  it('技能把心锁减到 0 打开金币金库：同样挂起', () => {
    const res = ok(sagittariusScene(2), 'p1', 'useSagittariusHeartLock', [2, -1]);
    const G = res.state.G;
    expect(G.vaults.find((v) => v.layer === 2)!.isOpened).toBe(true);
    expect(G.pendingVaultDecision).toEqual({ layer: 2, openerID: 'p1' });
    expect(G.players.p1!.bribeReceived).toBe(0);
  });

  it('背叛者打开金币金库：对外是盗梦者，同样挂起', () => {
    const G = withPlayer(unlockScene(), 'p1', { faction: 'master', bribeReceived: 1 });
    const opened = unlockThroughWindow(G);
    expect(opened.pendingVaultDecision).toEqual({ layer: 2, openerID: 'p1' });
  });

  it('梦主本人打开金币金库：不挂起、不派贿赂，梦魇留在原处', () => {
    // 梦主不能打出解封；用伪造的待结算解封直接走结算路径
    let G = unlockScene();
    G = withPlayer(G, 'p1', { hand: [KICK] });
    G = withPlayer(G, 'pM', { currentLayer: 2 });
    G = {
      ...G,
      layers: {
        ...G.layers,
        2: { ...G.layers[2]!, playersInLayer: ['p1', 'pM'] },
        3: { ...G.layers[3]!, playersInLayer: [] },
      },
      currentPlayerID: 'pM',
      pendingUnlock: { playerID: 'pM', layer: 2, cardId: UNLOCK },
    };
    const res = ok(G, 'pM', 'resolveUnlock');
    expect(res.state.G.vaults.find((v) => v.layer === 2)!.isOpened).toBe(true);
    expect(res.state.G.pendingVaultDecision).toBeNull();
    expect(res.state.G.bribePool.every((b) => b.status === 'inPool')).toBe(true);
    expect(res.state.G.layers[2]!.nightmareId).toBe(DESPAIR);
  });

  it('秘密金库打开：不挂起，盗梦者直接获胜', () => {
    const res = ok(sagittariusScene(1), 'p1', 'useSagittariusHeartLock', [1, -1]);
    expect(res.state.G.pendingVaultDecision).toBeNull();
    expect(res.state.ctx.gameover).toMatchObject({ winner: 'thief' });
  });

  it('等待状态把梦主列为唯一可行动者，阻塞其他行动', () => {
    const G = unlockThroughWindow(unlockScene());
    const awaiting = listAwaiting(G).filter((a) => a.field === 'pendingVaultDecision');
    expect(awaiting).toEqual([
      {
        field: 'pendingVaultDecision',
        actors: ['pM'],
        moves: ['masterVaultDecision'],
        blocking: true,
      },
    ]);
  });
});

describe('挂起期间的行动权', () => {
  it('回合主人的其他 move 被拒绝', () => {
    const G = pendingScene();
    expect(run(G, 'p1', 'endActionPhase').ok).toBe(false);
    expect(run(G, 'p1', 'dreamMasterMove', [1]).ok).toBe(false);
  });

  it('其他人的 move 被拒绝', () => {
    const G = pendingScene();
    expect(run(G, 'p2', 'useAthenaWit').ok).toBe(false);
  });

  it('盗梦者发 masterVaultDecision 被拒绝，状态不变', () => {
    const G = pendingScene();
    for (const who of ['p1', 'p2', 'p4']) {
      const res = run(G, who, 'masterVaultDecision', ['discard']);
      expect(res.ok, who).toBe(false);
      if (!res.ok) expect(res.state.G.pendingVaultDecision).toEqual({ layer: 2, openerID: 'p1' });
    }
  });

  it('背叛者发 masterVaultDecision 也被拒绝', () => {
    const G = withPlayer(pendingScene(), 'p3', { faction: 'master', bribeReceived: 1 });
    expect(run(G, 'p3', 'masterVaultDecision', ['discard']).ok).toBe(false);
  });

  it('没有等待状态时梦主发 masterVaultDecision 被拒绝', () => {
    const G = { ...pendingScene(), pendingVaultDecision: null };
    expect(run(G, 'pM', 'masterVaultDecision', ['discard']).ok).toBe(false);
  });

  it('梦主不看 turnPhase，回合外即可应答', () => {
    // 回合主人是 p1，处于弃牌阶段
    const G = pendingScene({ turnPhase: 'discard' });
    ok(G, 'pM', 'masterVaultDecision', ['discard']);
  });

  it('参数形状不对被拒绝', () => {
    const G = pendingScene();
    expect(run(G, 'pM', 'masterVaultDecision', ['steal']).ok).toBe(false);
    expect(run(G, 'pM', 'masterVaultDecision', []).ok).toBe(false);
  });
});

describe('masterVaultDecision · bribe', () => {
  it('随机派 1 张贿赂牌给打开者，并弃掉该层梦魇（不发动）', () => {
    const before = pendingScene();
    const res = ok(before, 'pM', 'masterVaultDecision', ['bribe']);
    const G = res.state.G;
    expect(G.players.p1!.bribeReceived).toBe(1);
    expect(G.bribePool[0]).toMatchObject({ status: 'dealt', heldBy: 'p1', originalOwnerId: 'p1' });
    expect(G.bribePool[1]!.status).toBe('inPool');
    expect(G.players.p1!.faction).toBe('thief');
    // 梦魇被弃掉，没有发动：牌库没少
    expect(G.layers[2]!.nightmareId).toBeNull();
    expect(G.layers[2]!.nightmareTriggered).toBe(true);
    expect(G.usedNightmareIds).toEqual([DESPAIR]);
    expect(G.deck.cards).toHaveLength(before.deck.cards.length);
    expect(G.pendingVaultDecision).toBeNull();
    expect(G.moveCounter).toBe(before.moveCounter + 1);
    expect(checkStateInvariants(G)).toEqual([]);
  });

  it('派到成功的贿赂牌：打开者成为背叛者', () => {
    const G = withBribes(pendingScene(), [{ id: 'bribe-0', kind: 'deal', status: 'inPool' }]);
    const res = ok(G, 'pM', 'masterVaultDecision', ['bribe']);
    expect(res.state.G.players.p1!.faction).toBe('master');
    expect(res.state.G.bribePool[0]!.status).toBe('deal');
  });

  it('该层没有梦魇：只派贿赂', () => {
    const G = withNightmare(pendingScene(), 2, null);
    const res = ok(G, 'pM', 'masterVaultDecision', ['bribe']);
    expect(res.state.G.players.p1!.bribeReceived).toBe(1);
    expect(res.state.G.usedNightmareIds).toEqual([]);
  });

  it('打开者此刻在迷失层也照派', () => {
    const G = sendToLimbo(pendingScene(), 'p1');
    const res = ok(G, 'pM', 'masterVaultDecision', ['bribe']);
    expect(res.state.G.players.p1!.bribeReceived).toBe(1);
  });

  it('贿赂池没有可派的牌：被拒绝，等待状态保留', () => {
    const G = withBribes(pendingScene(), [
      { id: 'bribe-0', kind: 'fail', status: 'dealt', heldBy: 'p2', originalOwnerId: 'p2' },
    ]);
    const res = run(G, 'pM', 'masterVaultDecision', ['bribe']);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.state.G.pendingVaultDecision).toEqual({ layer: 2, openerID: 'p1' });
  });

  it('皇城·重金：可以指定池里的 1 张，并给打开者 1 次视为 SHOOT 的机会', () => {
    let G = withPlayer(pendingScene(), 'pM', { characterId: IMPERIAL });
    G = withPlayer(G, 'p1', { imperialShootCharges: 0 });
    const res = ok(G, 'pM', 'masterVaultDecision', ['bribe', { poolIndex: 1 }]);
    expect(res.state.G.bribePool[1]).toMatchObject({ status: 'deal', heldBy: 'p1' });
    expect(res.state.G.bribePool[0]!.status).toBe('inPool');
    expect(res.state.G.players.p1!.faction).toBe('master');
    expect(res.state.G.players.p1!.imperialShootCharges).toBe(1);
  });

  it('皇城·重金：指定的牌不在池里 / 下标越界被拒绝', () => {
    const G0 = withPlayer(pendingScene(), 'pM', { characterId: IMPERIAL });
    const G = {
      ...G0,
      bribePool: G0.bribePool.map((b, i) =>
        i === 1 ? { ...b, status: 'dealt' as const, heldBy: 'p2' } : b,
      ),
    };
    expect(run(G, 'pM', 'masterVaultDecision', ['bribe', { poolIndex: 1 }]).ok).toBe(false);
    expect(run(G0, 'pM', 'masterVaultDecision', ['bribe', { poolIndex: 9 }]).ok).toBe(false);
  });

  it('不是皇城的梦主指定牌被拒绝', () => {
    expect(run(pendingScene(), 'pM', 'masterVaultDecision', ['bribe', { poolIndex: 1 }]).ok).toBe(
      false,
    );
  });
});

describe('masterVaultDecision · nightmare', () => {
  it('翻开并发动该层梦魇，不派贿赂牌', () => {
    const before = pendingScene();
    const res = ok(before, 'pM', 'masterVaultDecision', ['nightmare']);
    const G = res.state.G;
    // 绝望风暴：牌库顶 10 张进弃牌堆（其他已开金库 0 座）
    expect(G.deck.cards).toHaveLength(before.deck.cards.length - 10);
    expect(G.deck.discardPile).toHaveLength(10);
    expect(G.players.p1!.bribeReceived).toBe(0);
    expect(G.bribePool.every((b) => b.status === 'inPool')).toBe(true);
    expect(G.layers[2]!.nightmareId).toBeNull();
    expect(G.layers[2]!.nightmareRevealed).toBe(false);
    expect(G.layers[2]!.nightmareTriggered).toBe(true);
    expect(G.usedNightmareIds).toEqual([DESPAIR]);
    expect(G.pendingVaultDecision).toBeNull();
    expect(G.moveCounter).toBe(before.moveCounter + 1);
    expect(checkStateInvariants(G)).toEqual([]);
  });

  it('params 透传给梦魇效果（回音萦绕：目标层心锁 +1）', () => {
    const G = withNightmare(pendingScene(), 2, ECHO);
    const lockBefore = G.layers[3]!.heartLockValue;
    const res = ok(G, 'pM', 'masterVaultDecision', [
      'nightmare',
      { targetLayer: 3, action: 'add' },
    ]);
    expect(res.state.G.layers[3]!.heartLockValue).toBe(lockBefore + 1);
    expect(res.state.G.usedNightmareIds).toEqual([ECHO]);
  });

  it('梦魇效果需要参数而没给：整个 move 非法，等待状态与梦魇都保留', () => {
    const G = withNightmare(pendingScene(), 2, ECHO);
    const res = run(G, 'pM', 'masterVaultDecision', ['nightmare']);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.state.G.pendingVaultDecision).toEqual({ layer: 2, openerID: 'p1' });
      expect(res.state.G.layers[2]!.nightmareId).toBe(ECHO);
      expect(res.state.G.usedNightmareIds).toEqual([]);
    }
  });

  it('该层没有梦魇：被拒绝', () => {
    const G = withNightmare(pendingScene(), 2, null);
    expect(run(G, 'pM', 'masterVaultDecision', ['nightmare']).ok).toBe(false);
  });
});

describe('masterVaultDecision · discard', () => {
  it('弃掉该层梦魇，不派贿赂牌', () => {
    const before = pendingScene();
    const G = ok(before, 'pM', 'masterVaultDecision', ['discard']).state.G;
    expect(G.layers[2]!.nightmareId).toBeNull();
    expect(G.layers[2]!.nightmareTriggered).toBe(true);
    expect(G.usedNightmareIds).toEqual([DESPAIR]);
    expect(G.deck.cards).toHaveLength(before.deck.cards.length);
    expect(G.players.p1!.bribeReceived).toBe(0);
    expect(G.pendingVaultDecision).toBeNull();
    expect(G.moveCounter).toBe(before.moveCounter + 1);
  });

  it('该层没有梦魇：什么都不弃，只清掉等待状态', () => {
    const before = withNightmare(pendingScene(), 2, null);
    const G = ok(before, 'pM', 'masterVaultDecision', ['discard']).state.G;
    expect(G.usedNightmareIds).toEqual([]);
    expect(G.pendingVaultDecision).toBeNull();
    expect(G.moveCounter).toBe(before.moveCounter + 1);
  });

  it('贿赂池空了照样可以', () => {
    const G = withBribes(pendingScene(), []);
    ok(G, 'pM', 'masterVaultDecision', ['discard']);
  });

  it('应答之后回合主人可以继续行动', () => {
    const G = ok(pendingScene(), 'pM', 'masterVaultDecision', ['discard']).state.G;
    ok(G, 'p1', 'endActionPhase');
  });
});

describe('梦主不能在自己回合凭空派贿赂 / 翻开 / 弃掉梦魇', () => {
  it('旧的自由 move 已删除', () => {
    const moves = (InceptionCityGame as unknown as { phases: { playing: { moves: object } } })
      .phases.playing.moves;
    for (const name of [
      'masterDealBribe',
      'masterRevealNightmare',
      'masterDiscardHiddenNightmare',
      'masterDealBribeImperial',
    ]) {
      expect(Object.keys(moves), name).not.toContain(name);
    }
  });

  it('梦主回合发已删除的 move 被拒绝，状态不变', () => {
    let G = scene(
      { p1: { layer: 1, hand: [KICK] }, pM: { layer: 2, hand: [KICK] } },
      { currentPlayerID: 'pM', turnPhase: 'action' },
    );
    G = withBribes(G, TWO_BRIBES);
    G = withNightmare(G, 3, DESPAIR);
    for (const [move, args] of [
      ['masterDealBribe', ['p1']],
      ['masterRevealNightmare', [3]],
      ['masterDiscardHiddenNightmare', [3]],
    ] as const) {
      const res = run(G, 'pM', move, [...args]);
      expect(res.ok, move).toBe(false);
    }
  });

  it('已被技能或行动牌翻开的梦魇仍可由梦主发动 / 弃掉', () => {
    let G = scene(
      { p1: { layer: 1, hand: [KICK] }, pM: { layer: 2, hand: [KICK] } },
      { currentPlayerID: 'pM', turnPhase: 'action' },
    );
    G = withNightmare(G, 3, DESPAIR, true);
    ok(G, 'pM', 'masterActivateNightmare', [3]);
    ok(G, 'pM', 'masterDiscardNightmare', [3]);
  });
});

describe('梦境窥视效果①的派发', () => {
  function peekScene(masterCharacter?: CardID): SetupState {
    let G = scene(
      {
        p1: { layer: 1, hand: [KICK] },
        p2: { layer: 1, hand: [KICK] },
        pM: { layer: 2, hand: [KICK] },
      },
      { currentPlayerID: 'p1', turnPhase: 'action' },
    );
    G = withBribes(G, TWO_BRIBES);
    if (masterCharacter) G = withPlayer(G, 'pM', { characterId: masterCharacter });
    return { ...G, pendingPeekDecision: { peekerID: 'p1', targetLayer: 2 } };
  }

  it('梦主选择派发：随机派 1 张给窥视者', () => {
    const G = ok(peekScene(), 'pM', 'masterPeekBribeDecision', [true]).state.G;
    expect(G.players.p1!.bribeReceived).toBe(1);
    expect(G.pendingPeekDecision).toBeNull();
    expect(G.peekReveal).toMatchObject({ peekerID: 'p1', vaultLayer: 2 });
  });

  it('梦主选择不派：不动贿赂池', () => {
    const G = ok(peekScene(), 'pM', 'masterPeekBribeDecision', [false]).state.G;
    expect(G.players.p1!.bribeReceived).toBe(0);
    expect(G.bribePool.every((b) => b.status === 'inPool')).toBe(true);
  });

  it('皇城·重金：派发时可以指定 1 张', () => {
    const G = ok(peekScene(IMPERIAL), 'pM', 'masterPeekBribeDecision', [true, 1]).state.G;
    expect(G.bribePool[1]).toMatchObject({ status: 'deal', heldBy: 'p1' });
    expect(G.bribePool[0]!.status).toBe('inPool');
    expect(G.players.p1!.faction).toBe('master');
    expect(G.players.p1!.imperialShootCharges).toBe(1);
  });

  it('不是皇城的梦主指定牌被拒绝', () => {
    expect(run(peekScene(), 'pM', 'masterPeekBribeDecision', [true, 1]).ok).toBe(false);
  });
});

describe('贿赂池张数按人数配置', () => {
  const table: Record<number, [number, number]> = {
    4: [1, 1],
    5: [1, 2],
    6: [1, 2],
    7: [2, 1],
    8: [2, 1],
    9: [2, 1],
    10: [3, 2],
  };
  it.each(Object.entries(table))('%s 人局：成功 / 失败张数', (n, [deal, fail]) => {
    const count = Number(n);
    const ids = Array.from({ length: count }, (_, i) => String(i));
    const pool = createInitialState({
      playerCount: count,
      playerIds: ids,
      nicknames: ids.map((i) => `P${i}`),
      rngSeed: 'pool-seed',
    }).bribePool;
    expect(pool.filter((b) => b.kind === 'deal')).toHaveLength(deal);
    expect(pool.filter((b) => b.kind === 'fail')).toHaveLength(fail);
    expect(pool.map((b) => b.id)).toEqual(pool.map((_, i) => `bribe-${i}`));
  });
});

describe('视图与存档', () => {
  it('等待状态对所有座位可见，只含 layer 与 openerID', () => {
    const G = pendingScene();
    for (const viewer of [null, 'p1', 'p2', 'p3', 'pM']) {
      const v = viewFor(G, viewer, { gameOver: false });
      expect(v.pendingVaultDecision, String(viewer)).toEqual({ layer: 2, openerID: 'p1' });
      expect(Object.keys(v.pendingVaultDecision!).sort()).toEqual(['layer', 'openerID']);
    }
    expect(
      viewFor({ ...G, pendingVaultDecision: null }, 'p2', { gameOver: false }).pendingVaultDecision,
    ).toBeNull();
  });

  it('不变量：层与打开者必须合法', () => {
    expect(checkStateInvariants(pendingScene())).toEqual([]);
    const badLayer = { ...pendingScene(), pendingVaultDecision: { layer: 9, openerID: 'p1' } };
    expect(checkStateInvariants(badLayer).join('\n')).toContain('pendingVaultDecision');
    const badOpener = { ...pendingScene(), pendingVaultDecision: { layer: 2, openerID: 'zz' } };
    expect(checkStateInvariants(badOpener).join('\n')).toContain('pendingVaultDecision');
  });

  it('迁移：旧存档补 pendingVaultDecision: null，版本升到 12', () => {
    const legacy: Record<string, unknown> = { ...pendingScene(), schemaVersion: 11 };
    delete legacy.pendingVaultDecision;
    const migrated = migrateGameState(legacy);
    expect(migrated.schemaVersion).toBe(12);
    expect(migrated.pendingVaultDecision).toBeNull();
  });
});

describe('事件', () => {
  it('bribe：派贿赂事件 + 未翻开梦魇被弃（成败与梦魇只给该给的人）', () => {
    const res = ok(pendingScene(), 'pM', 'masterVaultDecision', ['bribe']);
    const kinds = res.events.map((e) => e.kind);
    expect(kinds).toContain('bribe_dealt');
    const discarded = res.events.find((e) => e.kind === 'nightmare_discarded')!;
    expect(discarded.secret?.to).toEqual(['pM']);
    expect(res.events.some((e) => e.kind === 'nightmare_revealed')).toBe(false);
  });

  it('nightmare：梦魇对所有人翻开并公开记为已发动', () => {
    const res = ok(pendingScene(), 'pM', 'masterVaultDecision', ['nightmare']);
    const revealed = res.events.find((e) => e.kind === 'nightmare_revealed')!;
    expect(revealed.data).toMatchObject({ layer: 2, nightmare: DESPAIR });
    const discarded = res.events.find((e) => e.kind === 'nightmare_discarded')!;
    expect(discarded.secret).toBeUndefined();
    expect(res.events.some((e) => e.kind === 'bribe_dealt')).toBe(false);
  });

  it('金库打开时事件里出现等待梦主的 awaiting_changed', () => {
    const res = ok(soleUnlocker(unlockScene()), 'p1', 'playUnlock', [UNLOCK]);
    const ev = res.events.find((e) => e.kind === 'awaiting_changed')!;
    expect(JSON.stringify(ev.data)).toContain('pendingVaultDecision');
  });
});
