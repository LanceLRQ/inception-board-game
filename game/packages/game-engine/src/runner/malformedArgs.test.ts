// 全部 move 对畸形参数都应判为非法，而不是抛异常

import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from '../game.js';
import type { SetupState } from '../setup.js';
import { listAwaiting } from '../engine/actionRights.js';
import { applyMove, createMatch, type GameDef } from './matchRunner.js';
import { makeTestRng, pickLegalMove } from './moveFuzzer.js';

const game: GameDef<SetupState> = InceptionCityGame;

const MALFORMED: unknown[][] = [
  [],
  [null],
  [undefined, undefined],
  [null, null, null],
  [{}],
  [[]],
  [{}, {}, {}],
  [[], [], []],
  [0, 0, 0],
  [99, 99, 99],
  [-1, -1, -1],
  [1.5, 1.5, 1.5],
  ['x', 'x', 'x'],
  ['0', '0', '0'],
  [true, true, true],
  ['x', ['x'], 'x'],
  [['x'], 'x', ['x']],
  [{ a: 1 }, { a: 1 }],
  [{ a: null }],
  [{ a: [null] }],
  [[null], [null]],
  [[1], [1]],
  ['p1', 99, 'x'],
];

describe('对局运行器 · 畸形参数', () => {
  it('随机对局途中，任何 move 收到畸形参数都不抛异常', { timeout: 60_000 }, () => {
    const offenders = new Map<string, string>();
    let statesChecked = 0;
    const moveNames = Object.keys(game.phases.playing!.moves!);

    for (let n = 4; n <= 10; n++) {
      for (let k = 1; k <= 4; k++) {
        let s = createMatch(game, {
          numPlayers: n,
          setupData: { rngSeed: `bad-${k}` },
          seed: `bad-${n}-${k}`,
        });
        const rnd = makeTestRng(k * 53 + n);
        for (let step = 0; step < 300 && s.ctx.gameover === undefined; step++) {
          if (step % 3 === 0) {
            statesChecked++;
            // 回合主人，加上此刻被等待结算的人：结算类 move 只有后者才进得了 move 本体
            const actors = new Set([s.ctx.currentPlayer]);
            for (const entry of listAwaiting(s.G)) entry.actors.forEach((id) => actors.add(id));
            for (const playerID of actors) {
              for (const move of moveNames) {
                for (const args of MALFORMED) {
                  const res = applyMove(game, s, { playerID, move, args });
                  if (!res.ok && res.reason === 'move_error' && !offenders.has(move)) {
                    offenders.set(move, `${JSON.stringify(args)} → ${String(res.error)}`);
                  }
                }
              }
            }
          }
          const cand = pickLegalMove(game, s, rnd);
          if (!cand) break;
          const res = applyMove(game, s, cand);
          if (!res.ok) break;
          s = res.state;
        }
      }
    }

    // 检查过的状态要足够多，否则「没有抛异常」没有意义
    expect(statesChecked).toBeGreaterThan(1000);
    expect([...offenders.entries()]).toEqual([]);
  });
});
