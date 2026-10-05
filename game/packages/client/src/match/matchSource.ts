// 对局来源：对局界面只依赖这个接口，不关心状态来自本机 Worker 还是服务端

import type { MatchViewState, MoveRejectCode, SeatInfo } from '@icgame/game-engine';

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed';

export type MoveOutcome =
  | { ok: true }
  | { ok: false; code: MoveRejectCode | 'not_ready' | 'timeout' };

export interface MatchSource {
  /** 'local'：本机人机局；'remote'：服务端对局 */
  readonly kind: 'local' | 'remote';
  /** 最新视图；尚未就绪为 null */
  readonly view: MatchViewState | null;
  /** 本人的座位号；尚未就绪为 null */
  readonly seat: string | null;
  /** 座位表；本地来源按视图里的玩家生成（除本人外都是 Bot） */
  readonly seats: readonly SeatInfo[];
  /** 当前等待的截止时间（毫秒时间戳）；本地来源恒为 null */
  readonly deadlineAt: number | null;
  readonly connection: ConnectionState;
  /** 无法继续时的错误文案键；正常为 null */
  readonly error: string | null;
  makeMove(move: string, args?: unknown[]): Promise<MoveOutcome>;
}
