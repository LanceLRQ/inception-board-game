// 混合对局：玩家 '0' 当真人（由随机 move 生成器替他选步），其余玩家由自动行动判定接管。
// 覆盖 nextAutoAction 的待结算分支：真人回合里引发的响应窗口、SHOOT 响应、天秤、处女等，
// 都必须由自动行动收尾，不能让对局停住，也不能被运行器拒绝。

import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from '@icgame/game-engine';
import type { SetupState } from '@icgame/game-engine/setup';
import { applyMove, createMatch, type GameDef, type MatchState } from '@icgame/game-engine/runner';
import { makeTestRng, pickLegalMove } from '@icgame/game-engine/testing/moveFuzzer';
import { nextAutoAction } from './autoAction.js';

const game: GameDef<SetupState> = InceptionCityGame;

const HUMAN = '0';
const MAX_STEPS = 20000;
const SEEDS_PER_SIZE = 24;

interface MixedResult {
  numPlayers: number;
  seed: string;
  gameover: boolean;
  steps: number;
  /** 被拒的自动动作 */
  rejected: { step: number; move: string; playerID: string; reason: string; why: string }[];
  /** 停住时的局面 */
  stalled: {
    pendingFields: string[];
    phase: string | null;
    turnPhase: string;
    currentPlayer: string;
    turn: number;
    step: number;
  } | null;
  /** 自动动作被接受的次数，按 move 名统计 */
  autoMoves: Record<string, number>;
}

function pendingFieldsOf(G: SetupState): string[] {
  return Object.entries(G)
    .filter(([key, value]) => (key.startsWith('pending') || key === 'peekReveal') && Boolean(value))
    .map(([key]) => key);
}

function playMixed(numPlayers: number, seed: string): MixedResult {
  const rnd = makeTestRng(
    [...seed].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, numPlayers),
  );
  let state: MatchState<SetupState> = createMatch(game, {
    numPlayers,
    setupData: { rngSeed: seed },
    seed,
  });
  const result: MixedResult = {
    numPlayers,
    seed,
    gameover: false,
    steps: 0,
    rejected: [],
    stalled: null,
    autoMoves: {},
  };

  while (result.steps < MAX_STEPS && state.ctx.gameover === undefined) {
    const action = nextAutoAction(state, { humanPlayerIDs: [HUMAN] });
    if (action !== null) {
      const outcome = applyMove(game, state, action);
      if (!outcome.ok) {
        result.rejected.push({
          step: result.steps,
          move: action.move,
          playerID: action.playerID,
          reason: outcome.reason,
          why: action.why,
        });
        break;
      }
      state = outcome.state;
      result.steps++;
      result.autoMoves[action.move] = (result.autoMoves[action.move] ?? 0) + 1;
      continue;
    }

    // 在等真人：由随机 move 生成器替他选一步，发起者限定为真人
    const humanMove = pickLegalMove(game, state, rnd, { actors: [HUMAN] });
    const outcome = humanMove === null ? null : applyMove(game, state, humanMove);
    if (outcome === null || !outcome.ok) {
      result.stalled = {
        pendingFields: pendingFieldsOf(state.G),
        phase: state.ctx.phase,
        turnPhase: state.G.turnPhase,
        currentPlayer: state.ctx.currentPlayer,
        turn: state.ctx.turn,
        step: result.steps,
      };
      break;
    }
    state = outcome.state;
    result.steps++;
  }

  result.gameover = state.ctx.gameover !== undefined;
  return result;
}

describe('混合对局 · 随机真人 + 自动行动', () => {
  it('4–10 人全部打到终局，自动动作没有被拒，也没有停住，待结算分支被实际触发', () => {
    const results: MixedResult[] = [];
    for (let numPlayers = 4; numPlayers <= 10; numPlayers++) {
      for (let i = 0; i < SEEDS_PER_SIZE; i++) {
        results.push(playMixed(numPlayers, `mix-${numPlayers}-${i}`));
      }
    }

    const totals: Record<string, number> = {};
    for (const r of results) {
      for (const [move, count] of Object.entries(r.autoMoves)) {
        totals[move] = (totals[move] ?? 0) + count;
      }
    }

    expect(
      results.flatMap((r) =>
        r.rejected.map((x) => ({ ...x, numPlayers: r.numPlayers, seed: r.seed })),
      ),
    ).toEqual([]);
    expect(
      results
        .filter((r) => r.stalled !== null)
        .map((r) => ({ numPlayers: r.numPlayers, seed: r.seed, stalled: r.stalled })),
    ).toEqual([]);
    expect(
      results
        .filter((r) => !r.gameover)
        .map((r) => ({ numPlayers: r.numPlayers, seed: r.seed, steps: r.steps })),
    ).toEqual([]);

    // 待结算分支真实被触发：响应窗口放弃必现，其余收尾 move 至少再出现两种，
    // 否则这条测试没有验证到待结算分支
    const settleMoves = [
      'passResponse',
      'respondShootPass',
      'respondTerroristAccept',
      'resolveLibraSplit',
      'resolveLibraPick',
      'respondVirgoPerfect',
      'masterPeekBribeDecision',
      'peekerAcknowledge',
    ];
    const seen = settleMoves.filter((m) => (totals[m] ?? 0) > 0);
    expect(totals['passResponse'] ?? 0).toBeGreaterThan(0);
    expect(seen.length).toBeGreaterThanOrEqual(3);
  }, 60_000);
});
