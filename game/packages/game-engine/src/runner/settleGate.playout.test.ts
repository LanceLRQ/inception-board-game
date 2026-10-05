// 待结算闸门在真实对局里的效果

import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from '../game.js';
import type { SetupState } from '../setup.js';
import { BLOCKING_FIELDS } from '../engine/actionRights.js';
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
    if (!res.ok) expect(res.reason).toBe('not_active');
  });

  it('白羊·星尘的待选择不拦住回合主人推进回合，回合结束时被清空', () => {
    const s = afterSetup(5, 'aries');
    const cur = s.ctx.currentPlayer;
    const aries = s.ctx.playOrder.find((id) => id !== cur)!;
    const pending: MatchState<SetupState> = {
      ...s,
      G: {
        ...s.G,
        turnPhase: 'action',
        pendingAriesChoice: { ariesID: aries, victimLayer: 1, victimID: cur },
      },
    };
    const end = applyMove(game, pending, { playerID: cur, move: 'endActionPhase', args: [] });
    expect(end.ok).toBe(true);
    if (!end.ok) return;

    // 继续推进到回合结束：不丢弃手牌或直接结束弃牌阶段，二者择一
    let cursor = end.state;
    for (let step = 0; step < 3 && cursor.ctx.currentPlayer === cur; step++) {
      const next = ['skipDiscard', 'doDiscard']
        .map((move) =>
          applyMove(game, cursor, {
            playerID: cur,
            move,
            args: move === 'doDiscard' ? [cursor.G.players[cur]!.hand.slice(5)] : [],
          }),
        )
        .find((r) => r.ok);
      if (!next || !next.ok) break;
      cursor = next.state;
    }
    expect(cursor.ctx.currentPlayer).not.toBe(cur);
    expect(cursor.G.pendingAriesChoice).toBeNull();
  });

  it('生成器能猜中万有引力的牌池与天秤的分牌', () => {
    const base = afterSetup(5, 'settle-args');
    const cur = base.ctx.currentPlayer;
    const other = base.ctx.playOrder.find((id) => id !== cur)!;
    const rnd = makeTestRng(7);

    const gravity: MatchState<SetupState> = {
      ...base,
      G: {
        ...base.G,
        turnPhase: 'action',
        pendingGravity: {
          bonderPlayerID: cur,
          targetIds: [other],
          pool: ['action_shoot', 'action_kick'],
          pickOrder: [cur, other],
          pickCursor: 0,
        },
      },
    };
    const pickGravity = pickLegalMove(game, gravity, rnd);
    expect(pickGravity?.move).toBe('resolveGravityPick');

    const libra: MatchState<SetupState> = {
      ...base,
      G: {
        ...base.G,
        turnPhase: 'action',
        players: {
          ...base.G.players,
          [other]: { ...base.G.players[other]!, hand: ['a', 'b', 'c'] },
        },
        pendingLibra: { bonderPlayerID: cur, targetPlayerID: other, split: null },
      },
    };
    const split = pickLegalMove(game, libra, rnd);
    expect(split?.move).toBe('resolveLibraSplit');
    const afterSplit = applyMove(game, libra, split!);
    expect(afterSplit.ok).toBe(true);
    if (!afterSplit.ok) return;
    expect(pickLegalMove(game, afterSplit.state, rnd)?.move).toBe('resolveLibraPick');
  });

  it('不优先结算的随机对局不会停在未结算事项上', () => {
    const stalled: string[] = [];
    let playedGraft = 0;
    for (let n = 4; n <= 10; n++) {
      for (let k = 1; k <= 3; k++) {
        let s = afterSetup(n, `graft-${n}-${k}`);
        const rnd = makeTestRng(k * 977 + n);
        for (let step = 0; step < 400 && s.ctx.gameover === undefined; step++) {
          const cand = pickLegalMove(game, s, rnd, { preferSettle: false });
          if (!cand) {
            // 找不到任何合法 move：记下停在哪些待结算字段上
            for (const field of BLOCKING_FIELDS) {
              if (s.G[field]) stalled.push(`${field} n=${n} k=${k} step=${step}`);
            }
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
    expect(stalled).toEqual([]);
  });
});
