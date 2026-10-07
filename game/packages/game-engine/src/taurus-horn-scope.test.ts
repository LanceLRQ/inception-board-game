// 金牛·号角的生效范围：只对【SHOOT】生效（普通 SHOOT 与选择按 SHOOT 结算的 SHOOT·梦境穿梭剂），
// 刺客之王、爆甲螺旋、炸裂弹头不触发；皇城世界观下那次视为使用的 SHOOT 同样可以启动号角。
// 全部经对局运行器驱动真实 move。
// 对照：docs/manual/05-dream-thieves.md 金牛（号角：使用【SHOOT】时；皇城世界观影响下同样可启动）

import { describe, it, expect } from 'vitest';
import type { CardID } from '@icgame/shared';
import type { SetupState } from './setup.js';
import { applyMove, type RandomSource } from './runner/matchRunner.js';
import { checkStateInvariants } from './engine/stateInvariants.js';
import { c, game, KICK, load, scene, withPlayer } from './testing/runnerHarness.js';

/** 按顺序给出骰值：第 1 颗是目标的掷骰，第 2 颗是号角的掷骰 */
function sequenceRandom(rolls: number[]): RandomSource {
  const queue = [...rolls];
  const next = () => {
    const v = queue.shift();
    if (v === undefined) throw new Error('骰值序列用完了');
    return v;
  };
  return { D6: next, Die: next, Shuffle: (arr) => arr };
}

function taurusScene(hand: CardID[], extra: Partial<SetupState> = {}): SetupState {
  const base = scene(
    {
      p1: { layer: 1, hand },
      p2: { layer: 1, hand: [KICK] },
      p3: { layer: 2, hand: [KICK] },
      p4: { layer: 3, hand: [KICK] },
      pM: { layer: 1, hand: [KICK] },
    },
    { currentPlayerID: 'p1', ...extra },
  );
  return withPlayer(base, 'p1', { characterId: c('thief_taurus') });
}

function run(G: SetupState, move: string, args: unknown[], rolls: number[]) {
  const res = applyMove(
    game,
    load(G),
    { playerID: 'p1', move, args },
    { random: sequenceRandom(rolls) },
  );
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error(`${move} 被拒绝`);
  expect(checkStateInvariants(res.state.G)).toEqual([]);
  return res.state.G;
}

const SHOOT = c('action_shoot');
const SHOOT_TRANSIT = c('action_shoot_dream_transit');
const ASSASSIN = c('action_shoot_assassin');
const DRILL = c('action_shoot_drill');
const BURST = c('action_shoot_burst');

describe('金牛·号角：只对【SHOOT】生效', () => {
  it('普通 SHOOT：目标掷 3（移动）、金牛掷 5 → 目标被击杀', () => {
    const after = run(taurusScene([SHOOT]), 'playShoot', ['p2', SHOOT], [3, 5]);
    expect(after.players.p2!.isAlive).toBe(false);
  });

  it('SHOOT·梦境穿梭剂按 SHOOT 结算：目标掷 3、金牛掷 5 → 目标被击杀', () => {
    const after = run(
      taurusScene([SHOOT_TRANSIT]),
      'playShootDreamTransit',
      [SHOOT_TRANSIT, 'shoot', 'p2'],
      [3, 5],
    );
    expect(after.players.p2!.isAlive).toBe(false);
  });

  it('刺客之王：目标掷 3（移动）→ 按原规则移动，号角不触发（不消耗第 2 颗骰）', () => {
    const after = run(taurusScene([ASSASSIN]), 'playShootKing', ['p2', ASSASSIN], [3]);
    expect(after.players.p2!.isAlive).toBe(true);
    expect(after.players.p2!.currentLayer).toBe(2);
  });

  it('爆甲螺旋：目标掷 3（移动）→ 按原规则移动，号角不触发', () => {
    const after = run(taurusScene([DRILL]), 'playShootArmor', ['p2', DRILL], [3]);
    expect(after.players.p2!.isAlive).toBe(true);
    expect(after.players.p2!.currentLayer).toBe(2);
  });

  it('炸裂弹头：目标掷 3（移动）→ 按原规则移动，号角不触发', () => {
    const after = run(taurusScene([BURST]), 'playShootBurst', ['p2', BURST], [3]);
    expect(after.players.p2!.isAlive).toBe(true);
    expect(after.players.p2!.currentLayer).toBe(2);
  });

  it('刺客之王：目标掷 6（落空）→ 仍然落空，不会被号角改成击杀', () => {
    const after = run(taurusScene([ASSASSIN]), 'playShootKing', ['p2', ASSASSIN], [6]);
    expect(after.players.p2!.isAlive).toBe(true);
    expect(after.players.p2!.currentLayer).toBe(1);
  });
});

describe('金牛·号角：皇城世界观下视为使用的【SHOOT】', () => {
  function imperial(): SetupState {
    const base = taurusScene([KICK]);
    const withMaster = withPlayer(base, 'pM', { characterId: c('dm_imperial_city') });
    return withPlayer(withMaster, 'p1', { imperialShootCharges: 1 });
  }

  it('对方掷 6 减 3 得 3，金牛掷 4（不减）→ 对方被击杀', () => {
    const after = run(imperial(), 'useImperialCityWorldShoot', ['p2'], [6, 4]);
    expect(after.players.p2!.isAlive).toBe(false);
    expect(after.players.p1!.imperialShootCharges).toBe(0);
  });

  it('金牛掷 3 不大于对方的 3 → 按原效果，对方移动', () => {
    const after = run(imperial(), 'useImperialCityWorldShoot', ['p2'], [6, 3]);
    expect(after.players.p2!.isAlive).toBe(true);
    expect(after.players.p2!.currentLayer).toBe(2);
  });
});
