// 联机对局的消息协议 —— 客户端与服务端共用的类型与解析函数

import type { MatchViewState, MatchEvent, RejectReason } from '../runner/matchRunner.js';
import type { RequestShapeCode } from '../engine/validator.js';

export const MATCH_PROTOCOL_VERSION = 1;

/** 客户端 → 服务端 */
export type ClientMatchMessage =
  | { type: 'icg:move'; move: string; args: unknown[]; intentId: string; stateID?: number }
  | { type: 'icg:sync' }
  /** 取消自己座位的托管；座位取自连接的握手，消息里不带任何座位信息 */
  | { type: 'icg:resume' };

/** 座位被 Bot 托管的原因：掉线时长到点，或连续多次超时未操作 */
export type SeatTakeoverReason = 'disconnected' | 'idle';

export interface SeatInfo {
  seat: string;
  nickname: string;
  isBot: boolean;
  /** 像素头像的种子，公开信息；旧版服务端与本地来源可能没有，界面按座位或昵称推导 */
  avatarSeed?: string;
  /** 真人座位当前是否在线；Bot 座位恒为 true */
  connected: boolean;
  /** 是否已由 Bot 接管（掉线或挂机） */
  takenOver: boolean;
  /** 接管原因，仅 takenOver 为真时有；只含公开信息，供界面区分文案 */
  takeoverReason?: SeatTakeoverReason;
}

export interface MatchSnapshotForViewer {
  matchID: string;
  /** 接收者自己的座位；旁观者为 null（目前不开放旁观，预留） */
  seat: string | null;
  seats: SeatInfo[];
  view: MatchViewState;
  /** 截止时间（服务端时钟的毫秒时间戳）；没有计时时为 null。受本机时钟偏差影响，客户端倒计时优先用 deadlineInMs */
  deadlineAt: number | null;
  /**
   * 发出这条消息时距截止还剩多少毫秒（不小于 0）；没有计时时为 null。
   * 客户端以收到时刻为起点、用单调时钟倒数，不依赖本机与服务端的绝对时间差。
   * 旧版服务端不带这个字段，客户端遇到时退回用 deadlineAt。
   */
  deadlineInMs?: number | null;
}

/** 服务端 → 客户端 */
export type ServerMatchMessage =
  /** reset 为真：服务端从存储重新加载了这一局，版本号可能比客户端手里的低，客户端无条件以这份为准 */
  | ({ type: 'icg:state'; protocol: number; reset?: true } & MatchSnapshotForViewer)
  | ({ type: 'icg:step'; events: MatchEvent[] } & MatchSnapshotForViewer)
  | { type: 'icg:moveResult'; intentId: string; ok: true; stateID: number }
  | { type: 'icg:moveResult'; intentId: string; ok: false; code: MoveRejectCode }
  | { type: 'icg:seats'; matchID: string; seats: SeatInfo[] }
  /** 服务端暂时无法保存进度（healthy 为 false）或已恢复（true）；只含公开信息 */
  | { type: 'icg:storage'; matchID: string; healthy: boolean };

export type MoveRejectCode =
  | RequestShapeCode
  | 'rate_limited'
  | 'duplicate_intent'
  | 'stale_state'
  | RejectReason
  | 'match_over'
  | 'not_in_match'
  | 'internal_error';

/**
 * 解析客户端发来的消息。
 *
 * 返回值是新建的对象，仅包含协议定义的字段（丢弃多余字段）；args 浅拷贝。
 * 读取属性时用 try/catch 包住，任何异常都返回 null。
 * payload.type 存在但与事件名不一致时返回 null。
 * icg:sync 与 icg:resume 允许 payload 为 undefined / null / 空对象。
 *
 * 规则补充：
 * - intentId 必须是 1–64 个字符的字符串
 * - stateID 可以不带，带了必须是非负整数（Number.isInteger 且 >= 0）
 * - args 只要求是数组
 * - move 只要求是字符串（细致的形状校验由 validateRequestShape 做）
 */
export function parseClientMatchMessage(
  event: string,
  payload: unknown,
): ClientMatchMessage | null {
  try {
    // icg:sync 与 icg:resume 不带参数，payload 可以不带；带了对象时 type 必须一致，多余字段一律丢弃
    if (event === 'icg:sync' || event === 'icg:resume') {
      if (payload !== undefined && payload !== null) {
        if (typeof payload !== 'object' || Array.isArray(payload)) {
          // sync 历来容忍任意非对象载荷，保持不变；resume 是改变状态的请求，载荷必须是对象
          return event === 'icg:sync' ? { type: 'icg:sync' } : null;
        }
        const desc = Object.getOwnPropertyDescriptor(payload, 'type');
        if (desc && 'value' in desc && desc.value !== event) return null;
      }
      return { type: event };
    }

    // 其他事件都要求 payload 是对象
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    // 读取 payload.type，如果存在则必须与 event 匹配
    const typeDesc = Object.getOwnPropertyDescriptor(payload, 'type');
    if (typeDesc && 'value' in typeDesc && typeDesc.value !== event) {
      return null;
    }

    // === icg:move ===
    if (event === 'icg:move') {
      // 读取 move
      const moveDesc = Object.getOwnPropertyDescriptor(payload, 'move');
      if (!moveDesc || !('value' in moveDesc)) return null;
      const move = moveDesc.value;
      if (typeof move !== 'string') return null;

      // 读取 args
      const argsDesc = Object.getOwnPropertyDescriptor(payload, 'args');
      if (!argsDesc || !('value' in argsDesc)) return null;
      const args = argsDesc.value;
      if (!Array.isArray(args)) return null;

      // 读取 intentId
      const intentIdDesc = Object.getOwnPropertyDescriptor(payload, 'intentId');
      if (!intentIdDesc || !('value' in intentIdDesc)) return null;
      const intentId = intentIdDesc.value;
      if (typeof intentId !== 'string') return null;
      if (intentId.length < 1 || intentId.length > 64) return null;

      // 读取可选的 stateID
      let stateID: number | undefined;
      const stateIDDesc = Object.getOwnPropertyDescriptor(payload, 'stateID');
      if (stateIDDesc && 'value' in stateIDDesc) {
        const stateIDValue = stateIDDesc.value;
        if (stateIDValue !== undefined) {
          if (!Number.isInteger(stateIDValue) || stateIDValue < 0) return null;
          stateID = stateIDValue;
        }
      }

      const result: ClientMatchMessage = {
        type: 'icg:move',
        move,
        args: [...args],
        intentId,
      };
      if (stateID !== undefined) {
        result.stateID = stateID;
      }
      return result;
    }

    // 未知事件名
    return null;
  } catch {
    // 任何异常（getter 抛错、循环引用等）都返回 null
    return null;
  }
}
