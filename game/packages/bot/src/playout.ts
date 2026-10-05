// 全 Bot 对局：用引擎的对局运行器从建局打到终局
//
// 每一步都走真实 move 与引擎守卫，并在每步之后检查不变量。
// 遇到被拒的 move 记录下来并停止，不重试；找不到下一步时记录停在哪些待结算字段上。

import { InceptionCityGame } from '@icgame/game-engine';
import type { SetupState } from '@icgame/game-engine/setup';
import { checkInvariants, type InvariantViolation } from '@icgame/game-engine/invariants';
import {
  applyMove,
  createMatch,
  type GameDef,
  type MoveRequest,
  type RejectReason,
} from '@icgame/game-engine/runner';
import { nextAutoAction } from './autoAction.js';

const game: GameDef<SetupState> = InceptionCityGame;

export interface BotPlayoutOptions {
  numPlayers: number;
  seed: string;
  /** 步数上限（每接受一个 move 算一步） */
  maxSteps: number;
}

/** 找不到下一步时的局面 */
export interface StallInfo {
  /** 停住时仍有值的待结算字段 */
  pendingFields: string[];
  phase: string | null;
  turnPhase: string;
  currentPlayer: string;
  turn: number;
}

/** 被运行器拒绝的那一步 */
export interface RejectedStep {
  step: number;
  request: MoveRequest;
  reason: RejectReason;
  why: string;
  error?: unknown;
}

export interface BotPlayoutResult {
  /** 被接受的 move 数 */
  steps: number;
  gameover: unknown;
  /** 没到终局又无事可做时的局面；没停滞为 null */
  stalledOn: StallInfo | null;
  /** 第一个被拒的 move；没有为 null */
  rejected: RejectedStep | null;
  /** 每步之后检查出的不变量违规（带出现的步数） */
  invariantViolations: (InvariantViolation & { step: number })[];
}

/** 局面里仍有值的待结算字段：以 pending 开头的字段，加上窥视结果 peekReveal */
function pendingFieldsOf(G: SetupState): string[] {
  return Object.entries(G)
    .filter(([key, value]) => (key.startsWith('pending') || key === 'peekReveal') && Boolean(value))
    .map(([key]) => key);
}

export function runBotPlayout(options: BotPlayoutOptions): BotPlayoutResult {
  const { numPlayers, seed, maxSteps } = options;
  let state = createMatch(game, { numPlayers, setupData: { rngSeed: seed }, seed });
  let steps = 0;
  let stalledOn: StallInfo | null = null;
  let rejected: RejectedStep | null = null;
  const invariantViolations: BotPlayoutResult['invariantViolations'] = [];

  while (steps < maxSteps && state.ctx.gameover === undefined) {
    const action = nextAutoAction(state, { humanPlayerIDs: [] });
    if (action === null) {
      stalledOn = {
        pendingFields: pendingFieldsOf(state.G),
        phase: state.ctx.phase,
        turnPhase: state.G.turnPhase,
        currentPlayer: state.ctx.currentPlayer,
        turn: state.ctx.turn,
      };
      break;
    }
    const request: MoveRequest = {
      playerID: action.playerID,
      move: action.move,
      args: action.args,
    };
    const outcome = applyMove(game, state, request);
    if (!outcome.ok) {
      rejected = {
        step: steps,
        request,
        reason: outcome.reason,
        why: action.why,
        ...(outcome.error !== undefined ? { error: outcome.error } : {}),
      };
      break;
    }
    state = outcome.state;
    steps++;
    for (const v of checkInvariants(state.G)) invariantViolations.push({ ...v, step: steps });
  }

  return { steps, gameover: state.ctx.gameover, stalledOn, rejected, invariantViolations };
}
