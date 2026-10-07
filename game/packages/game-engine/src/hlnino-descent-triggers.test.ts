// 降世神通·降临：出牌阶段任何让自己到达数字更大梦境的移动都算（含复活自己 0 → 1），
// 被别人在别人回合里移动不算，下移不算。全部经对局运行器驱动真实 move。
// 对照：docs/manual/05-dream-thieves.md 降世神通（详述）；docs/manual/08-appendix.md「移动」词条

import { describe, it, expect } from 'vitest';
import type { CardID } from '@icgame/shared';
import type { SetupState } from './setup.js';
import { applyMove } from './runner/matchRunner.js';
import { sendToLimbo } from './engine/death.js';
import {
  c,
  game,
  KICK,
  SHOOT,
  TRANSIT,
  fixedRandom,
  load,
  scene,
  withPlayer,
} from './testing/runnerHarness.js';

const SHOOT_TRANSIT = c('action_shoot_dream_transit');
const TELEKINESIS = c('action_telekinesis');

/** p1 是降世神通，轮到 p1 出牌 */
function hlninoScene(p1Layer: number, p1Hand: CardID[], extra: Partial<SetupState> = {}) {
  const base = scene(
    {
      p1: { layer: p1Layer, hand: p1Hand },
      p2: { layer: 3, hand: [KICK, KICK] },
      p3: { layer: 1, hand: [KICK] },
      p4: { layer: 3, hand: [KICK] },
      pM: { layer: 1, hand: [KICK] },
    },
    { currentPlayerID: 'p1', ...extra },
  );
  return withPlayer(base, 'p1', { characterId: c('thief_hlnino') });
}

function play(G: SetupState, playerID: string, move: string, args: unknown[]) {
  const res = applyMove(game, load(G), { playerID, move, args }, { random: fixedRandom(6) });
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error(`${move} 被拒绝`);
  return res.state.G;
}

describe('降世神通·降临的触发面', () => {
  it('SHOOT·梦境穿梭剂的移动模式上移：抽 2 张', () => {
    const G = play(hlninoScene(1, [SHOOT_TRANSIT]), 'p1', 'playShootDreamTransit', [
      SHOOT_TRANSIT,
      'transit',
      2,
    ]);
    expect(G.players.p1!.currentLayer).toBe(2);
    expect(G.players.p1!.hand).toHaveLength(2);
  });

  it('梦境穿梭剂上移只抽 2 张（不因收口重复触发）', () => {
    const G = play(hlninoScene(1, [TRANSIT]), 'p1', 'playDreamTransit', [TRANSIT, 2]);
    expect(G.players.p1!.currentLayer).toBe(2);
    expect(G.players.p1!.hand).toHaveLength(2);
  });

  it('复活自己（0 → 1）：抽 2 张', () => {
    const dead = sendToLimbo(hlninoScene(2, [SHOOT, SHOOT, UNLOCK_CARD]), 'p1');
    const G = play(dead, 'p1', 'playRevive', [null, [SHOOT, SHOOT]]);
    expect(G.players.p1!.isAlive).toBe(true);
    expect(G.players.p1!.currentLayer).toBe(1);
    // 弃 2 张后剩 1 张，再抽 2 张
    expect(G.players.p1!.hand).toEqual([UNLOCK_CARD, KICK, KICK]);
  });

  it('KICK 把自己换到更高层：抽 2 张', () => {
    const G = play(hlninoScene(1, [KICK]), 'p1', 'playKick', [KICK, 'p2']);
    expect(G.players.p1!.currentLayer).toBe(3);
    expect(G.players.p1!.hand).toHaveLength(2);
  });

  it('下移不触发', () => {
    const G = play(hlninoScene(3, [TRANSIT]), 'p1', 'playDreamTransit', [TRANSIT, 2]);
    expect(G.players.p1!.currentLayer).toBe(2);
    expect(G.players.p1!.hand).toHaveLength(0);
  });

  it('KICK 换到更低层不触发', () => {
    const G = play(hlninoScene(3, [KICK]), 'p1', 'playKick', [KICK, 'p3']);
    expect(G.players.p1!.currentLayer).toBe(1);
    expect(G.players.p1!.hand).toHaveLength(0);
  });

  it('别人的回合里被移动到更高层不触发', () => {
    // 轮到 p2（第 3 层）出牌，用念力牵引把 p1 从第 1 层拉到第 3 层
    const base = hlninoScene(1, [KICK], { currentPlayerID: 'p2' });
    const G = play(withPlayer(base, 'p2', { hand: [TELEKINESIS] }), 'p2', 'playTelekinesis', [
      TELEKINESIS,
      'p1',
    ]);
    expect(G.players.p1!.currentLayer).toBe(3);
    expect(G.players.p1!.hand).toEqual([KICK]);
  });

  it('不是降世神通的人上移不触发', () => {
    const base = hlninoScene(1, [TRANSIT]);
    const G = play(
      withPlayer(base, 'p1', { characterId: c('thief_athena') }),
      'p1',
      'playDreamTransit',
      [TRANSIT, 2],
    );
    expect(G.players.p1!.hand).toHaveLength(0);
  });
});

const UNLOCK_CARD = c('action_unlock');
