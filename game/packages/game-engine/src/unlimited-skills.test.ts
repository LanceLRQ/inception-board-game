// 卡面没写次数限制的技能不限次数：穿行者·支助、筑梦师·迷宫、译梦师·伏笔、要塞·冷酷、冥王星·业火、狮子·王道。
// 每个技能本身的代价与前提（交出手牌、弃牌、有盗梦者手牌不足 2 张等）仍然限制发动。
// 对照：docs/manual/03-game-flow.md「限一次」（只有技能后写着“限一次”才每回合一次）；
//       docs/manual/06-dream-master.md 冥王星·地狱 详述（业火发动的次数无限制）
// 经对局运行器驱动真实 move 的用例同一回合里连续发动两次；由规则触发的几个用纯函数连续触发两次。

import { describe, it, expect } from 'vitest';
import type { SetupState } from './setup.js';
import { applyMove } from './runner/matchRunner.js';
import { checkStateInvariants } from './engine/stateInvariants.js';
import { applyInterpreterForeshadow, applyLeoKingdom } from './engine/skills.js';
import {
  c,
  fixedRandom,
  game,
  KICK,
  load,
  scene,
  SHOOT,
  withPlayer,
} from './testing/runnerHarness.js';

function run(G: SetupState, playerID: string, move: string, args: unknown[], roll = 3) {
  const res = applyMove(game, load(G), { playerID, move, args }, { random: fixedRandom(roll) });
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error(`${move} 被拒绝`);
  expect(checkStateInvariants(res.state.G)).toEqual([]);
  return res.state.G;
}

function rejected(G: SetupState, playerID: string, move: string, args: unknown[]): boolean {
  const res = applyMove(game, load(G), { playerID, move, args }, { random: fixedRandom(3) });
  return !res.ok;
}

describe('穿行者·支助：同一回合可以多次发动', () => {
  const touristScene = () =>
    withPlayer(
      scene(
        {
          p1: { layer: 1, hand: [KICK, KICK] },
          p2: { layer: 2, hand: [KICK] },
          p3: { layer: 3, hand: [KICK] },
          p4: { layer: 4, hand: [KICK] },
          pM: { layer: 1, hand: [KICK] },
        },
        { currentPlayerID: 'p1' },
      ),
      'p1',
      { characterId: c('thief_tourist') },
    );

  it('第一次交出全部手牌后又有手牌，第二次仍然合法', () => {
    const first = run(touristScene(), 'p1', 'playTouristAssist', ['p2']);
    expect(first.players.p1!.currentLayer).toBe(2);
    expect(first.players.p1!.hand).toEqual([]);
    const refilled = withPlayer(first, 'p1', { hand: [KICK] });
    const second = run(refilled, 'p1', 'playTouristAssist', ['p3']);
    expect(second.players.p1!.currentLayer).toBe(3);
    expect(second.players.p3!.hand).toHaveLength(2);
  });

  it('代价仍在：手牌为空时不能发动', () => {
    const first = run(touristScene(), 'p1', 'playTouristAssist', ['p2']);
    expect(rejected(first, 'p1', 'playTouristAssist', ['p3'])).toBe(true);
  });
});

describe('筑梦师·迷宫：同一回合可以多次发动', () => {
  const architectScene = () =>
    withPlayer(
      scene(
        {
          p1: { layer: 1, hand: [SHOOT, SHOOT] },
          p2: { layer: 1, hand: [KICK] },
          p3: { layer: 1, hand: [KICK] },
          p4: { layer: 3, hand: [KICK] },
          pM: { layer: 1, hand: [KICK] },
        },
        { currentPlayerID: 'p1' },
      ),
      'p1',
      { characterId: c('thief_architect') },
    );

  it('连续弃两张 SHOOT 类牌，第二次发动合法', () => {
    const first = run(architectScene(), 'p1', 'playArchitectMaze', [SHOOT, 'p2']);
    expect(first.mazeState?.mazedPlayerID).toBe('p2');
    const second = run(first, 'p1', 'playArchitectMaze', [SHOOT, 'p3']);
    expect(second.mazeState?.mazedPlayerID).toBe('p3');
    expect(second.players.p1!.hand).toEqual([]);
  });

  it('代价仍在：没有 SHOOT 类牌时不能发动', () => {
    const first = run(architectScene(), 'p1', 'playArchitectMaze', [SHOOT, 'p2']);
    const noShoot = withPlayer(first, 'p1', { hand: [KICK] });
    expect(rejected(noShoot, 'p1', 'playArchitectMaze', [KICK, 'p3'])).toBe(true);
  });
});

describe('冥王星·业火：同一回合可以多次发动', () => {
  const plutoScene = () =>
    withPlayer(
      scene({
        p1: { layer: 1, hand: [] },
        p2: { layer: 1, hand: [KICK, KICK] },
        p3: { layer: 2, hand: [KICK, KICK] },
        p4: { layer: 3, hand: [KICK, KICK] },
        pM: { layer: 1, hand: [KICK, KICK, KICK] },
      }),
      'pM',
      { characterId: c('dm_pluto_hell') },
    );

  it('每次都有盗梦者手牌少于 2 张时，连续发动两次都合法', () => {
    const first = run(plutoScene(), 'pM', 'usePlutoBurning', [KICK]);
    expect(first.players.p1!.hand).toHaveLength(2);
    const nextShort = withPlayer(first, 'p2', { hand: [KICK] });
    const second = run(nextShort, 'pM', 'usePlutoBurning', [KICK]);
    expect(second.players.p2!.hand).toHaveLength(3);
    expect(second.players.pM!.hand).toHaveLength(1);
  });

  it('没有盗梦者手牌少于 2 张时，第二次不能发动', () => {
    const first = run(plutoScene(), 'pM', 'usePlutoBurning', [KICK]);
    expect(rejected(first, 'pM', 'usePlutoBurning', [KICK])).toBe(true);
  });
});

describe('狮子·王道 / 译梦师·伏笔 / 要塞·冷酷：规则触发时不看本回合用过几次', () => {
  const usedOnce = (id: string, skillId: string) => (G: SetupState) =>
    withPlayer(G, id, { skillUsedThisTurn: { [skillId]: 1 } });

  it('狮子·王道：抽牌阶段的额外抽牌不受本回合已用次数影响', () => {
    const G = withPlayer(
      scene(
        {
          p1: { layer: 1, hand: [KICK] },
          p2: { layer: 1, hand: [KICK] },
          p3: { layer: 2, hand: [KICK] },
          p4: { layer: 3, hand: [KICK] },
          pM: { layer: 1, hand: [KICK, KICK, KICK] },
        },
        { currentPlayerID: 'p1', turnPhase: 'draw' },
      ),
      'p1',
      { characterId: c('thief_leo') },
    );
    const once = applyLeoKingdom(G, 'p1');
    expect(once.players.p1!.hand).toHaveLength(4);
    const twice = applyLeoKingdom(once, 'p1');
    expect(twice.players.p1!.hand).toHaveLength(7);
    const flagged = applyLeoKingdom(usedOnce('p1', 'thief_leo.skill_0')(G), 'p1');
    expect(flagged.players.p1!.hand).toHaveLength(4);
  });

  it('译梦师·伏笔：每次使用【解封】都抽 2 张', () => {
    const G = withPlayer(
      scene({
        p1: { layer: 1, hand: [KICK] },
        p2: { layer: 1, hand: [KICK] },
        p3: { layer: 2, hand: [KICK] },
        p4: { layer: 3, hand: [KICK] },
        pM: { layer: 1, hand: [KICK] },
      }),
      'p1',
      { characterId: c('thief_dream_interpreter') },
    );
    const once = applyInterpreterForeshadow(G, 'p1');
    const twice = applyInterpreterForeshadow(once, 'p1');
    expect(twice.players.p1!.hand).toHaveLength(5);
  });

  it('要塞·冷酷：每次移动到另一层都可以视为使用【SHOOT】', () => {
    let G = withPlayer(
      scene({
        p1: { layer: 2, hand: [KICK] },
        p2: { layer: 1, hand: [KICK] },
        p3: { layer: 2, hand: [KICK] },
        p4: { layer: 3, hand: [KICK] },
        pM: { layer: 1, hand: [KICK] },
      }),
      'pM',
      { characterId: c('dm_fortress') },
    );
    // 固定骰值 2：梦主射手的 M4 把目标骰 -1 → 1，击杀
    G = run(G, 'pM', 'dreamMasterMove', [2]);
    G = run(G, 'pM', 'useFortressColdness', ['p1'], 2);
    expect(G.players.p1!.isAlive).toBe(false);
    G = run(G, 'pM', 'dreamMasterMove', [1]);
    G = run(G, 'pM', 'dreamMasterMove', [2]);
    G = run(G, 'pM', 'useFortressColdness', ['p3'], 2);
    expect(G.players.p3!.isAlive).toBe(false);
    expect(checkStateInvariants(G)).toEqual([]);
  });
});
