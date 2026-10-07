// 要塞世界观接线：梦主的掷骰结果 -1（最低为 1）。
// 对照：docs/manual/06-dream-master.md 要塞（118-127 行）：「该梦主的世界观会被其它效果所影响」；
//       docs/manual/05-dream-thieves.md 灵雕师 300 行：对要塞使用雕琢时，-1 的效果被忽视。
// 梦主掷骰的唯一场合是被 SHOOT 类结算时作为目标（SHOOT 是目标掷骰）；
// 梦魇、盗梦者技能、其他世界观里的掷骰都是盗梦者在掷，没有以梦主为掷骰人的路径。
// 经真实 move 驱动；骰值按调用顺序给出。

import { describe, it, expect } from 'vitest';
import type { CardID } from '@icgame/shared';
import { applyFortressWorldRoll } from './engine/skills.js';
import type { SetupState } from './setup.js';
import { applyMove, type RandomSource } from './runner/matchRunner.js';
import { rollShootOutcome } from './moves/shootResolution.js';
import { c, game, KICK, load, scene, withPlayer } from './testing/runnerHarness.js';

const SHOOT = c('action_shoot');
const FORTRESS = c('dm_fortress');
const CHESS = c('dm_chess');

function queued(...rolls: number[]): RandomSource {
  const q = [...rolls];
  const next = () => q.shift() ?? 6;
  return { D6: next, Die: next, Shuffle: (arr) => arr };
}

/** p1 手持 SHOOT，与梦主 pM、盗梦者 p2 同在第 1 层；梦主角色可换 */
function shootScene(masterChar: CardID, shooterChar: string = 'thief_none'): SetupState {
  let G = scene(
    {
      p1: { layer: 1, hand: [SHOOT] },
      p2: { layer: 1, hand: [KICK] },
      p3: { layer: 2, hand: [KICK] },
      p4: { layer: 2, hand: [KICK] },
      pM: { layer: 1, hand: [KICK, KICK] },
    },
    { currentPlayerID: 'p1', turnPhase: 'action' },
  );
  G = withPlayer(G, 'pM', { characterId: masterChar });
  return withPlayer(G, 'p1', { characterId: c(shooterChar) });
}

function shoot(G: SetupState, target: string, ...rolls: number[]) {
  const res = applyMove(
    game,
    load(G),
    { playerID: 'p1', move: 'playShoot', args: [target, SHOOT] },
    { random: queued(...rolls) },
  );
  expect(res.ok, 'playShoot 应被接受').toBe(true);
  if (!res.ok) throw new Error(`被拒绝：${res.reason}`);
  return res.state.G;
}

describe('要塞世界观 · 梦主被 SHOOT', () => {
  it('掷出 2 → 结算为 1：被击杀（普通 SHOOT：1 死亡，2-4 移动）', () => {
    const G = shoot(shootScene(FORTRESS), 'pM', 2);
    expect(G.players.pM!.isAlive).toBe(false);
    expect(G.lastShootRoll).toBe(2); // 展示的是未修饰的真实骰值
  });

  it('同样掷出 2，梦主不是要塞：只是移动', () => {
    const G = shoot(shootScene(CHESS), 'pM', 2);
    expect(G.players.pM!.isAlive).toBe(true);
    expect(G.players.pM!.currentLayer).toBe(2);
  });

  it('掷出 1 仍是 1（最低为 1）：被击杀', () => {
    const G = shoot(shootScene(FORTRESS), 'pM', 1);
    expect(G.players.pM!.isAlive).toBe(false);
  });

  it('掷出 5 → 4：从躲过变成移动', () => {
    const fortress = shoot(shootScene(FORTRESS), 'pM', 5);
    expect(fortress.players.pM!.currentLayer).toBe(2);
    const chess = shoot(shootScene(CHESS), 'pM', 5);
    expect(chess.players.pM!.currentLayer).toBe(1);
  });

  it('SHOOT 盗梦者不受影响：掷出 2 仍是移动', () => {
    const G = shoot(shootScene(FORTRESS), 'p2', 2);
    expect(G.players.p2!.isAlive).toBe(true);
    expect(G.players.p2!.currentLayer).toBe(2);
  });

  it('背叛者（梦主阵营的盗梦者）掷骰不 -1', () => {
    const G = withPlayer(shootScene(FORTRESS), 'p2', { faction: 'master' });
    const after = shoot(G, 'p2', 2);
    expect(after.players.p2!.isAlive).toBe(true);
  });
});

describe('要塞世界观 · 处女·完美按修正后的最终点数判断', () => {
  it('梦主掷出 6 → 5：不触发处女·完美', () => {
    const G = withPlayer(shootScene(FORTRESS), 'p3', { characterId: c('thief_virgo') });
    const after = shoot(G, 'pM', 6);
    expect(after.pendingVirgoChoice).toBeNull();
  });

  it('梦主不是要塞：同样掷出 6 触发处女·完美', () => {
    const G = withPlayer(shootScene(CHESS), 'p3', { characterId: c('thief_virgo') });
    const after = shoot(G, 'pM', 6);
    expect(after.pendingVirgoChoice).toMatchObject({ virgoID: 'p3', triggerRoll: 6 });
  });
});

describe('要塞世界观 · 与其他修正的先后', () => {
  it('灵雕师·雕琢：用梦主的手牌数作最终点数，要塞的 -1 被忽视', () => {
    // 梦主手牌 2 张 → 点数 2 → 移动；若被要塞再 -1 就成了 1 → 死亡
    const G = shoot(shootScene(FORTRESS, 'thief_soul_sculptor'), 'pM', 6);
    expect(G.players.pM!.isAlive).toBe(true);
    expect(G.players.pM!.currentLayer).toBe(2);
  });

  it('恐怖分子狂热惩罚 + 要塞：叠加后最低为 1', () => {
    const G = shootScene(FORTRESS, 'thief_terrorist');
    const faces = { deathFaces: [1], moveFaces: [2, 3, 4] };
    // 原始 3：狂热 -1 → 2，要塞 -1 → 1：死亡（只有狂热会是移动）
    const stacked = rollShootOutcome(G, 'p1', 'pM', SHOOT, faces, queued(3), true);
    expect(stacked.settledRoll).toBe(1);
    expect(stacked.result).toBe('kill');
    const noFortress = rollShootOutcome(
      withPlayer(G, 'pM', { characterId: CHESS }),
      'p1',
      'pM',
      SHOOT,
      faces,
      queued(3),
      true,
    );
    expect(noFortress.settledRoll).toBe(2);
    expect(noFortress.result).toBe('move');
    // 原始 2：狂热 → 1，要塞再减仍是 1
    expect(rollShootOutcome(G, 'p1', 'pM', SHOOT, faces, queued(2), true).settledRoll).toBe(1);
  });

  it('哈雷·冲击（-2）+ 要塞：叠加后最低为 1', () => {
    const G = shootScene(FORTRESS, 'thief_haley');
    const faces = { deathFaces: [1], moveFaces: [2, 3, 4] };
    const r = rollShootOutcome(G, 'p1', 'pM', null, faces, queued(4), false, true);
    // 4 → 2（哈雷）→ 1（要塞）
    expect(r.settledRoll).toBe(1);
    expect(r.result).toBe('kill');
  });

  it('天蝎·毒针：两颗骰取差值后再 -1', () => {
    // 差值 |3-1| = 2 → 要塞 -1 → 1：死亡
    const G = shoot(shootScene(FORTRESS, 'thief_scorpius'), 'pM', 3, 1);
    expect(G.players.pM!.isAlive).toBe(false);
    // 梦主不是要塞：差值 2 → 移动
    const other = shoot(shootScene(CHESS, 'thief_scorpius'), 'pM', 3, 1);
    expect(other.players.pM!.isAlive).toBe(true);
  });

  it('天蝎·毒针：两颗骰相同（差 0 视为 1），要塞不会再减到 0', () => {
    const G = shootScene(FORTRESS, 'thief_scorpius');
    const faces = { deathFaces: [1], moveFaces: [2, 3, 4] };
    const r = rollShootOutcome(G, 'p1', 'pM', SHOOT, faces, queued(4, 4));
    expect(r.settledRoll).toBe(1);
  });

  it('金牛·号角：用修正后的梦主点数与自己的骰比大小', () => {
    // 梦主掷 3 → 要塞 2（移动，非击杀），金牛掷 3：3 > 2 击杀
    const G = shoot(shootScene(FORTRESS, 'thief_taurus'), 'pM', 3, 3);
    expect(G.players.pM!.isAlive).toBe(false);
    // 梦主不是要塞：3 > 3 不成立，只是移动
    const other = shoot(shootScene(CHESS, 'thief_taurus'), 'pM', 3, 3);
    expect(other.players.pM!.isAlive).toBe(true);
  });
});

describe('要塞世界观 · 意念判官·定罪', () => {
  function sudgerScene(masterChar: CardID): SetupState {
    return withPlayer(shootScene(masterChar, 'thief_sudger_of_mind'), 'p1', { hand: [SHOOT] });
  }

  it('梦主的两颗骰由射手挑一颗，选中的那颗再 -1', () => {
    const run = (masterChar: CardID) => {
      const first = applyMove(
        game,
        load(sudgerScene(masterChar)),
        { playerID: 'p1', move: 'playShootSudger', args: ['pM', SHOOT] },
        { random: queued(2, 6) },
      );
      expect(first.ok).toBe(true);
      if (!first.ok) throw new Error('定罪第一步被拒绝');
      const second = applyMove(
        game,
        first.state,
        { playerID: 'p1', move: 'resolveSudgerPick', args: ['A'] },
        { random: queued() },
      );
      expect(second.ok).toBe(true);
      if (!second.ok) throw new Error('定罪第二步被拒绝');
      return second.state.G;
    };
    // 选 A（2）：要塞 → 1 死亡；非要塞 → 2 移动
    expect(run(FORTRESS).players.pM!.isAlive).toBe(false);
    expect(run(CHESS).players.pM!.isAlive).toBe(true);
  });
});

describe('要塞世界观 · 纯函数', () => {
  it('applyFortressWorldRoll：只对梦主本人、且梦主是要塞时生效', () => {
    const G = shootScene(FORTRESS);
    expect(applyFortressWorldRoll(G, 'pM', 4)).toBe(3);
    expect(applyFortressWorldRoll(G, 'pM', 1)).toBe(1);
    expect(applyFortressWorldRoll(G, 'p2', 4)).toBe(4);
    expect(applyFortressWorldRoll(shootScene(CHESS), 'pM', 4)).toBe(4);
  });
});
