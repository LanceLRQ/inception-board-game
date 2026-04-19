// @icgame/game-engine - GameEngine 适配层

// 幂等性检查：防止重复处理同一 intentId
const processedIntents = new Map<string, number>();

export interface GameEngine {
  setup(playerCount: number, options?: Record<string, unknown>): GameState;
  processMove(state: GameState, move: MoveIntent, ctx: GameContext): MoveResult;
  validateMove(state: GameState, move: MoveIntent, ctx: GameContext): ValidationResult;
}

export interface GameState {
  readonly turn: number;
  readonly phase: string;
  readonly players: Record<string, unknown>;
  readonly moveCounter: number;
  readonly schemaVersion: number;
}

export interface MoveIntent {
  readonly type: string;
  readonly payload: unknown;
  readonly intentId: string;
}

export interface MoveResult {
  readonly ok: boolean;
  readonly state: GameState;
  readonly error?: string;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly error?: string;
}

export interface GameContext {
  currentPlayer: string;
  playOrder: string[];
  numPlayers: number;
  random?: {
    D6: () => number;
  };
}

// 幂等检查：intentId 是否已处理
export function isIntentProcessed(intentId: string, _currentCounter: number): boolean {
  const lastCounter = processedIntents.get(intentId);
  if (lastCounter !== undefined) return true;
  return false;
}

// 标记 intentId 已处理
export function markIntentProcessed(intentId: string, counter: number): void {
  // 只保留最近 1000 个 intentId，防止内存泄漏
  if (processedIntents.size > 1000) {
    const oldest = processedIntents.keys().next().value;
    if (oldest !== undefined) processedIntents.delete(oldest);
  }
  processedIntents.set(intentId, counter);
}

// 递增 moveCounter 并生成新状态
export function incrementMoveCounter(state: GameState): GameState {
  return {
    ...state,
    moveCounter: state.moveCounter + 1,
  };
}
