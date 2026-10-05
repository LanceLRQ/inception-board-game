// 待结算闸门在真实对局里的效果

import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from '../game.js';
import type { SetupState } from '../setup.js';
import { applyMove, createMatch, type GameDef, type MatchState } from './matchRunner.js';
import { makeTestRng, pickLegalMove } from './moveFuzzer.js';

const game: GameDef<SetupState> = InceptionCityGame;

function afterSetup(numPlayers: number, seed: string): MatchState<SetupState> {
  const s = createMatch(game, { numPlayers, setupData: { rngSeed: seed }, seed });
  const res = applyMove(game, s, { playerID: '0', move: 'completeSetup', args: [] });
  if (!res.ok) throw new Error('completeSetup 被拒绝');
  return res.state;
}

describe('待结算闸门 · 对局', () => {
  it('同一个 move：平时被接受，挂上未结算的嫁接后被拒绝', () => {
    const s = afterSetup(5, 'gate');
    const cur = s.ctx.currentPlayer;
    const draw = { playerID: cur, move: 'doDraw', args: [] };
    expect(applyMove(game, s, draw).ok).toBe(true);

    const pending: MatchState<SetupState> = {
      ...s,
      G: { ...s.G, pendingGraft: { playerID: cur } },
    };
    const res = applyMove(game, pending, draw);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('invalid_move');
  });

  it('不优先结算的随机对局不会停在未结算的嫁接上', () => {
    const stuckOnGraft: string[] = [];
    let playedGraft = 0;
    for (let n = 4; n <= 10; n++) {
      for (let k = 1; k <= 3; k++) {
        let s = afterSetup(n, `graft-${n}-${k}`);
        const rnd = makeTestRng(k * 977 + n);
        for (let step = 0; step < 400 && s.ctx.gameover === undefined; step++) {
          const cand = pickLegalMove(game, s, rnd, { preferSettle: false });
          if (!cand) {
            if (s.G.pendingGraft) stuckOnGraft.push(`n=${n} k=${k} step=${step}`);
            break;
          }
          if (cand.move === 'playGraft') playedGraft++;
          const res = applyMove(game, s, cand);
          if (!res.ok) throw new Error(`试跑通过的 move 正式执行被拒绝：${cand.move}`);
          s = res.state;
        }
      }
    }
    // 嫁接确实被打出过，否则这条测试什么也没验证
    expect(playedGraft).toBeGreaterThan(5);
    expect(stuckOnGraft).toEqual([]);
  });
});
