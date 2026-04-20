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
  applyFortressDiceModifier,
  applyExtractorBounty,
  applyInterpreterForeshadow,
  isHarborWorldActive,
  isMarsBattlefieldWorldActive,
  libraValidateSplit,
  libraResolvePick,
  canSaturnFreeMove,
  canMarsKill,
  canImperialPickBribe,
  applySecretPassageTeleport,
  getSecretPassageUsesLeft,
  applySudgerVerdict,
  applyScorpiusPoison,
  applyTaurusHorn,
  applySoulSculptorCarve,
  applyHaleyImpact,
  isVirgoPerfectTriggered,
  isShootClassCard,
  jokerDrawCount,
  isTerroristCrossLayerActive,
  canPiscesEvade,
  isAquariusUnlimitedActive,
  canGreenRayActivate,
  isJupiterPeakLayerOK,
  checkAthenaAweCondition,
  canUseTouristAssist,
  isCapricornusRhythmActive,
  applyChemistRefine,
  applyTouristAssist,
  applyLeoKingdom,
  applyBlackHoleLevy,
  applyUranusPower,
  getUranusPowerUsesLeft,
  applyPlutoBurning,
  isUranusFirmamentWorldActive,
  applyAthenaWit,
  applyShadeFollow,
  applySaturnFreeMove,
  canUseSaturnFreeMoveThisTurn,
  applyUranusFirmamentMoveDiscard,
  applyMarsBattlefieldExchange,
  applyMarsKillDiscardUnlock,
  applySaturnDecree,
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

// ============================================================================
// R29 · W19-A 交互矩阵扩充（第二批）
// 对照：plans/tasks.md Phase 3 W19
// 聚焦子集：胜利条件更多边界 / 雷霆层差闭包 / 冥王星手牌边界 / 多梦主联动
// ============================================================================
describe('W19-A · 胜利优先级更多边界（R29）', () => {
  it('秘密金库已开 + all_thieves_dead → thief 仍胜（秘密优先级最高）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    const secretIdx = s.vaults.findIndex((v) => v.contentType === 'secret');
    s = setVaultOpened(s, secretIdx, 'p1');
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, isAlive: false, deathTurn: 5 },
        p2: { ...s.players.p2!, isAlive: false, deathTurn: 5 },
      },
    };
    const result = ENDIF({ G: s });
    expect(result?.winner).toBe('thief');
    expect(result?.reason).toBe('secret_vault_opened');
  });

  it('港口：恰好 1 个金币金库 → 不触发胜利（阈值 ≥2）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    const coinIdx = s.vaults.findIndex((v) => v.contentType === 'coin');
    s = setVaultOpened(s, coinIdx, 'p1');
    // 填满牌库避免 deck_exhausted
    s = { ...s, deck: { cards: Array(20).fill('action_unlock') as CardID[], discardPile: [] } };
    const result = ENDIF({ G: s });
    expect(result).toBeUndefined();
  });

  it('海王星：秘密已开时仍 thief 胜（秘密优先于梦主）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_neptune_ocean');
    const secretIdx = s.vaults.findIndex((v) => v.contentType === 'secret');
    const coinIdx = s.vaults.findIndex((v) => v.contentType === 'coin');
    s = setVaultOpened(s, secretIdx, 'p1');
    s = setVaultOpened(s, coinIdx, 'p1');
    const result = ENDIF({ G: s });
    expect(result?.winner).toBe('thief');
    expect(result?.reason).toBe('secret_vault_opened');
  });

  it('checkHarborWin / checkNeptuneWin 单元判定与 endIf 一致', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    const coinIdxs = s.vaults
      .map((v, i) => (v.contentType === 'coin' ? i : -1))
      .filter((i) => i >= 0);
    s = setVaultOpened(s, coinIdxs[0]!, 'p1');
    s = setVaultOpened(s, coinIdxs[1]!, 'p1');
    expect(checkHarborWin(s)).toBe(true);
    // 切到海王星
    let s2 = setMasterCharacter(scenarioStartOfGame3p(), 'dm_neptune_ocean');
    s2 = setVaultOpened(
      s2,
      s2.vaults.findIndex((v) => v.contentType === 'coin'),
      'p1',
    );
    expect(checkNeptuneWin(s2)).toBe(true);
  });

  it('无角色梦主（dm_fortress）+ ≥2 金币金库开 → 不触发港口胜利（仅 dm_harbor 生效）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
    const coinIdxs = s.vaults
      .map((v, i) => (v.contentType === 'coin' ? i : -1))
      .filter((i) => i >= 0);
    s = setVaultOpened(s, coinIdxs[0]!, 'p1');
    s = setVaultOpened(s, coinIdxs[1]!, 'p1');
    s = { ...s, deck: { cards: Array(20).fill('action_unlock') as CardID[], discardPile: [] } };
    const result = ENDIF({ G: s });
    expect(result).toBeUndefined();
  });
});

describe('W19-A · 木星雷霆层差矩阵（R29）', () => {
  // 签名：shouldJupiterThunderKill(shooterCharacter, shooterLayer, finalRoll)
  it('roll=层数 → 不杀（严格小于）', () => {
    expect(shouldJupiterThunderKill('dm_jupiter_peak', 3, 3)).toBe(false);
  });

  it('roll<层数 → 杀', () => {
    expect(shouldJupiterThunderKill('dm_jupiter_peak', 2, 1)).toBe(true);
    expect(shouldJupiterThunderKill('dm_jupiter_peak', 4, 3)).toBe(true);
  });

  it('roll>层数 → 不杀', () => {
    expect(shouldJupiterThunderKill('dm_jupiter_peak', 2, 5)).toBe(false);
    expect(shouldJupiterThunderKill('dm_jupiter_peak', 4, 6)).toBe(false);
  });

  it('非木星角色 → 永远不杀（独占效果）', () => {
    expect(shouldJupiterThunderKill('dm_harbor', 4, 1)).toBe(false);
    expect(shouldJupiterThunderKill('dm_fortress', 4, 1)).toBe(false);
  });

  it('shooterLayer=0（迷失层）→ 永远不杀（守卫）', () => {
    expect(shouldJupiterThunderKill('dm_jupiter_peak', 0, 1)).toBe(false);
    expect(shouldJupiterThunderKill('dm_jupiter_peak', 0, 0)).toBe(false);
  });
});

describe('W19-A · 冥王星·地狱手牌边界（R29）', () => {
  // applyPlutoHellLostCheck 返回 SetupState：hand<阈值 / 无世界观 / 已在迷失 → 返回原状态
  // hand>=阈值 且在非迷失层 → 返回新状态（currentLayer=0）
  it('手牌 = 5（阈值-1）→ currentLayer 不变（非迷失层）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    s = setHand(s, 'p1', Array(5).fill('action_unlock') as CardID[]);
    const beforeLayer = s.players.p1!.currentLayer;
    const r = applyPlutoHellLostCheck(s, 'p1');
    expect(r.players.p1!.currentLayer).toBe(beforeLayer);
  });

  it('手牌 = 6（阈值）→ currentLayer 变为 0（迷失层）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    s = setLayer(s, 'p1', 2 as Layer);
    s = setHand(s, 'p1', Array(6).fill('action_unlock') as CardID[]);
    const r = applyPlutoHellLostCheck(s, 'p1');
    expect(r.players.p1!.currentLayer).toBe(0);
  });

  it('手牌 = 7（阈值+1）→ currentLayer 变为 0', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    s = setLayer(s, 'p1', 3 as Layer);
    s = setHand(s, 'p1', Array(7).fill('action_unlock') as CardID[]);
    const r = applyPlutoHellLostCheck(s, 'p1');
    expect(r.players.p1!.currentLayer).toBe(0);
  });

  it('非冥王星梦主 + 手牌 8 → currentLayer 不变', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
    s = setLayer(s, 'p1', 2 as Layer);
    s = setHand(s, 'p1', Array(8).fill('action_unlock') as CardID[]);
    expect(isPlutoHellWorldActive(s)).toBe(false);
    const r = applyPlutoHellLostCheck(s, 'p1');
    expect(r.players.p1!.currentLayer).toBe(2);
  });

  it('冥王星 + 手牌≥阈值 但已在迷失层 → currentLayer 保持 0（幂等守卫）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    // 直接设置 currentLayer=0（避开 setLayer 对 layer 0 的依赖）
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, currentLayer: 0 as Layer } },
    };
    s = setHand(s, 'p1', Array(6).fill('action_unlock') as CardID[]);
    const r = applyPlutoHellLostCheck(s, 'p1');
    expect(r.players.p1!.currentLayer).toBe(0);
  });
});

describe('W19-A · 港口·海啸与胜利判定（R29）', () => {
  it('海啸后所有盗梦者仍存活 + 2 金库已开 → master 胜（港口）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    const coinIdxs = s.vaults
      .map((v, i) => (v.contentType === 'coin' ? i : -1))
      .filter((i) => i >= 0);
    s = setVaultOpened(s, coinIdxs[0]!, 'p1');
    s = setVaultOpened(s, coinIdxs[1]!, 'p1');
    // 海啸：1 轮掷骰（每个盗梦者）→ 决定是否入迷失（此处 rolls 给 [1,1] 即两盗梦者都失败）
    const tsunamid = applyHarborTsunami(s, [1, 1]);
    const result = ENDIF({ G: tsunamid });
    // 港口胜利条件已满足（2 金库）→ master 胜
    expect(result?.winner).toBe('master');
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

// ============================================================================
// R30 · W19-A 交互矩阵扩充（第三批）
// 聚焦子集：世界观激活守卫 / 骰子修饰器 / 解封后被动抽牌 / 港口海啸边界
// ============================================================================
describe('W19-A · 世界观激活守卫（R30）', () => {
  it('isHarborWorldActive：dm_harbor → true / 其他 → false', () => {
    const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    expect(isHarborWorldActive(s)).toBe(true);
    const s2 = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
    expect(isHarborWorldActive(s2)).toBe(false);
  });

  it('isPlutoHellWorldActive：dm_pluto_hell → true / 其他 → false', () => {
    const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    expect(isPlutoHellWorldActive(s)).toBe(true);
    const s2 = setMasterCharacter(scenarioStartOfGame3p(), 'dm_neptune_ocean');
    expect(isPlutoHellWorldActive(s2)).toBe(false);
  });

  it('isMarsBattlefieldWorldActive：dm_mars_battlefield → true / 其他 → false', () => {
    const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    expect(isMarsBattlefieldWorldActive(s)).toBe(true);
    const s2 = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    expect(isMarsBattlefieldWorldActive(s2)).toBe(false);
  });
});

describe('W19-A · 要塞骰子修饰器 clamp（R30）', () => {
  it('applyFortressDiceModifier：roll=6 → 5（-1）', () => {
    expect(applyFortressDiceModifier(6)).toBe(5);
  });

  it('applyFortressDiceModifier：roll=1 → 1（下限守卫）', () => {
    expect(applyFortressDiceModifier(1)).toBe(1);
  });

  it('applyFortressDiceModifier：roll=0（非法）→ 1（下限守卫）', () => {
    expect(applyFortressDiceModifier(0)).toBe(1);
  });
});

describe('W19-A · 港口·海啸骰值矩阵（R30）', () => {
  it('roll=6 → 盗梦者幸免（不杀）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    // 2 名盗梦者 p1 / p2
    s = applyHarborTsunami(s, [6, 6]);
    expect(s.players.p1!.isAlive).toBe(true);
    expect(s.players.p2!.isAlive).toBe(true);
  });

  it('roll=1..5 → 死亡入迷失层', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    s = applyHarborTsunami(s, [3, 5]);
    expect(s.players.p1!.isAlive).toBe(false);
    expect(s.players.p2!.isAlive).toBe(false);
    expect(s.players.p1!.currentLayer).toBe(0);
    expect(s.players.p2!.currentLayer).toBe(0);
  });

  it('混合骰：一人幸免一人死', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    s = applyHarborTsunami(s, [6, 2]);
    expect(s.players.p1!.isAlive).toBe(true);
    expect(s.players.p2!.isAlive).toBe(false);
  });

  it('非 dm_harbor 梦主 → 海啸不生效（守卫）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
    const before = { p1Alive: s.players.p1!.isAlive, p2Alive: s.players.p2!.isAlive };
    s = applyHarborTsunami(s, [1, 1]);
    expect(s.players.p1!.isAlive).toBe(before.p1Alive);
    expect(s.players.p2!.isAlive).toBe(before.p2Alive);
  });
});

describe('W19-A · 解封后被动抽牌（R30）', () => {
  it('译梦师·先知：applyInterpreterForeshadow 抽 2', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_dream_interpreter');
    s = setHand(s, 'p1', []);
    s = { ...s, deck: { cards: Array(10).fill('action_unlock') as CardID[], discardPile: [] } };
    const r = applyInterpreterForeshadow(s, 'p1');
    expect(r.players.p1!.hand.length).toBe(2);
  });

  it('译梦师·先知：非译梦师角色 → 不生效', () => {
    let s = scenarioStartOfGame3p();
    s = setHand(s, 'p1', []);
    s = { ...s, deck: { cards: Array(10).fill('action_unlock') as CardID[], discardPile: [] } };
    const r = applyInterpreterForeshadow(s, 'p1');
    expect(r.players.p1!.hand.length).toBe(0);
  });

  it('梦境猎手·满载：applyExtractorBounty 抽=当层心锁', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_extractor');
    s = setHand(s, 'p1', []);
    s = { ...s, deck: { cards: Array(10).fill('action_unlock') as CardID[], discardPile: [] } };
    const hl = s.layers[s.players.p1!.currentLayer]!.heartLockValue;
    const r = applyExtractorBounty(s, 'p1');
    expect(r.players.p1!.hand.length).toBe(hl);
  });

  it('梦境猎手·满载：当层心锁=0 → 不抽', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_extractor');
    s = setHand(s, 'p1', []);
    const lyr = s.players.p1!.currentLayer;
    // 强行设心锁为 0
    s = {
      ...s,
      layers: { ...s.layers, [lyr]: { ...s.layers[lyr]!, heartLockValue: 0 } },
    };
    s = { ...s, deck: { cards: Array(10).fill('action_unlock') as CardID[], discardPile: [] } };
    const r = applyExtractorBounty(s, 'p1');
    expect(r.players.p1!.hand.length).toBe(0);
  });
});

// ============================================================================
// R31 · W19-A 交互矩阵扩充（第四批）
// 聚焦子集：天秤分堆仲裁 / 土星领地免费移动守卫 / 火星杀戮守卫
// ============================================================================
describe('W19-A · 天秤·平衡分堆仲裁（R31）', () => {
  it('libraValidateSplit：合法分堆（multiset 一致）', () => {
    const hand = ['action_unlock', 'action_shoot', 'action_shift'] as CardID[];
    const p1 = ['action_unlock'] as CardID[];
    const p2 = ['action_shoot', 'action_shift'] as CardID[];
    expect(libraValidateSplit(hand, p1, p2)).toBe(true);
  });

  it('libraValidateSplit：总数不符 → false', () => {
    const hand = ['action_unlock', 'action_shoot'] as CardID[];
    const p1 = ['action_unlock'] as CardID[];
    const p2 = ['action_shoot', 'action_shift'] as CardID[];
    expect(libraValidateSplit(hand, p1, p2)).toBe(false);
  });

  it('libraValidateSplit：牌型错配（伪造新牌）→ false', () => {
    const hand = ['action_unlock', 'action_shoot'] as CardID[];
    const p1 = ['action_unlock'] as CardID[];
    const p2 = ['action_shift'] as CardID[];
    expect(libraValidateSplit(hand, p1, p2)).toBe(false);
  });

  it('libraValidateSplit：空手牌两空堆 → true', () => {
    expect(libraValidateSplit([] as CardID[], [] as CardID[], [] as CardID[])).toBe(true);
  });

  it('libraResolvePick：self 选 pile1 → selfGets=pile1 / targetGets=pile2', () => {
    const split = {
      pile1: ['action_unlock'] as CardID[],
      pile2: ['action_shoot', 'action_shift'] as CardID[],
    };
    const r = libraResolvePick(split, 'pile1');
    expect(r.selfGets).toEqual(['action_unlock']);
    expect(r.targetGets).toEqual(['action_shoot', 'action_shift']);
  });

  it('libraResolvePick：self 选 pile2 → selfGets=pile2 / targetGets=pile1', () => {
    const split = {
      pile1: ['action_unlock'] as CardID[],
      pile2: ['action_shoot'] as CardID[],
    };
    const r = libraResolvePick(split, 'pile2');
    expect(r.selfGets).toEqual(['action_shoot']);
    expect(r.targetGets).toEqual(['action_unlock']);
  });
});

describe('W19-A · 土星领地免费移动守卫（R31）', () => {
  it('非 dm_saturn_territory 梦主 → false', () => {
    const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    expect(canSaturnFreeMove(s, 'p1')).toBe(false);
  });

  it('土星梦主 + 盗梦者无贿赂 → false', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, bribeReceived: 0 } },
    };
    expect(canSaturnFreeMove(s, 'p1')).toBe(false);
  });

  it('土星梦主 + 盗梦者持贿赂 → true', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, bribeReceived: 1 } },
    };
    expect(canSaturnFreeMove(s, 'p1')).toBe(true);
  });

  it('土星梦主 + 死亡盗梦者 → false（守卫）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, bribeReceived: 1, isAlive: false },
      },
    };
    expect(canSaturnFreeMove(s, 'p1')).toBe(false);
  });
});

describe('W19-A · 火星·战场杀戮守卫（R31）', () => {
  it('非 dm_mars_battlefield 梦主 → false', () => {
    const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    expect(canMarsKill(s, findMasterID(s)!)).toBe(false);
  });

  it('火星梦主 + 手牌无解封 → false', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    s = setHand(s, findMasterID(s)!, ['action_shoot' as CardID]);
    expect(canMarsKill(s, findMasterID(s)!)).toBe(false);
  });

  it('火星梦主 + 手牌有解封 → true', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    s = setHand(s, findMasterID(s)!, ['action_unlock' as CardID]);
    expect(canMarsKill(s, findMasterID(s)!)).toBe(true);
  });

  it('火星梦主 + 混合手牌含解封 → true', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    s = setHand(s, findMasterID(s)!, [
      'action_shoot' as CardID,
      'action_unlock' as CardID,
      'action_shift' as CardID,
    ]);
    expect(canMarsKill(s, findMasterID(s)!)).toBe(true);
  });
});

// ============================================================================
// R32 · W19-A 交互矩阵扩充（第五批）
// 聚焦子集：皇城·重金 守卫 / 密道·传送 happy path + 守卫 + 次数计量
// ============================================================================
// 辅助：填入一个 inPool 贿赂，用于皇城测试（scenarioStartOfGame3p 默认 bribePool=[]）
function withInPoolBribe(state: SetupState): SetupState {
  return {
    ...state,
    bribePool: [
      {
        id: 'bribe-test-0',
        status: 'inPool',
        heldBy: null,
        originalOwnerId: null,
      },
    ],
  };
}

describe('W19-A · 皇城·重金派发贿赂守卫（R32）', () => {
  it('非 dm_imperial_city 梦主 → false', () => {
    const s = withInPoolBribe(setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor'));
    expect(canImperialPickBribe(s, findMasterID(s)!, 'p1', 0)).toBe(false);
  });

  it('皇城梦主 + 合法目标 + pool[0]=inPool → true', () => {
    const s = withInPoolBribe(setMasterCharacter(scenarioStartOfGame3p(), 'dm_imperial_city'));
    expect(canImperialPickBribe(s, findMasterID(s)!, 'p1', 0)).toBe(true);
  });

  it('皇城梦主 + 目标为梦主自己（非 thief）→ false', () => {
    const s = withInPoolBribe(setMasterCharacter(scenarioStartOfGame3p(), 'dm_imperial_city'));
    const mid = findMasterID(s)!;
    expect(canImperialPickBribe(s, mid, mid, 0)).toBe(false);
  });

  it('皇城梦主 + 目标死亡 → false', () => {
    let s = withInPoolBribe(setMasterCharacter(scenarioStartOfGame3p(), 'dm_imperial_city'));
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, isAlive: false } },
    };
    expect(canImperialPickBribe(s, findMasterID(s)!, 'p1', 0)).toBe(false);
  });

  it('皇城梦主 + poolIndex 越界（负数 / 超大）→ false', () => {
    const s = withInPoolBribe(setMasterCharacter(scenarioStartOfGame3p(), 'dm_imperial_city'));
    const mid = findMasterID(s)!;
    expect(canImperialPickBribe(s, mid, 'p1', -1)).toBe(false);
    expect(canImperialPickBribe(s, mid, 'p1', 9999)).toBe(false);
  });

  it('皇城梦主 + pool[0].status=dealt → false（不可重复派发）', () => {
    let s = withInPoolBribe(setMasterCharacter(scenarioStartOfGame3p(), 'dm_imperial_city'));
    s = {
      ...s,
      bribePool: s.bribePool.map((b, i) => (i === 0 ? { ...b, status: 'dealt' as const } : b)),
    };
    expect(canImperialPickBribe(s, findMasterID(s)!, 'p1', 0)).toBe(false);
  });
});

describe('W19-A · 密道·传送 happy path + 守卫（R32）', () => {
  it('非 dm_secret_passage 梦主 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    const mid = findMasterID(s)!;
    s = setHand(s, mid, ['action_dream_transit' as CardID]);
    const r = applySecretPassageTeleport(s, mid, 'p1', 'action_dream_transit' as CardID);
    expect(r).toBeNull();
  });

  it('密道梦主 + 手牌有 action_dream_transit + 目标合法 → 成功送到迷失层', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_secret_passage');
    const mid = findMasterID(s)!;
    s = setHand(s, mid, ['action_dream_transit' as CardID]);
    const r = applySecretPassageTeleport(s, mid, 'p1', 'action_dream_transit' as CardID);
    expect(r).not.toBeNull();
    expect(r!.players.p1!.currentLayer).toBe(0);
    // 手牌中穿梭剂被弃
    expect(r!.players[mid]!.hand.includes('action_dream_transit' as CardID)).toBe(false);
  });

  it('密道梦主 + 手牌无穿梭剂 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_secret_passage');
    const mid = findMasterID(s)!;
    s = setHand(s, mid, ['action_shoot' as CardID]);
    const r = applySecretPassageTeleport(s, mid, 'p1', 'action_dream_transit' as CardID);
    expect(r).toBeNull();
  });

  it('密道梦主 + 传错牌 ID（非 action_dream_transit）→ null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_secret_passage');
    const mid = findMasterID(s)!;
    s = setHand(s, mid, ['action_unlock' as CardID]);
    const r = applySecretPassageTeleport(s, mid, 'p1', 'action_unlock' as CardID);
    expect(r).toBeNull();
  });

  it('密道梦主 + 目标是梦主自己（非 thief）→ null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_secret_passage');
    const mid = findMasterID(s)!;
    s = setHand(s, mid, ['action_dream_transit' as CardID]);
    const r = applySecretPassageTeleport(s, mid, mid, 'action_dream_transit' as CardID);
    expect(r).toBeNull();
  });

  it('密道梦主 + 目标死亡盗梦者 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_secret_passage');
    const mid = findMasterID(s)!;
    s = setHand(s, mid, ['action_dream_transit' as CardID]);
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, isAlive: false } },
    };
    const r = applySecretPassageTeleport(s, mid, 'p1', 'action_dream_transit' as CardID);
    expect(r).toBeNull();
  });
});

describe('W19-A · 密道·传送次数计量（R32）', () => {
  it('getSecretPassageUsesLeft：非密道梦主 → 0', () => {
    const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    const mid = findMasterID(s)!;
    expect(getSecretPassageUsesLeft(s.players[mid]!)).toBe(0);
  });

  it('getSecretPassageUsesLeft：密道梦主 0 用 → 2', () => {
    const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_secret_passage');
    const mid = findMasterID(s)!;
    expect(getSecretPassageUsesLeft(s.players[mid]!)).toBe(2);
  });

  it('getSecretPassageUsesLeft：密道梦主 用 1 次 → 1', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_secret_passage');
    const mid = findMasterID(s)!;
    s = {
      ...s,
      players: {
        ...s.players,
        [mid]: {
          ...s.players[mid]!,
          skillUsedThisTurn: { 'dm_secret_passage.skill_0': 1 },
        },
      },
    };
    expect(getSecretPassageUsesLeft(s.players[mid]!)).toBe(1);
  });

  it('getSecretPassageUsesLeft：密道梦主 用 2 次 → 0（上限）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_secret_passage');
    const mid = findMasterID(s)!;
    s = {
      ...s,
      players: {
        ...s.players,
        [mid]: {
          ...s.players[mid]!,
          skillUsedThisTurn: { 'dm_secret_passage.skill_0': 2 },
        },
      },
    };
    expect(getSecretPassageUsesLeft(s.players[mid]!)).toBe(0);
  });
});

// ============================================================================
// R33 · W19-A 交互矩阵扩充（第六批 · 纯函数批量）
// 聚焦子集：SHOOT 修饰链纯函数 / 角色触发纯判定 / 骰值 clamp / 牌型分类
// ============================================================================
describe('W19-A · SHOOT 修饰链纯函数（R33）', () => {
  it('applySudgerVerdict：pick=A → rollA', () => {
    expect(applySudgerVerdict(3, 5, 'A')).toBe(3);
  });

  it('applySudgerVerdict：pick=B → rollB', () => {
    expect(applySudgerVerdict(3, 5, 'B')).toBe(5);
  });

  it('applyScorpiusPoison：差值 > 0 → 绝对值', () => {
    expect(applyScorpiusPoison(6, 2)).toBe(4);
    expect(applyScorpiusPoison(2, 6)).toBe(4); // 绝对值
  });

  it('applyScorpiusPoison：差值 = 0 → 1（守卫）', () => {
    expect(applyScorpiusPoison(3, 3)).toBe(1);
  });

  it('applyTaurusHorn：selfRoll > targetRoll → kill', () => {
    expect(applyTaurusHorn(3, 5)).toBe('kill');
  });

  it('applyTaurusHorn：selfRoll <= targetRoll → normal', () => {
    expect(applyTaurusHorn(5, 3)).toBe('normal');
    expect(applyTaurusHorn(4, 4)).toBe('normal');
  });

  it('applySoulSculptorCarve：target 手牌数 clamp 到 [1,6]', () => {
    expect(applySoulSculptorCarve(0)).toBe(1);
    expect(applySoulSculptorCarve(3)).toBe(3);
    expect(applySoulSculptorCarve(6)).toBe(6);
    expect(applySoulSculptorCarve(10)).toBe(6);
  });

  it('applyHaleyImpact：raw-2 clamp 到 [1,6]', () => {
    expect(applyHaleyImpact(6)).toBe(4);
    expect(applyHaleyImpact(3)).toBe(1);
    expect(applyHaleyImpact(1)).toBe(1); // 下限守卫
  });
});

describe('W19-A · 角色被动触发守卫（R33）', () => {
  it('isVirgoPerfectTriggered：骰 6 → true / 非 6 → false', () => {
    expect(isVirgoPerfectTriggered(6)).toBe(true);
    expect(isVirgoPerfectTriggered(5)).toBe(false);
    expect(isVirgoPerfectTriggered(1)).toBe(false);
  });

  it('isTerroristCrossLayerActive：thief_terrorist 且存活 → true', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_terrorist');
    expect(isTerroristCrossLayerActive(s.players.p1!)).toBe(true);
  });

  it('isTerroristCrossLayerActive：非恐怖分子 → false', () => {
    const s = scenarioStartOfGame3p();
    expect(isTerroristCrossLayerActive(s.players.p1!)).toBe(false);
  });

  it('isTerroristCrossLayerActive：死亡 → false', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_terrorist');
    s = { ...s, players: { ...s.players, p1: { ...s.players.p1!, isAlive: false } } };
    expect(isTerroristCrossLayerActive(s.players.p1!)).toBe(false);
  });

  it('isAquariusUnlimitedActive：水瓶 + 存活 → true / 非水瓶 → false', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_aquarius');
    expect(isAquariusUnlimitedActive(s.players.p1!)).toBe(true);
    s = setCharacter(s, 'p1', 'thief_apollo');
    expect(isAquariusUnlimitedActive(s.players.p1!)).toBe(false);
  });

  it('canPiscesEvade：双鱼 + L2+ → true（未翻面）', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_pisces');
    s = setLayer(s, 'p1', 2 as Layer);
    expect(canPiscesEvade(s.players.p1!)).toBe(true);
  });

  it('canPiscesEvade：双鱼 + L1 → false（无法下一层）', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_pisces');
    // p1 默认在 L1
    expect(canPiscesEvade(s.players.p1!)).toBe(false);
  });

  it('canPiscesEvade：非双鱼 → false', () => {
    const s = scenarioStartOfGame3p();
    expect(canPiscesEvade(s.players.p1!)).toBe(false);
  });

  it('canGreenRayActivate：格林射线 + 有穿梭剂 + 有 SHOOT → true', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_green_ray');
    s = setHand(s, 'p1', ['action_dream_transit' as CardID, 'action_shoot' as CardID]);
    expect(canGreenRayActivate(s.players.p1!)).toBe(true);
  });

  it('canGreenRayActivate：缺穿梭剂 → false', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_green_ray');
    s = setHand(s, 'p1', ['action_shoot' as CardID]);
    expect(canGreenRayActivate(s.players.p1!)).toBe(false);
  });

  it('canGreenRayActivate：缺 SHOOT 类 → false', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_green_ray');
    s = setHand(s, 'p1', ['action_dream_transit' as CardID, 'action_unlock' as CardID]);
    expect(canGreenRayActivate(s.players.p1!)).toBe(false);
  });
});

describe('W19-A · 牌型分类 + 骰值 clamp（R33）', () => {
  it('isShootClassCard：所有 shoot 变体 → true', () => {
    expect(isShootClassCard('action_shoot' as CardID)).toBe(true);
    expect(isShootClassCard('action_shoot_king' as CardID)).toBe(true);
    expect(isShootClassCard('action_shoot_armor' as CardID)).toBe(true);
    expect(isShootClassCard('action_shoot_burst' as CardID)).toBe(true);
    expect(isShootClassCard('action_shoot_dream_transit' as CardID)).toBe(true);
  });

  it('isShootClassCard：非 shoot 牌 → false', () => {
    expect(isShootClassCard('action_unlock' as CardID)).toBe(false);
    expect(isShootClassCard('action_shift' as CardID)).toBe(false);
    expect(isShootClassCard('action_dream_transit' as CardID)).toBe(false);
  });

  it('jokerDrawCount：骰 1-6 clamp', () => {
    expect(jokerDrawCount(1)).toBe(1);
    expect(jokerDrawCount(3)).toBe(3);
    expect(jokerDrawCount(6)).toBe(6);
    expect(jokerDrawCount(0)).toBe(1); // 下限
    expect(jokerDrawCount(7)).toBe(6); // 上限
  });

  it('isJupiterPeakLayerOK：同层 OK / 相邻 OK / 跨 2 层 fail / 含迷失层 fail', () => {
    expect(isJupiterPeakLayerOK(3, 3)).toBe(true); // 同层
    expect(isJupiterPeakLayerOK(3, 4)).toBe(true); // 相邻
    expect(isJupiterPeakLayerOK(4, 3)).toBe(true); // 相邻反向
    expect(isJupiterPeakLayerOK(2, 4)).toBe(false); // 跨 2 层
    expect(isJupiterPeakLayerOK(0, 1)).toBe(false); // 迷失层一方
    expect(isJupiterPeakLayerOK(1, 0)).toBe(false); // 迷失层另一方
  });

  it('checkAthenaAweCondition：5 张互不相同 → true', () => {
    const hand = [
      'action_unlock',
      'action_shoot',
      'action_shift',
      'action_kick',
      'action_dream_transit',
    ] as CardID[];
    expect(checkAthenaAweCondition(hand)).toBe(true);
  });

  it('checkAthenaAweCondition：5 张含重复 → false', () => {
    const hand = [
      'action_unlock',
      'action_unlock',
      'action_shift',
      'action_kick',
      'action_shoot',
    ] as CardID[];
    expect(checkAthenaAweCondition(hand)).toBe(false);
  });

  it('checkAthenaAweCondition：非 5 张（4 / 6）→ false', () => {
    expect(
      checkAthenaAweCondition(['action_unlock', 'action_shoot', 'action_shift'] as CardID[]),
    ).toBe(false);
    expect(checkAthenaAweCondition(['a', 'b', 'c', 'd', 'e', 'f'] as unknown as CardID[])).toBe(
      false,
    );
  });
});

// ============================================================================
// R34 · W19-A 交互矩阵扩充（第七批 · 穿行者 / 摩羯 / 药剂师）
// ============================================================================
describe('W19-A · 穿行者·支助守卫（R34）', () => {
  it('非穿行者角色 → false', () => {
    const s = scenarioStartOfGame3p();
    expect(canUseTouristAssist(s, 'p1', 'p2')).toBe(false);
  });

  it('穿行者 + 合法 target + 有手牌 → true', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_tourist');
    s = setHand(s, 'p1', ['action_unlock' as CardID]);
    expect(canUseTouristAssist(s, 'p1', 'p2')).toBe(true);
  });

  it('穿行者 + 手牌为空 → false', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_tourist');
    s = setHand(s, 'p1', []);
    expect(canUseTouristAssist(s, 'p1', 'p2')).toBe(false);
  });

  it('穿行者 + target 死亡 → false', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_tourist');
    s = setHand(s, 'p1', ['action_unlock' as CardID]);
    s = { ...s, players: { ...s.players, p2: { ...s.players.p2!, isAlive: false } } };
    expect(canUseTouristAssist(s, 'p1', 'p2')).toBe(false);
  });

  it('穿行者 + self === target → false', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_tourist');
    s = setHand(s, 'p1', ['action_unlock' as CardID]);
    expect(canUseTouristAssist(s, 'p1', 'p1')).toBe(false);
  });
});

describe('W19-A · 摩羯·节奏守卫（R34）', () => {
  it('非摩羯 → false', () => {
    const s = scenarioStartOfGame3p();
    expect(isCapricornusRhythmActive(s.players.p1!)).toBe(false);
  });

  it('摩羯 + 手牌数 < 当前层 → false', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_capricornus');
    s = setLayer(s, 'p1', 3 as Layer);
    s = setHand(s, 'p1', ['action_unlock' as CardID]);
    expect(isCapricornusRhythmActive(s.players.p1!)).toBe(false);
  });

  it('摩羯 + 手牌数 == 当前层 → true', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_capricornus');
    s = setLayer(s, 'p1', 2 as Layer);
    s = setHand(s, 'p1', ['action_unlock' as CardID, 'action_shoot' as CardID]);
    expect(isCapricornusRhythmActive(s.players.p1!)).toBe(true);
  });

  it('摩羯 + 手牌数 > 当前层 → true', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_capricornus');
    s = setLayer(s, 'p1', 1 as Layer);
    s = setHand(s, 'p1', ['a' as CardID, 'b' as CardID, 'c' as CardID]);
    expect(isCapricornusRhythmActive(s.players.p1!)).toBe(true);
  });

  it('摩羯 + 当前层 0（迷失）→ false', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_capricornus');
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, currentLayer: 0 as Layer, hand: ['a' as CardID] },
      },
    };
    expect(isCapricornusRhythmActive(s.players.p1!)).toBe(false);
  });

  it('摩羯 + 死亡 → false', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_capricornus');
    s = setHand(s, 'p1', ['a' as CardID, 'b' as CardID]);
    s = { ...s, players: { ...s.players, p1: { ...s.players.p1!, isAlive: false } } };
    expect(isCapricornusRhythmActive(s.players.p1!)).toBe(false);
  });
});

describe('W19-A · 药剂师·调剂守卫（R34）', () => {
  it('非药剂师 → null', () => {
    let s = scenarioStartOfGame3p();
    s = setHand(s, 'p1', ['action_unlock' as CardID]);
    s = { ...s, deck: { ...s.deck, discardPile: ['action_dream_transit' as CardID] } };
    const r = applyChemistRefine(s, 'p1', 'action_unlock' as CardID);
    expect(r).toBeNull();
  });

  it('药剂师 + 手牌有弃牌 + 弃牌堆有穿梭剂 → 成功（穿梭剂到手）', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_chemist');
    s = setHand(s, 'p1', ['action_unlock' as CardID]);
    s = { ...s, deck: { ...s.deck, discardPile: ['action_dream_transit' as CardID] } };
    const r = applyChemistRefine(s, 'p1', 'action_unlock' as CardID);
    expect(r).not.toBeNull();
    expect(r!.players.p1!.hand).toContain('action_dream_transit');
    expect(r!.players.p1!.hand).not.toContain('action_unlock');
  });

  it('药剂师 + 手牌无指定弃牌 → null', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_chemist');
    s = setHand(s, 'p1', ['action_shoot' as CardID]);
    s = { ...s, deck: { ...s.deck, discardPile: ['action_dream_transit' as CardID] } };
    const r = applyChemistRefine(s, 'p1', 'action_unlock' as CardID);
    expect(r).toBeNull();
  });

  it('药剂师 + 弃牌堆无穿梭剂 → null', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_chemist');
    s = setHand(s, 'p1', ['action_unlock' as CardID]);
    s = { ...s, deck: { ...s.deck, discardPile: ['action_shoot' as CardID] } };
    const r = applyChemistRefine(s, 'p1', 'action_unlock' as CardID);
    expect(r).toBeNull();
  });

  it('药剂师 + 死亡 → null', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_chemist');
    s = setHand(s, 'p1', ['action_unlock' as CardID]);
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, isAlive: false } },
      deck: { ...s.deck, discardPile: ['action_dream_transit' as CardID] },
    };
    const r = applyChemistRefine(s, 'p1', 'action_unlock' as CardID);
    expect(r).toBeNull();
  });
});

// ============================================================================
// R35 · W19-A 交互矩阵扩充（第八批 · apply* 状态变更分支）
// ============================================================================
describe('W19-A · 穿行者·支助 happy path（R35）', () => {
  it('手牌全转 target + self 移到 target 层', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_tourist');
    s = setHand(s, 'p1', [
      'action_unlock' as CardID,
      'action_shoot' as CardID,
      'action_shift' as CardID,
    ]);
    // p2 放到 L3
    s = setLayer(s, 'p2', 3 as Layer);
    const beforeP2Hand = s.players.p2!.hand.length;
    const r = applyTouristAssist(s, 'p1', 'p2');
    expect(r).not.toBeNull();
    // p1 手牌清空
    expect(r!.players.p1!.hand.length).toBe(0);
    // p2 获得全部
    expect(r!.players.p2!.hand.length).toBe(beforeP2Hand + 3);
    // p1 移到 L3
    expect(r!.players.p1!.currentLayer).toBe(3);
  });

  it('技能限 1 次/回合：第二次 apply → null', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_tourist');
    s = setHand(s, 'p1', ['action_unlock' as CardID]);
    const r1 = applyTouristAssist(s, 'p1', 'p2');
    expect(r1).not.toBeNull();
    // 第二次从 r1 继续发动（但 p1 无手牌，也会 fail）
    s = setHand(r1!, 'p1', ['action_shoot' as CardID]);
    const r2 = applyTouristAssist(s, 'p1', 'p2');
    expect(r2).toBeNull();
  });
});

describe('W19-A · 狮子·王道触发分支（R35）', () => {
  it('非狮子角色 → 原状态返回', () => {
    let s = scenarioStartOfGame3p();
    s = setHand(s, 'p1', []);
    s = { ...s, deck: { cards: Array(5).fill('action_unlock') as CardID[], discardPile: [] } };
    const r = applyLeoKingdom(s, 'p1');
    expect(r.players.p1!.hand.length).toBe(0); // 不加
  });

  it('狮子 + 梦主手牌=3 → 抽 3 张', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_leo');
    s = setHand(s, 'p1', []);
    const mid = findMasterID(s)!;
    s = setHand(s, mid, Array(3).fill('action_shoot') as CardID[]);
    s = { ...s, deck: { cards: Array(10).fill('action_unlock') as CardID[], discardPile: [] } };
    const r = applyLeoKingdom(s, 'p1');
    expect(r.players.p1!.hand.length).toBe(3);
  });

  it('狮子 + 梦主手牌=0 + 弃牌堆有牌 → 从弃牌堆顶取 1', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_leo');
    s = setHand(s, 'p1', []);
    const mid = findMasterID(s)!;
    s = setHand(s, mid, []);
    s = {
      ...s,
      deck: {
        cards: [],
        discardPile: ['action_unlock' as CardID, 'action_shoot' as CardID],
      },
    };
    const r = applyLeoKingdom(s, 'p1');
    expect(r.players.p1!.hand.length).toBe(1);
    expect(r.players.p1!.hand[0]).toBe('action_shoot');
    // 弃牌堆少 1 张
    expect(r.deck.discardPile.length).toBe(1);
  });

  it('狮子 + 梦主手牌=0 + 弃牌堆空 → 无效果但技能标记已用', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_leo');
    s = setHand(s, 'p1', []);
    const mid = findMasterID(s)!;
    s = setHand(s, mid, []);
    s = { ...s, deck: { cards: [], discardPile: [] } };
    const r = applyLeoKingdom(s, 'p1');
    expect(r.players.p1!.hand.length).toBe(0);
    expect(r.players.p1!.skillUsedThisTurn['thief_leo.skill_0']).toBe(1);
  });

  it('狮子 + 技能已用过 → 直接返回原状态', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_leo');
    s = setHand(s, 'p1', []);
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, skillUsedThisTurn: { 'thief_leo.skill_0': 1 } },
      },
    };
    const mid = findMasterID(s)!;
    s = setHand(s, mid, Array(3).fill('action_shoot') as CardID[]);
    s = { ...s, deck: { cards: Array(5).fill('action_unlock') as CardID[], discardPile: [] } };
    const r = applyLeoKingdom(s, 'p1');
    expect(r.players.p1!.hand.length).toBe(0); // 不触发
  });
});

describe('W19-A · 黑洞·征收 apply 分支（R35）', () => {
  it('非黑洞角色 → null', () => {
    const s = scenarioStartOfGame3p();
    const picks: Record<string, CardID> = { p2: 'action_unlock' as CardID };
    const r = applyBlackHoleLevy(s, 'p1', picks);
    expect(r).toBeNull();
  });

  it('黑洞 + 同层无其他玩家 → null', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_black_hole');
    // 把 p2 移到其他层
    s = setLayer(s, 'p2', 3 as Layer);
    const picks: Record<string, CardID> = {};
    const r = applyBlackHoleLevy(s, 'p1', picks);
    expect(r).toBeNull();
  });

  it('黑洞 + giverPicks 缺失某玩家 → null（必须全齐）', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_black_hole');
    s = setHand(s, 'p2', ['action_unlock' as CardID]);
    // 空 picks（p2 存在于同层但未提供 pick）
    const picks: Record<string, CardID> = {};
    const r = applyBlackHoleLevy(s, 'p1', picks);
    expect(r).toBeNull();
  });

  it('黑洞 + pick 不在 giver 手中 → null', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_black_hole');
    s = setHand(s, 'p2', ['action_unlock' as CardID]);
    const picks: Record<string, CardID> = { p2: 'action_shoot' as CardID, pM: 'x' as CardID };
    const r = applyBlackHoleLevy(s, 'p1', picks);
    expect(r).toBeNull();
  });
});

// ============================================================================
// R36 · W19-A 交互矩阵扩充（第九批 · 天王星/冥王星业火梦主技能）
// ============================================================================
describe('W19-A · 天王星·权力 apply 分支（R36）', () => {
  it('非天王星梦主 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    s = withInPoolBribe(s);
    const r = applyUranusPower(s, findMasterID(s)!, 'p1', 3 as Layer);
    expect(r).toBeNull();
  });

  it('天王星梦主 + 有 inPool 贿赂 + 合法 target + 新层 → 移动成功', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
    s = withInPoolBribe(s);
    // p1 默认 L1 → 送 L3
    const r = applyUranusPower(s, findMasterID(s)!, 'p1', 3 as Layer);
    expect(r).not.toBeNull();
    expect(r!.players.p1!.currentLayer).toBe(3);
  });

  it('天王星 + 目标已在目标层 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
    s = withInPoolBribe(s);
    // p1 默认 L1 → 再送 L1 = null
    const r = applyUranusPower(s, findMasterID(s)!, 'p1', 1 as Layer);
    expect(r).toBeNull();
  });

  it('天王星 + 送迷失层（0）→ null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
    s = withInPoolBribe(s);
    const r = applyUranusPower(s, findMasterID(s)!, 'p1', 0 as Layer);
    expect(r).toBeNull();
  });

  it('天王星 + bribePool 为空（无 inPool）→ null', () => {
    const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
    // bribePool=[] 默认
    const r = applyUranusPower(s, findMasterID(s)!, 'p1', 3 as Layer);
    expect(r).toBeNull();
  });

  it('天王星 + target 为梦主自己 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
    s = withInPoolBribe(s);
    const mid = findMasterID(s)!;
    const r = applyUranusPower(s, mid, mid, 3 as Layer);
    expect(r).toBeNull();
  });
});

describe('W19-A · 天王星·权力剩余次数 + 世界观（R36）', () => {
  it('getUranusPowerUsesLeft：非天王星梦主 → 0', () => {
    const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    expect(getUranusPowerUsesLeft(s, s.players[findMasterID(s)!]!)).toBe(0);
  });

  it('getUranusPowerUsesLeft：inPool=1 + 未用 → 1', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
    s = withInPoolBribe(s);
    expect(getUranusPowerUsesLeft(s, s.players[findMasterID(s)!]!)).toBe(1);
  });

  it('getUranusPowerUsesLeft：inPool=1 + 已用 1 次 → 0', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
    s = withInPoolBribe(s);
    const mid = findMasterID(s)!;
    s = {
      ...s,
      players: {
        ...s.players,
        [mid]: {
          ...s.players[mid]!,
          skillUsedThisTurn: { 'dm_uranus_firmament.skill_0': 1 },
        },
      },
    };
    expect(getUranusPowerUsesLeft(s, s.players[mid]!)).toBe(0);
  });

  it('isUranusFirmamentWorldActive：天王星梦主 → true / 其他 → false', () => {
    const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
    expect(isUranusFirmamentWorldActive(s)).toBe(true);
    const s2 = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    expect(isUranusFirmamentWorldActive(s2)).toBe(false);
  });
});

describe('W19-A · 冥王星·业火 apply 分支（R36）', () => {
  it('非冥王星梦主 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    const mid = findMasterID(s)!;
    s = setHand(s, mid, ['action_unlock' as CardID]);
    const r = applyPlutoBurning(s, mid, 'action_unlock' as CardID);
    expect(r).toBeNull();
  });

  it('冥王星梦主 + 手牌有指定弃牌 + 盗梦者手牌<2 → 抽 2', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    const mid = findMasterID(s)!;
    s = setHand(s, mid, ['action_unlock' as CardID]);
    // p1 / p2 手牌各 1 张（<2）
    s = setHand(s, 'p1', ['action_shoot' as CardID]);
    s = setHand(s, 'p2', ['action_shift' as CardID]);
    s = { ...s, deck: { cards: Array(10).fill('action_kick') as CardID[], discardPile: [] } };
    const r = applyPlutoBurning(s, mid, 'action_unlock' as CardID);
    expect(r).not.toBeNull();
    // 各 +2
    expect(r!.players.p1!.hand.length).toBe(3);
    expect(r!.players.p2!.hand.length).toBe(3);
    // 梦主 -1 弃
    expect(r!.players[mid]!.hand.length).toBe(0);
  });

  it('冥王星梦主 + 盗梦者手牌≥2 → 不抽（阈值守卫）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    const mid = findMasterID(s)!;
    s = setHand(s, mid, ['action_unlock' as CardID]);
    // p1 已有 2 张 + p2 也是
    s = setHand(s, 'p1', ['a' as CardID, 'b' as CardID]);
    s = setHand(s, 'p2', ['c' as CardID, 'd' as CardID]);
    s = { ...s, deck: { cards: Array(10).fill('action_kick') as CardID[], discardPile: [] } };
    const r = applyPlutoBurning(s, mid, 'action_unlock' as CardID);
    expect(r).not.toBeNull();
    // 手牌保持 2
    expect(r!.players.p1!.hand.length).toBe(2);
    expect(r!.players.p2!.hand.length).toBe(2);
  });

  it('冥王星梦主 + 手牌无指定弃 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    const mid = findMasterID(s)!;
    s = setHand(s, mid, ['action_shoot' as CardID]);
    const r = applyPlutoBurning(s, mid, 'action_unlock' as CardID);
    expect(r).toBeNull();
  });

  it('冥王星梦主 + 已用过一次 → null（限 1 次/回合）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    const mid = findMasterID(s)!;
    s = setHand(s, mid, ['action_unlock' as CardID]);
    s = {
      ...s,
      players: {
        ...s.players,
        [mid]: {
          ...s.players[mid]!,
          skillUsedThisTurn: { 'dm_pluto_hell.skill_0': 1 },
        },
      },
    };
    const r = applyPlutoBurning(s, mid, 'action_unlock' as CardID);
    expect(r).toBeNull();
  });
});

// ============================================================================
// R37 · W19-A 交互矩阵扩充（第十批 · 雅典娜/影子/土星世界观）
// ============================================================================
describe('W19-A · 雅典娜·急智 apply 分支（R37）', () => {
  it('非雅典娜 → null', () => {
    let s = scenarioStartOfGame3p();
    s = { ...s, deck: { ...s.deck, discardPile: ['action_unlock' as CardID] } };
    const r = applyAthenaWit(s, 'p1');
    expect(r).toBeNull();
  });

  it('雅典娜 + 弃牌堆空 → null', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_athena');
    s = { ...s, deck: { ...s.deck, discardPile: [] } };
    const r = applyAthenaWit(s, 'p1');
    expect(r).toBeNull();
  });

  it('雅典娜 + 弃牌堆有牌 → 取顶 1 张到手', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_athena');
    s = setHand(s, 'p1', []);
    s = {
      ...s,
      deck: {
        ...s.deck,
        discardPile: ['action_unlock' as CardID, 'action_shoot' as CardID],
      },
    };
    const r = applyAthenaWit(s, 'p1');
    expect(r).not.toBeNull();
    expect(r!.players.p1!.hand).toEqual(['action_shoot']);
    expect(r!.deck.discardPile).toEqual(['action_unlock']);
  });

  it('雅典娜 + 死亡 → null', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_athena');
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, isAlive: false } },
      deck: { ...s.deck, discardPile: ['action_unlock' as CardID] },
    };
    const r = applyAthenaWit(s, 'p1');
    expect(r).toBeNull();
  });
});

describe('W19-A · 影子·潜伏 apply 分支（R37）', () => {
  it('非影子 → null', () => {
    const s = scenarioStartOfGame3p();
    const r = applyShadeFollow(s, 'p1');
    expect(r).toBeNull();
  });

  it('影子 + 存活 → 移到梦主所在层', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_shade');
    s = setLayer(s, 'pM', 3 as Layer);
    const r = applyShadeFollow(s, 'p1');
    expect(r).not.toBeNull();
    expect(r!.players.p1!.currentLayer).toBe(3);
  });

  it('影子 + 死亡 → null', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_shade');
    s = { ...s, players: { ...s.players, p1: { ...s.players.p1!, isAlive: false } } };
    const r = applyShadeFollow(s, 'p1');
    expect(r).toBeNull();
  });
});

describe('W19-A · 土星世界观免费移动 apply 分支（R37）', () => {
  it('非土星梦主 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    s = { ...s, players: { ...s.players, p1: { ...s.players.p1!, bribeReceived: 1 } } };
    const r = applySaturnFreeMove(s, 'p1', 2 as Layer);
    expect(r).toBeNull();
  });

  it('土星 + 盗梦者无贿赂 → null', () => {
    const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
    const r = applySaturnFreeMove(s, 'p1', 2 as Layer);
    expect(r).toBeNull();
  });

  it('土星 + 盗梦者持贿赂 + 相邻层 → 移动成功', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
    s = { ...s, players: { ...s.players, p1: { ...s.players.p1!, bribeReceived: 1 } } };
    const r = applySaturnFreeMove(s, 'p1', 2 as Layer);
    expect(r).not.toBeNull();
    expect(r!.players.p1!.currentLayer).toBe(2);
  });

  it('土星 + 非相邻层（跨 2 层）→ null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
    s = { ...s, players: { ...s.players, p1: { ...s.players.p1!, bribeReceived: 1 } } };
    const r = applySaturnFreeMove(s, 'p1', 3 as Layer);
    expect(r).toBeNull();
  });

  it('土星 + 目标迷失层 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
    s = { ...s, players: { ...s.players, p1: { ...s.players.p1!, bribeReceived: 1 } } };
    const r = applySaturnFreeMove(s, 'p1', 0 as Layer);
    expect(r).toBeNull();
  });

  it('土星 + 已用过一次 → null（限 1 次/回合）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
    s = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1!,
          bribeReceived: 1,
          skillUsedThisTurn: { 'dm_saturn_territory.world.skill': 1 },
        },
      },
    };
    const r = applySaturnFreeMove(s, 'p1', 2 as Layer);
    expect(r).toBeNull();
  });

  it('canUseSaturnFreeMoveThisTurn：未用 + 持贿赂 → true', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
    s = { ...s, players: { ...s.players, p1: { ...s.players.p1!, bribeReceived: 1 } } };
    expect(canUseSaturnFreeMoveThisTurn(s, 'p1')).toBe(true);
  });

  it('canUseSaturnFreeMoveThisTurn：已用过 → false', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
    s = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1!,
          bribeReceived: 1,
          skillUsedThisTurn: { 'dm_saturn_territory.world.skill': 1 },
        },
      },
    };
    expect(canUseSaturnFreeMoveThisTurn(s, 'p1')).toBe(false);
  });
});

// ============================================================================
// R38 · W19-A 交互矩阵扩充（第十一批 · 天王星世界观 / 火星战场 / 土星律令）
// ============================================================================
describe('W19-A · 天王星·苍穹世界观弃牌堆顶（R38）', () => {
  it('非天王星梦主 → state 不变', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    const before = s.deck.cards.length;
    s = applyUranusFirmamentMoveDiscard(s, 'p1');
    expect(s.deck.cards.length).toBe(before);
  });

  it('天王星 + inPool>0 + thief 层变 → 弃 1 张牌库顶', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
    s = withInPoolBribe(s);
    s = {
      ...s,
      deck: {
        cards: ['a' as CardID, 'b' as CardID, 'c' as CardID],
        discardPile: [],
      },
    };
    const r = applyUranusFirmamentMoveDiscard(s, 'p1');
    expect(r.deck.cards.length).toBe(2);
    expect(r.deck.discardPile).toEqual(['a']);
  });

  it('天王星 + inPool=0 → 弃 2 张牌库顶（梦主派发完毕加码）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
    // bribePool 默认空（inPool=0）
    s = {
      ...s,
      deck: {
        cards: ['a' as CardID, 'b' as CardID, 'c' as CardID],
        discardPile: [],
      },
    };
    const r = applyUranusFirmamentMoveDiscard(s, 'p1');
    expect(r.deck.cards.length).toBe(1);
    expect(r.deck.discardPile).toEqual(['a', 'b']);
  });

  it('天王星 + thief 层变 + 牌库空 → state 不变', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
    s = withInPoolBribe(s);
    s = { ...s, deck: { cards: [], discardPile: [] } };
    const r = applyUranusFirmamentMoveDiscard(s, 'p1');
    expect(r.deck.cards.length).toBe(0);
    expect(r.deck.discardPile.length).toBe(0);
  });

  it('天王星 + master 层变（非 thief）→ 不触发', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
    s = withInPoolBribe(s);
    s = {
      ...s,
      deck: { cards: ['a' as CardID, 'b' as CardID], discardPile: [] },
    };
    const mid = findMasterID(s)!;
    const r = applyUranusFirmamentMoveDiscard(s, mid);
    expect(r.deck.cards.length).toBe(2); // master 触发不弃
  });
});

describe('W19-A · 火星·战场世界观交换（R38）', () => {
  it('非火星梦主 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    s = setHand(s, 'p1', ['action_unlock' as CardID, 'action_shift' as CardID]);
    s = { ...s, deck: { ...s.deck, discardPile: ['action_shoot' as CardID] } };
    const r = applyMarsBattlefieldExchange(
      s,
      'p1',
      ['action_unlock' as CardID, 'action_shift' as CardID],
      'action_shoot' as CardID,
    );
    expect(r).toBeNull();
  });

  it('火星 + 弃 2 非 SHOOT + 弃堆有 SHOOT → 交换成功', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    s = setHand(s, 'p1', ['action_unlock' as CardID, 'action_shift' as CardID]);
    s = { ...s, deck: { ...s.deck, discardPile: ['action_shoot' as CardID] } };
    const r = applyMarsBattlefieldExchange(
      s,
      'p1',
      ['action_unlock' as CardID, 'action_shift' as CardID],
      'action_shoot' as CardID,
    );
    expect(r).not.toBeNull();
    expect(r!.players.p1!.hand).toEqual(['action_shoot']);
    // 弃堆中 shoot 被取走，新增 2 张非 shoot
    expect(r!.deck.discardPile.sort()).toEqual(['action_shift', 'action_unlock']);
  });

  it('火星 + 弃的任一张是 SHOOT → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    s = setHand(s, 'p1', ['action_shoot' as CardID, 'action_shift' as CardID]);
    s = { ...s, deck: { ...s.deck, discardPile: ['action_shoot_king' as CardID] } };
    const r = applyMarsBattlefieldExchange(
      s,
      'p1',
      ['action_shoot' as CardID, 'action_shift' as CardID],
      'action_shoot_king' as CardID,
    );
    expect(r).toBeNull();
  });

  it('火星 + 目标非 SHOOT → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    s = setHand(s, 'p1', ['action_unlock' as CardID, 'action_shift' as CardID]);
    s = { ...s, deck: { ...s.deck, discardPile: ['action_kick' as CardID] } };
    const r = applyMarsBattlefieldExchange(
      s,
      'p1',
      ['action_unlock' as CardID, 'action_shift' as CardID],
      'action_kick' as CardID,
    );
    expect(r).toBeNull();
  });

  it('火星 + 目标 SHOOT 不在弃堆 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    s = setHand(s, 'p1', ['action_unlock' as CardID, 'action_shift' as CardID]);
    s = { ...s, deck: { ...s.deck, discardPile: [] } };
    const r = applyMarsBattlefieldExchange(
      s,
      'p1',
      ['action_unlock' as CardID, 'action_shift' as CardID],
      'action_shoot' as CardID,
    );
    expect(r).toBeNull();
  });

  it('火星 + 同名双弃（2 张 unlock）+ 手牌含 2 张 → 成功', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    s = setHand(s, 'p1', ['action_unlock' as CardID, 'action_unlock' as CardID]);
    s = { ...s, deck: { ...s.deck, discardPile: ['action_shoot' as CardID] } };
    const r = applyMarsBattlefieldExchange(
      s,
      'p1',
      ['action_unlock' as CardID, 'action_unlock' as CardID],
      'action_shoot' as CardID,
    );
    expect(r).not.toBeNull();
    expect(r!.players.p1!.hand).toEqual(['action_shoot']);
  });

  it('火星 + 同名双弃但手牌只有 1 张 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    s = setHand(s, 'p1', ['action_unlock' as CardID]);
    s = { ...s, deck: { ...s.deck, discardPile: ['action_shoot' as CardID] } };
    const r = applyMarsBattlefieldExchange(
      s,
      'p1',
      ['action_unlock' as CardID, 'action_unlock' as CardID],
      'action_shoot' as CardID,
    );
    expect(r).toBeNull();
  });
});

describe('W19-A · 土星·领地律令（R38）', () => {
  it('非土星梦主 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    const mid = findMasterID(s)!;
    s = setHand(s, mid, ['action_unlock' as CardID]);
    s = { ...s, deck: { cards: ['a' as CardID], discardPile: [] } };
    const r = applySaturnDecree(s, mid, 'action_unlock' as CardID);
    expect(r).toBeNull();
  });

  it('土星 + 手牌有指定弃牌 → 弃 1 抽 1', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
    const mid = findMasterID(s)!;
    s = setHand(s, mid, ['action_unlock' as CardID]);
    s = { ...s, deck: { cards: ['action_shoot' as CardID], discardPile: [] } };
    const r = applySaturnDecree(s, mid, 'action_unlock' as CardID);
    expect(r).not.toBeNull();
    // 弃 unlock + 抽 shoot
    expect(r!.players[mid]!.hand).toEqual(['action_shoot']);
    expect(r!.deck.discardPile).toEqual(['action_unlock']);
  });

  it('土星 + 手牌无指定弃牌 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
    const mid = findMasterID(s)!;
    s = setHand(s, mid, ['action_shoot' as CardID]);
    const r = applySaturnDecree(s, mid, 'action_unlock' as CardID);
    expect(r).toBeNull();
  });

  it('土星梦主 + 死亡 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
    const mid = findMasterID(s)!;
    s = setHand(s, mid, ['action_unlock' as CardID]);
    s = { ...s, players: { ...s.players, [mid]: { ...s.players[mid]!, isAlive: false } } };
    const r = applySaturnDecree(s, mid, 'action_unlock' as CardID);
    expect(r).toBeNull();
  });
});

describe('W19-A · 火星·杀戮弃解封（R38）', () => {
  it('非火星梦主 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
    const mid = findMasterID(s)!;
    s = setHand(s, mid, ['action_unlock' as CardID]);
    const r = applyMarsKillDiscardUnlock(s, mid);
    expect(r).toBeNull();
  });

  it('火星 + 手牌有 unlock → 成功弃 1', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    const mid = findMasterID(s)!;
    s = setHand(s, mid, ['action_unlock' as CardID, 'action_shoot' as CardID]);
    const r = applyMarsKillDiscardUnlock(s, mid);
    expect(r).not.toBeNull();
    expect(r!.players[mid]!.hand).toEqual(['action_shoot']);
  });

  it('火星 + 手牌无 unlock → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    const mid = findMasterID(s)!;
    s = setHand(s, mid, ['action_shoot' as CardID]);
    const r = applyMarsKillDiscardUnlock(s, mid);
    expect(r).toBeNull();
  });
});
