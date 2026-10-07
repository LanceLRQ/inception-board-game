// 梦主的免费移动：出牌阶段可不用功能牌移动到相邻的另一层梦境，每回合仅可使用一次。
// 对照：docs/manual/03-game-flow.md:82
// 次数记在梦主本人的 skillUsedThisTurn 里（回合开始清零）；这次移动仍给要塞·冷酷累计一次发动机会。

import { describe, it, expect } from 'vitest';
import { checkStateInvariants } from './engine/stateInvariants.js';
import { fortressColdnessChancesLeft } from './engine/skills.js';
import { applyMove, type MatchState } from './runner/matchRunner.js';
import type { SetupState } from './setup.js';
import { beginTurn, MASTER_FREE_MOVE_KEY } from './stateOps.js';
import {
  c,
  fixedRandom,
  game,
  KICK,
  load,
  scene,
  TRANSIT,
  withPlayer,
} from './testing/runnerHarness.js';

/** 梦主 pM 在第 1 层，手里有一张梦境穿梭剂；轮到梦主的出牌阶段 */
function masterScene(extra: Partial<SetupState> = {}): SetupState {
  return scene(
    {
      p1: { layer: 1, hand: [KICK] },
      p2: { layer: 2, hand: [KICK] },
      p3: { layer: 3, hand: [KICK] },
      p4: { layer: 4, hand: [KICK] },
      pM: { layer: 1, hand: [TRANSIT, KICK] },
    },
    extra,
  );
}

function step(
  m: MatchState<SetupState>,
  playerID: string,
  move: string,
  args: unknown[],
): MatchState<SetupState> {
  const res = applyMove(game, m, { playerID, move, args }, { random: fixedRandom(3) });
  expect(res.ok, `${move} 被拒绝：${res.ok ? '' : res.reason}`).toBe(true);
  if (!res.ok) throw new Error('unreachable');
  expect(checkStateInvariants(res.state.G)).toEqual([]);
  return res.state;
}

function isRejected(
  m: MatchState<SetupState>,
  playerID: string,
  move: string,
  args: unknown[],
): boolean {
  return !applyMove(game, m, { playerID, move, args }, { random: fixedRandom(3) }).ok;
}

describe('梦主的免费移动：每回合仅一次', () => {
  it('第一次移动成功，并在梦主的 skillUsedThisTurn 里记一次', () => {
    const m = step(load(masterScene()), 'pM', 'dreamMasterMove', [2]);
    expect(m.G.players.pM!.currentLayer).toBe(2);
    expect(m.G.players.pM!.skillUsedThisTurn[MASTER_FREE_MOVE_KEY]).toBe(1);
  });

  it('同一回合第二次被拒：无论去往另一相邻层还是退回原层', () => {
    const m = step(load(masterScene()), 'pM', 'dreamMasterMove', [2]);
    expect(isRejected(m, 'pM', 'dreamMasterMove', [3])).toBe(true);
    expect(isRejected(m, 'pM', 'dreamMasterMove', [1])).toBe(true);
  });

  it('被拒的第二次不改变状态', () => {
    const m = step(load(masterScene()), 'pM', 'dreamMasterMove', [2]);
    const res = applyMove(game, m, { playerID: 'pM', move: 'dreamMasterMove', args: [3] });
    expect(res.ok).toBe(false);
    expect(m.G.players.pM!.currentLayer).toBe(2);
    expect(m.G.players.pM!.skillUsedThisTurn[MASTER_FREE_MOVE_KEY]).toBe(1);
  });

  it('下一回合开始计数清零，可以再移动一次', () => {
    const used = step(load(masterScene()), 'pM', 'dreamMasterMove', [2]).G;
    const next = beginTurn({ ...used, turnPhase: 'turnEnd' }, 'pM');
    expect(next.players.pM!.skillUsedThisTurn[MASTER_FREE_MOVE_KEY] ?? 0).toBe(0);
    const again = step(load({ ...next, turnPhase: 'action' }), 'pM', 'dreamMasterMove', [3]);
    expect(again.G.players.pM!.currentLayer).toBe(3);
  });

  it('梦境穿梭剂的移动不占免费移动的次数，反之亦然', () => {
    let m = step(load(masterScene()), 'pM', 'playDreamTransit', [TRANSIT, 2]);
    expect(m.G.players.pM!.skillUsedThisTurn[MASTER_FREE_MOVE_KEY] ?? 0).toBe(0);
    m = step(m, 'pM', 'dreamMasterMove', [3]);
    expect(m.G.players.pM!.currentLayer).toBe(3);
    expect(m.G.players.pM!.skillUsedThisTurn[MASTER_FREE_MOVE_KEY]).toBe(1);
  });

  it('非相邻层、不在出牌阶段、不是梦主仍被拒', () => {
    expect(isRejected(load(masterScene()), 'pM', 'dreamMasterMove', [3])).toBe(true);
    expect(isRejected(load(masterScene({ turnPhase: 'draw' })), 'pM', 'dreamMasterMove', [2])).toBe(
      true,
    );
    expect(
      isRejected(load(masterScene({ currentPlayerID: 'p1' })), 'p1', 'dreamMasterMove', [2]),
    ).toBe(true);
  });
});

describe('梦主的免费移动：要塞·冷酷的发动机会', () => {
  const fortressScene = () => withPlayer(masterScene(), 'pM', { characterId: c('dm_fortress') });

  it('免费移动那一次仍累计一次发动机会', () => {
    const m = step(load(fortressScene()), 'pM', 'dreamMasterMove', [2]);
    expect(fortressColdnessChancesLeft(m.G.players.pM!.skillUsedThisTurn)).toBe(1);
  });

  it('免费移动之后再用穿梭剂换层，机会继续累计到 2 次', () => {
    let m = step(load(fortressScene()), 'pM', 'dreamMasterMove', [2]);
    m = step(m, 'pM', 'playDreamTransit', [TRANSIT, 3]);
    expect(fortressColdnessChancesLeft(m.G.players.pM!.skillUsedThisTurn)).toBe(2);
  });

  it('第二次被拒的免费移动不多给机会', () => {
    const m = step(load(fortressScene()), 'pM', 'dreamMasterMove', [2]);
    expect(isRejected(m, 'pM', 'dreamMasterMove', [3])).toBe(true);
    expect(fortressColdnessChancesLeft(m.G.players.pM!.skillUsedThisTurn)).toBe(1);
  });
});
