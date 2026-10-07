// move 共用的类型与守卫：对局上下文类型、回合阶段守卫、相邻层判断。

import type { SetupState } from '../setup.js';

export type BGIOCtx = {
  numPlayers: number;
  currentPlayer: string;
  playOrder: string[];
  playOrderPos: number;
};

export type BGIOEvents = {
  endTurn: (arg?: { next?: string }) => void;
  endPhase: () => void;
};

export type BGIORandom = {
  Die: (n: number) => number;
  D6: () => number;
  Shuffle: <T>(arr: T[]) => T[];
};

export type MoveCtx = {
  G: SetupState;
  ctx: BGIOCtx;
  playerID: string;
  random: BGIORandom;
  events: BGIOEvents;
};

// --- 合法性守卫 ---
export function guardTurnPhase(
  G: SetupState,
  ctx: BGIOCtx,
  expected: SetupState['turnPhase'],
): boolean {
  if (G.turnPhase !== expected) return false;
  if (ctx.currentPlayer !== G.currentPlayerID) return false;
  return true;
}

export function isAdjacent(from: number, to: number): boolean {
  return Math.abs(from - to) === 1 && from >= 1 && from <= 4 && to >= 1 && to <= 4;
}
