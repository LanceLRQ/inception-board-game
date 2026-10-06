// 对局来源：对局界面只依赖这个接口，不关心状态来自本机 Worker 还是服务端

import type { MatchViewState, MoveRejectCode, SeatInfo } from '@icgame/game-engine';
import type { ReportChannel } from '../lib/reportApi';
import type { ChatChannel } from './chat';

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
  /** 'local'：本机人机局；'remote'：服务端对局；'fixture'：调试用的固定场景（无连接、无截止时间、不推进状态） */
  readonly kind: 'local' | 'remote' | 'fixture';
  /** 最新视图；尚未就绪为 null */
  readonly view: MatchViewState | null;
  /** 本人的座位号；尚未就绪为 null */
  readonly seat: string | null;
  /** 座位表；本地来源按视图里的玩家生成（除本人外都是 Bot） */
  readonly seats: readonly SeatInfo[];
  /**
   * 当前等待的截止点，单位是本机单调时钟（performance.now 的刻度），不是日历时间，
   * 与 lib/deadlineClock 的 remainingSeconds 配合使用；本地来源恒为 null
   */
  readonly deadlineAt: number | null;
  readonly connection: ConnectionState;
  /** 服务端暂时无法保存进度、正在重试；本地来源恒为 false */
  readonly storageDegraded: boolean;
  /** 无法继续时的错误文案键；正常为 null */
  readonly error: string | null;
  /** 本人座位是否被 Bot 托管（挂机或掉线）；本地来源恒为 false */
  readonly selfTakenOver: boolean;
  /** 预设短语通道；只有联机来源可用（固定场景按地址参数注入示例） */
  readonly chat: ChatChannel;
  /** 局后举报通道；只有联机来源有（本地人机局没有真人对手），固定场景按地址参数注入 */
  readonly report: ReportChannel | null;
  makeMove(move: string, args?: unknown[]): Promise<MoveOutcome>;
  /** 取消本人座位的托管；本地来源是无操作 */
  resume(): void;
}

/** 本人座位在座位表里是否处于托管 */
export function isSelfTakenOver(seats: readonly SeatInfo[], seat: string | null): boolean {
  if (seat === null) return false;
  return seats.find((s) => s.seat === seat)?.takenOver === true;
}
