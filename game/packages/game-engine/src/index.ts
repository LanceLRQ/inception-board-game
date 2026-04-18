// @icgame/game-engine - GameEngine 适配层

export interface GameEngine {
  // 生命周期
  setup(playerCount: number, options?: Record<string, unknown>): GameState;
  // Move 处理
  processMove(state: GameState, move: string, payload: unknown, ctx: GameContext): GameState;
  // 合法性校验
  validateMove(state: GameState, move: string, payload: unknown, ctx: GameContext): boolean;
}

export interface GameState {
  turn: number;
  phase: string;
  players: Record<string, unknown>;
  // 待扩展
}

export interface GameContext {
  currentPlayer: string;
  playOrder: string[];
  numPlayers: number;
  random?: {
    D6: () => number;
  };
}
