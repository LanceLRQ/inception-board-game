// @icgame/bot - AI Bot 包导出

export { RandomBot } from './randomBot.js';
export type { Bot } from './randomBot.js';

export { SimpleBot } from './simpleBot.js';
export type { MoveDescriptor } from './simpleBot.js';

export { AITakeoverManager } from './takeover.js';
export type { TakeoverReason, TakeoverRecord } from './takeover.js';

export { MOVES_BY_PHASE, MOVE_PRIORITY, legalMovesFor } from './moveTables.js';
export { pickBotMove, defaultArgsFor } from './botMoves.js';
export { nextAutoAction, RESPONSE_MOVES } from './autoAction.js';
export type { AutoAction, AutoActionOptions } from './autoAction.js';
export { runBotPlayout } from './playout.js';
export type { BotPlayoutOptions, BotPlayoutResult, StallInfo, RejectedStep } from './playout.js';
