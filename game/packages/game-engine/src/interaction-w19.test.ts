// W19-A 高风险交互组合压测（聚焦子集）
// 对照：plans/tasks.md Phase 3 W19
// 覆盖：
//   1. SHOOT 修饰链优先级（灵雕师 > 天蝎 > 金牛 > 哈雷 > 木星雷霆 > 默认）
//   2. 翻面 × 移形换影 还原一致性（双子/双鱼/露娜 × shift snapshot）
//   3. 胜利条件优先级（秘密金库 > 港口 / 海王星 > 死光 / 牌库耗尽）
//   4. 冥王星·地狱世界观联动（doDraw 抽=D6 + onEnd 手≥6 入迷失）

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from './setup.js';
import {
  findMasterID,
  applyHarborTsunami,
  checkHarborWin,
  checkNeptuneWin,
  applyDarwinEvolution,
  applyGeminiSync,
  applyLunaEclipse,
  shouldJupiterThunderKill,
  applyPlutoHellLostCheck,
  isPlutoHellWorldActive,
} from './engine/skills.js';
import { InceptionCityGame } from './game.js';
import { callMove, expectMoveOk } from './testing/fixtures.js';
import { scenarioStartOfGame3p } from './testing/scenarios.js';

function setMasterCharacter(state: SetupState, characterId: CardID): SetupState {
  const mid = findMasterID(state)!;
  const m = state.players[mid]!;
  return { ...state, players: { ...state.players, [mid]: { ...m, characterId } } };
}

function setCharacter(state: SetupState, playerID: string, characterId: CardID): SetupState {
  const p = state.players[playerID]!;
  return { ...state, players: { ...state.players, [playerID]: { ...p, characterId } } };
}

function setHand(state: SetupState, playerID: string, hand: CardID[]): SetupState {
  const p = state.players[playerID]!;
  return { ...state, players: { ...state.players, [playerID]: { ...p, hand } } };
}

function setLayer(state: SetupState, playerID: string, layer: Layer): SetupState {
  const p = state.players[playerID]!;
  const oldL = p.currentLayer;
  if (oldL === layer) return state;
  const fromL = state.layers[oldL]!;
  const toL = state.layers[layer]!;
  return {
    ...state,
    players: { ...state.players, [playerID]: { ...p, currentLayer: layer } },
    layers: {
      ...state.layers,
      [oldL]: { ...fromL, playersInLayer: fromL.playersInLayer.filter((id) => id !== playerID) },
      [layer]: { ...toL, playersInLayer: [...toL.playersInLayer, playerID] },
    },
  };
}

function setActionPhase(state: SetupState, currentPlayerID: string): SetupState {
  return { ...state, turnPhase: 'action', currentPlayerID };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ENDIF = (InceptionCityGame as any).endIf as (arg: {
  G: SetupState;
}) => { winner: string; reason: string } | undefined;

function setVaultOpened(state: SetupState, vaultIndex: number, openedBy: string): SetupState {
  return {
    ...state,
    vaults: state.vaults.map((v, i) => (i === vaultIndex ? { ...v, isOpened: true, openedBy } : v)),
  };
}

describe('W19-A · 胜利条件优先级仲裁', () => {
  it('秘密金库已开 → thief 胜（优先于梦主胜利）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    const secretIdx = s.vaults.findIndex((v) => v.contentType === 'secret');
    const coinIdxs = s.vaults
      .map((v, i) => (v.contentType === 'coin' ? i : -1))
      .filter((i) => i >= 0);
    s = setVaultOpened(s, secretIdx, 'p1');
    s = setVaultOpened(s, coinIdxs[0]!, 'p1');
    s = setVaultOpened(s, coinIdxs[1]!, 'p1');
    // 同时满足港口 / 海王星条件，但秘密优先
    const result = ENDIF({ G: s });
    expect(result?.winner).toBe('thief');
    expect(result?.reason).toBe('secret_vault_opened');
  });

  it('港口：≥2 金币金库开 + 秘密未开 → master 胜', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    const coinIdxs = s.vaults
      .map((v, i) => (v.contentType === 'coin' ? i : -1))
      .filter((i) => i >= 0);
    s = setVaultOpened(s, coinIdxs[0]!, 'p1');
    s = setVaultOpened(s, coinIdxs[1]!, 'p1');
    const result = ENDIF({ G: s });
    expect(result?.winner).toBe('master');
    expect(result?.reason).toBe('harbor_two_vaults');
  });

  it('海王星：金币金库开 → master 胜（即使只 1 个）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_neptune_ocean');
    const coinIdx = s.vaults.findIndex((v) => v.contentType === 'coin');
    s = setVaultOpened(s, coinIdx, 'p1');
    const result = ENDIF({ G: s });
    expect(result?.winner).toBe('master');
    expect(result?.reason).toBe('neptune_coin_opened');
  });

  it('all_thieves_dead 优先于港口 / 海王星', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    const coinIdxs = s.vaults
      .map((v, i) => (v.contentType === 'coin' ? i : -1))
      .filter((i) => i >= 0);
    s = setVaultOpened(s, coinIdxs[0]!, 'p1');
    s = setVaultOpened(s, coinIdxs[1]!, 'p1');
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, isAlive: false, deathTurn: 5 },
        p2: { ...s.players.p2!, isAlive: false, deathTurn: 5 },
      },
    };
    const result = ENDIF({ G: s });
    expect(result?.winner).toBe('master');
    expect(result?.reason).toBe('all_thieves_dead');
  });

  it('正常对局：无胜利条件 → undefined', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
    // 填满牌库以避免 deck_exhausted 触发
    s = { ...s, deck: { cards: Array(20).fill('action_unlock') as CardID[], discardPile: [] } };
    const result = ENDIF({ G: s });
    expect(result).toBeUndefined();
  });
});

describe('W19-A · 翻面 × 移形换影 交叉一致性', () => {
  it('双子翻面后被移形换影 → shiftSnapshot 记录翻面后的角色', () => {
    let s = scenarioStartOfGame3p();
    s = setActionPhase(s, 'p1');
    s = setCharacter(s, 'p1', 'thief_gemini_back'); // p1 已翻到背面
    s = setCharacter(s, 'p2', 'thief_apollo');
    s = setHand(s, 'p1', ['action_shift' as CardID]);
    const r = callMove(s, 'playShift', ['action_shift', 'p2'], { currentPlayer: 'p1' });
    expectMoveOk(r);
    // 角色互换
    expect(r.players.p1!.characterId).toBe('thief_apollo');
    expect(r.players.p2!.characterId).toBe('thief_gemini_back');
    // snapshot 记录原状态
    expect(r.shiftSnapshot!.p1).toBe('thief_gemini_back');
    expect(r.shiftSnapshot!.p2).toBe('thief_apollo');
  });

  it('露娜·月蚀：弃 2 SHOOT 杀同层 + 翻面', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_luna');
    s = setHand(s, 'p1', ['action_shoot' as CardID, 'action_shoot' as CardID]);
    s = setActionPhase(s, 'p1');
    // p2 同层（默认 L1）
    const r = applyLunaEclipse(s, 'p1', ['action_shoot', 'action_shoot'], 'p2');
    expect(r).not.toBeNull();
    expect(r!.players.p1!.characterId).toBe('thief_luna_back');
    expect(r!.players.p2!.isAlive).toBe(false);
  });

  it('双子·命运：roll=3 → 减 2 心锁 + 翻面', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_gemini');
    s = setLayer(s, 'pM', 3 as Layer); // master 必须高于 player
    const beforeHL = s.layers[1]!.heartLockValue;
    const r = applyGeminiSync(s, 'p1', 3);
    expect(r).not.toBeNull();
    expect(r!.layers[1]!.heartLockValue).toBe(Math.max(0, beforeHL - 2));
    expect(r!.players.p1!.characterId).toBe('thief_gemini_back');
  });
});

describe('W19-A · SHOOT 修饰链优先级（多角色叠加）', () => {
  it('木星·巅峰梦主使用 SHOOT 同层 → 默认结算 + 雷霆 override（roll<层）', () => {
    // 设置：梦主在 L4，target 在 L4，roll=1 → 即使 base 是 move 也变 kill
    let s = scenarioStartOfGame3p();
    s = setMasterCharacter(s, 'dm_jupiter_peak');
    s = setLayer(s, 'pM', 4 as Layer);
    s = setLayer(s, 'p1', 4 as Layer);
    s = setHand(s, 'pM', ['action_shoot' as CardID]);
    s = setActionPhase(s, 'pM');
    // base D6=2 (target moves)，但雷霆判定 2<4 → kill
    const r = callMove(s, 'playShoot', ['p1', 'action_shoot'], {
      currentPlayer: 'pM',
      rolls: [2],
    });
    expectMoveOk(r);
    expect(r.players.p1!.isAlive).toBe(false);
  });

  it('木星·巅峰梦主跨相邻层 SHOOT → 校验放宽', () => {
    let s = scenarioStartOfGame3p();
    s = setMasterCharacter(s, 'dm_jupiter_peak');
    s = setLayer(s, 'pM', 3 as Layer);
    s = setLayer(s, 'p1', 4 as Layer);
    s = setHand(s, 'pM', ['action_shoot' as CardID]);
    s = setActionPhase(s, 'pM');
    // 跨相邻层 + roll=2 (base move)，雷霆 2<3 → kill
    const r = callMove(s, 'playShoot', ['p1', 'action_shoot'], {
      currentPlayer: 'pM',
      rolls: [2],
    });
    expectMoveOk(r);
    expect(r.players.p1!.isAlive).toBe(false);
  });

  it('木星·巅峰梦主跨 2 层 SHOOT → INVALID（巅峰只放宽相邻）', () => {
    let s = scenarioStartOfGame3p();
    s = setMasterCharacter(s, 'dm_jupiter_peak');
    s = setLayer(s, 'pM', 1 as Layer);
    s = setLayer(s, 'p1', 3 as Layer);
    s = setHand(s, 'pM', ['action_shoot' as CardID]);
    s = setActionPhase(s, 'pM');
    const r = callMove(s, 'playShoot', ['p1', 'action_shoot'], {
      currentPlayer: 'pM',
      rolls: [4],
    });
    expect(r).toBe('INVALID_MOVE');
  });

  it('shouldJupiterThunderKill 单元判定一致', () => {
    expect(shouldJupiterThunderKill('dm_jupiter_peak', 4, 3)).toBe(true);
    expect(shouldJupiterThunderKill('dm_jupiter_peak', 4, 4)).toBe(false);
    expect(shouldJupiterThunderKill('dm_jupiter_peak', 1, 1)).toBe(false);
  });
});

describe('W19-A · 港口·海啸 联动', () => {
  it('海啸杀了 p1 + 检查胜利条件（≥2 金库胜）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    const coinIdxs = s.vaults
      .map((v, i) => (v.contentType === 'coin' ? i : -1))
      .filter((i) => i >= 0);
    // 先开 2 个金币金库 → checkHarborWin 应 true
    s = setVaultOpened(s, coinIdxs[0]!, 'p1');
    s = setVaultOpened(s, coinIdxs[1]!, 'p1');
    expect(checkHarborWin(s)).toBe(true);
    // 同时海啸杀全员（不影响胜利判断）
    const r = applyHarborTsunami(s, [1, 1]);
    expect(r.players.p1!.isAlive).toBe(false);
    expect(r.players.p2!.isAlive).toBe(false);
    expect(checkHarborWin(r)).toBe(true);
  });

  it('海啸不影响海王星胜利判定（互斥梦主）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_neptune_ocean');
    expect(checkNeptuneWin(s)).toBe(false);
    const coinIdx = s.vaults.findIndex((v) => v.contentType === 'coin');
    s = setVaultOpened(s, coinIdx, 'p1');
    expect(checkNeptuneWin(s)).toBe(true);
    // 海啸是港口梦主技能，海王星梦主不会触发
    const r = applyHarborTsunami(s, [1, 1]);
    expect(r).toBe(s);
  });
});

describe('W19-A · 冥王星·地狱世界观（doDraw + onEnd 联动）', () => {
  it('完整链路：doDraw 抽=D6=6 → 手牌≥6 → 触发 onEnd 入迷失', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    s = { ...s, turnPhase: 'draw', currentPlayerID: 'p1' };
    s = setHand(s, 'p1', []);
    const cards: CardID[] = Array.from({ length: 10 }, () => 'action_unlock' as CardID);
    s = { ...s, deck: { cards, discardPile: [] } };
    // 抽 D6=6 → 手牌 6
    const drawn = callMove(s, 'doDraw', [], { currentPlayer: 'p1', rolls: [6] });
    expectMoveOk(drawn);
    expect(drawn.players.p1!.hand.length).toBe(6);
    // 模拟 onEnd hook
    const ended = applyPlutoHellLostCheck(drawn, 'p1');
    expect(ended.players.p1!.currentLayer).toBe(0);
  });

  it('doDraw 抽=D6=3 → 手牌 3 → onEnd 不入迷失', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    s = { ...s, turnPhase: 'draw', currentPlayerID: 'p1' };
    s = setHand(s, 'p1', []);
    const cards: CardID[] = Array.from({ length: 10 }, () => 'action_unlock' as CardID);
    s = { ...s, deck: { cards, discardPile: [] } };
    const drawn = callMove(s, 'doDraw', [], { currentPlayer: 'p1', rolls: [3] });
    expectMoveOk(drawn);
    expect(drawn.players.p1!.hand.length).toBe(3);
    const ended = applyPlutoHellLostCheck(drawn, 'p1');
    expect(ended.players.p1!.currentLayer).toBe(1);
  });

  it('isPlutoHellWorldActive + 标志位一致', () => {
    const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    expect(isPlutoHellWorldActive(s)).toBe(true);
  });

  it('梦主自己抽牌不受 D6 影响（仅盗梦者）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    s = { ...s, turnPhase: 'draw', currentPlayerID: 'pM' };
    s = setHand(s, 'pM', []);
    const cards: CardID[] = Array.from({ length: 10 }, () => 'action_unlock' as CardID);
    s = { ...s, deck: { cards, discardPile: [] } };
    const drawn = callMove(s, 'doDraw', [], { currentPlayer: 'pM' });
    expectMoveOk(drawn);
    // 梦主抽 BASE_DRAW_COUNT=2，不是 D6
    expect(drawn.players.pM!.hand.length).toBe(2);
  });
});

describe('W19-A · 达尔文·进化 + 木星 SHOOT', () => {
  it('达尔文进化展示 4 张 + 木星梦主 SHOOT 雷霆击杀', () => {
    let s = scenarioStartOfGame3p();
    s = setMasterCharacter(s, 'dm_jupiter_peak');
    s = setCharacter(s, 'p1', 'thief_darwin');
    s = setLayer(s, 'pM', 4 as Layer);
    s = setLayer(s, 'p1', 4 as Layer);
    s = setHand(s, 'p1', []);
    s = {
      ...s,
      deck: {
        cards: ['action_unlock', 'action_unlock', 'action_kick', 'action_shoot'] as CardID[],
        discardPile: [],
      },
    };
    // 达尔文进化：抽 2 张，把其中 2 张放回（这里把抽到的两张 unlock 放回，留 0 在手）
    const evolved = applyDarwinEvolution(s, 'p1', ['action_unlock', 'action_unlock']);
    expect(evolved).not.toBeNull();
    // 抽 2 + 弃 2（放回牌库），手牌净变化 0
    expect(evolved!.players.p1!.hand.length).toBe(0);
    // 然后木星梦主对 p1 SHOOT，base roll=2，雷霆 2<4 → kill
    let s2 = setHand(evolved!, 'pM', ['action_shoot' as CardID]);
    s2 = setActionPhase(s2, 'pM');
    const r = callMove(s2, 'playShoot', ['p1', 'action_shoot'], {
      currentPlayer: 'pM',
      rolls: [2],
    });
    expectMoveOk(r);
    expect(r.players.p1!.isAlive).toBe(false);
  });
});
