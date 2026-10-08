// 盖亚·撼动：盖亚选一个方向（-1 或 +1），同层其余玩家全部移到那一层；不能只挑部分人，
// 不能因此进入迷失层，盖亚自己不动；回合限 2 次。经对局运行器驱动真实 move。
// 对照：docs/manual/05-dream-thieves.md 盖亚（第 27-33 行）
//   「令你所在层的其余玩家移动到所在层数-1或+1的梦境，不能因此进入迷失层」
//   「所有当层其余玩家都必须到你指定的相邻一层梦境」

import { describe, it, expect } from 'vitest';
import type { SetupState } from './setup.js';
import { applyMove } from './runner/matchRunner.js';
import { checkStateInvariants } from './engine/stateInvariants.js';
import { sendToLimbo } from './engine/death.js';
import { c, fixedRandom, game, KICK, load, scene, withPlayer } from './testing/runnerHarness.js';

const GAIA = c('thief_gaia');
const SKILL_KEY = 'thief_gaia.skill_0';

/** p1 是盖亚，与 p2、p3、梦主同在 gaiaLayer 层；p4 在第 1 层以外的另一层做旁观 */
function gaiaScene(gaiaLayer: 1 | 2 | 3 | 4 = 2, extra: Partial<SetupState> = {}): SetupState {
  const bystanderLayer = gaiaLayer === 4 ? 1 : 4;
  const G = scene(
    {
      p1: { layer: gaiaLayer, hand: [KICK] },
      p2: { layer: gaiaLayer, hand: [KICK] },
      p3: { layer: gaiaLayer, hand: [KICK] },
      p4: { layer: bystanderLayer, hand: [KICK] },
      pM: { layer: gaiaLayer, hand: [KICK] },
    },
    { currentPlayerID: 'p1', ...extra },
  );
  return withPlayer(G, 'p1', { characterId: GAIA });
}

function run(G: SetupState, args: unknown[], playerID = 'p1') {
  const res = applyMove(
    game,
    load(G),
    { playerID, move: 'playGaiaShift', args },
    { random: fixedRandom(3) },
  );
  return res;
}

function ok(G: SetupState, args: unknown[]): SetupState {
  const res = run(G, args);
  expect(res.ok, res.ok ? '' : `被拒绝：${res.reason}`).toBe(true);
  if (!res.ok) throw new Error('unreachable');
  expect(checkStateInvariants(res.state.G)).toEqual([]);
  return res.state.G;
}

describe('盖亚·撼动：选一个方向，同层其余玩家全部移动', () => {
  it('+1：同层其余玩家（含梦主）全部到上一层，盖亚自己不动', () => {
    const G = ok(gaiaScene(2), [1]);
    for (const id of ['p2', 'p3', 'pM']) expect(G.players[id]!.currentLayer).toBe(3);
    expect(G.players.p1!.currentLayer).toBe(2);
    expect(G.layers[3]!.playersInLayer.sort()).toEqual(['p2', 'p3', 'pM']);
    expect(G.layers[2]!.playersInLayer).toEqual(['p1']);
    expect(G.players.p4!.currentLayer).toBe(4);
    expect(G.players.p1!.skillUsedThisTurn[SKILL_KEY]).toBe(1);
  });

  it('-1：同层其余玩家全部到下一层', () => {
    const G = ok(gaiaScene(3), [-1]);
    for (const id of ['p2', 'p3', 'pM']) expect(G.players[id]!.currentLayer).toBe(2);
    expect(G.players.p1!.currentLayer).toBe(3);
  });

  it('不在同层的玩家和迷失层里的玩家都不受影响', () => {
    const lost = sendToLimbo(gaiaScene(2), 'p3');
    const G = ok(lost, [1]);
    expect(G.players.p3!.currentLayer).toBe(0);
    expect(G.players.p3!.isAlive).toBe(false);
    expect(G.players.p2!.currentLayer).toBe(3);
    expect(G.players.p4!.currentLayer).toBe(4);
  });

  it('边界：盖亚在第 1 层不能选 -1（会进入迷失层），选 +1 可以', () => {
    expect(run(gaiaScene(1), [-1]).ok).toBe(false);
    const G = ok(gaiaScene(1), [1]);
    expect(G.players.p2!.currentLayer).toBe(2);
    expect(G.players.p2!.isAlive).toBe(true);
  });

  it('边界：盖亚在第 4 层不能选 +1，选 -1 可以', () => {
    expect(run(gaiaScene(4), [1]).ok).toBe(false);
    const G = ok(gaiaScene(4), [-1]);
    expect(G.players.pM!.currentLayer).toBe(3);
  });

  it('被拒绝时状态原样不动（不消耗次数）', () => {
    const before = gaiaScene(1);
    const res = run(before, [-1]);
    expect(res.ok).toBe(false);
    expect(load(before).G.players.p1!.skillUsedThisTurn[SKILL_KEY]).toBeUndefined();
  });

  it('旧入参（逐人选方向的对象）被拒绝', () => {
    expect(run(gaiaScene(2), [{ p2: 1 }]).ok).toBe(false);
    expect(run(gaiaScene(2), [{ p2: 1, p3: 1, pM: 1 }]).ok).toBe(false);
    expect(run(gaiaScene(2), [{}]).ok).toBe(false);
  });

  it('不是 -1 / +1 的方向被拒绝', () => {
    for (const bad of [0, 2, -2, 1.5, '1', null, undefined, true]) {
      expect(run(gaiaScene(2), [bad]).ok, String(bad)).toBe(false);
    }
    expect(run(gaiaScene(2), []).ok).toBe(false);
  });

  it('同层没有其他玩家时不能发动（不产生任何效果）', () => {
    const G = scene(
      {
        p1: { layer: 2, hand: [KICK] },
        p2: { layer: 3, hand: [KICK] },
        p3: { layer: 3, hand: [KICK] },
        p4: { layer: 4, hand: [KICK] },
        pM: { layer: 3, hand: [KICK] },
      },
      { currentPlayerID: 'p1' },
    );
    expect(run(withPlayer(G, 'p1', { characterId: GAIA }), [1]).ok).toBe(false);
  });

  it('回合限 2 次，第 3 次被拒绝', () => {
    const first = ok(gaiaScene(2), [1]);
    // 把同层的人拉回来再发动一次
    const regroup = (G: SetupState): SetupState => {
      const layers = { ...G.layers };
      for (const l of [1, 2, 3, 4]) {
        layers[l] = {
          ...layers[l]!,
          playersInLayer: l === 2 ? ['p1', 'p2', 'p3', 'pM'] : l === 4 ? ['p4'] : [],
        };
      }
      let out: SetupState = { ...G, layers };
      for (const id of ['p2', 'p3', 'pM']) out = withPlayer(out, id, { currentLayer: 2 });
      return out;
    };
    const second = ok(regroup(first), [-1]);
    expect(second.players.p1!.skillUsedThisTurn[SKILL_KEY]).toBe(2);
    expect(run(regroup(second), [1]).ok).toBe(false);
  });

  it('只有盖亚本人、出牌阶段、回合主人才能发动', () => {
    expect(run(withPlayer(gaiaScene(2), 'p1', { characterId: c('thief_athena') }), [1]).ok).toBe(
      false,
    );
    expect(run(gaiaScene(2, { turnPhase: 'discard' }), [1]).ok).toBe(false);
    expect(run(gaiaScene(2, { turnPhase: 'draw' }), [1]).ok).toBe(false);
    expect(run(gaiaScene(2), [1], 'p2').ok).toBe(false);
  });

  it('盖亚已死亡不能发动', () => {
    expect(run(sendToLimbo(gaiaScene(2), 'p1'), [1]).ok).toBe(false);
  });
});
