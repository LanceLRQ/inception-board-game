// 预置场景 fixtures
// 对照：plans/design/09-testing-quality.md §9.3.1
//
// 这些 scenarios 是常用对局状态的命名快照，
// 避免在每个测试里重复大量 overrides。

import type { Layer, CardID } from '@icgame/shared';
import type { SetupState } from '../setup.js';
import { createTestState, makePlayer, withHand } from './fixtures.js';

/** 刚完成 setup，进入第 1 回合 draw 阶段的 3 人局 */
export function scenarioStartOfGame3p(): SetupState {
  const ids = ['p1', 'p2', 'pM'];
  const players: Record<string, ReturnType<typeof makePlayer>> = {};
  for (const id of ids) {
    players[id] = makePlayer({
      id,
      nickname: id,
      faction: id === 'pM' ? 'master' : 'thief',
    });
  }
  return createTestState({
    matchId: 'scenario-start-3p',
    players,
    playerOrder: [...ids],
    currentPlayerID: 'p1',
    dreamMasterID: 'pM',
    phase: 'playing',
    turnPhase: 'draw',
    turnNumber: 1,
  });
}

/** 对局中：某玩家在第 3 层且已使用 1 次 SHOOT */
export function scenarioMidGameThiefAtL3(): SetupState {
  const base = scenarioStartOfGame3p();
  const p1 = { ...base.players.p1!, currentLayer: 3 as Layer, shootCount: 1 };
  // 同步 layer.playersInLayer：从 L1 移除 p1，加入 L3
  const layers = {
    ...base.layers,
    1: {
      ...base.layers[1]!,
      playersInLayer: base.layers[1]!.playersInLayer.filter((id) => id !== 'p1'),
    },
    3: { ...base.layers[3]!, playersInLayer: [...base.layers[3]!.playersInLayer, 'p1'] },
  };
  return withHand(
    {
      ...base,
      matchId: 'scenario-thief-at-l3',
      phase: 'playing',
      turnPhase: 'action',
      turnNumber: 5,
      players: { ...base.players, p1 },
      layers,
    },
    'p1',
    ['action_shoot_default' as CardID, 'action_kick' as CardID],
  );
}

/** 贴近胜利条件：盗梦者已开 1 个金库秘密 */
export function scenarioThiefNearWin(): SetupState {
  const base = scenarioStartOfGame3p();
  const vaults = base.vaults.map((v) =>
    v.id === 'v-secret' ? { ...v, isOpened: true, openedBy: 'p1' } : v,
  );
  return {
    ...base,
    matchId: 'scenario-thief-near-win',
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 8,
    vaults,
  };
}

/** 梦主获胜：全部盗梦者死亡 */
export function scenarioMasterWin(): SetupState {
  const base = scenarioStartOfGame3p();
  const dead = (id: string) => ({
    ...base.players[id]!,
    isAlive: false,
    deathTurn: 7,
  });
  return {
    ...base,
    matchId: 'scenario-master-win',
    phase: 'endgame',
    turnPhase: 'turnEnd',
    turnNumber: 9,
    players: {
      ...base.players,
      p1: dead('p1'),
      p2: dead('p2'),
    },
    winner: 'master',
    winReason: 'all_thieves_dead',
  };
}

/**
 * 行动阶段标准场景：3 名玩家（p1/p2 盗梦者 + pM 梦主），
 * 全员位于第 1 层，p1 当前回合，turnPhase=action。
 *
 * 用于 W10 行动牌快照测试基线：每个 move 在该 state 上跑一遍 happy path，
 * 然后 snapshot 切片差异。
 */
export function scenarioActionPhase(): SetupState {
  const ids = ['p1', 'p2', 'pM'];
  const players: Record<string, ReturnType<typeof makePlayer>> = {};
  for (const id of ids) {
    players[id] = makePlayer({
      id,
      nickname: id,
      faction: id === 'pM' ? 'master' : 'thief',
      characterId: (id === 'pM' ? 'dm_fortress' : `thief_${id}`) as CardID,
    });
  }
  const base = createTestState({
    matchId: 'scenario-action-phase',
    rngSeed: 'snapshot-seed',
    players,
    playerOrder: [...ids],
    currentPlayerID: 'p1',
    dreamMasterID: 'pM',
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 1,
  });
  // 同步 layer 1 占位（createTestState 默认 5 人，会留下 p3/p4 幽灵）
  const layers = {
    ...base.layers,
    1: { ...base.layers[1]!, playersInLayer: [...ids] },
  };
  // 默认 deck 装入 20 张可识别牌，方便 graft/time storm 取样
  const deckCards: CardID[] = [];
  for (let i = 0; i < 20; i++) {
    deckCards.push(`action_unlock` as CardID);
  }
  return {
    ...base,
    layers,
    deck: { cards: deckCards, discardPile: [] },
  };
}

/** 应急：空 setup state（用来测 invariant 的 malformed case） */
export function scenarioEmptyState(): SetupState {
  return createTestState({
    players: {},
    playerOrder: [],
    currentPlayerID: '',
    dreamMasterID: '',
    phase: 'setup',
  });
}
