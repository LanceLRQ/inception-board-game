// 联机对局的消息协议 —— 客户端与服务端共用的类型与解析函数

import type { MatchViewState, MatchEvent, RejectReason } from '../runner/matchRunner.js';
import type { RequestShapeCode } from '../engine/validator.js';

export const MATCH_PROTOCOL_VERSION = 1;

/** 客户端 → 服务端 */
export type ClientMatchMessage =
  | { type: 'icg:move'; move: string; args: unknown[]; intentId: string; stateID?: number }
  | { type: 'icg:sync' };

export interface SeatInfo {
  seat: string;
  nickname: string;
  isBot: boolean;
  /** 真人座位当前是否在线；Bot 座位恒为 true */
  connected: boolean;
  /** 掉线后是否已由 Bot 接管 */
  takenOver: boolean;
}

export interface MatchSnapshotForViewer {
  matchID: string;
  /** 接收者自己的座位；旁观者为 null（目前不开放旁观，预留） */
  seat: string | null;
  seats: SeatInfo[];
  view: MatchViewState;
  /** 截止时间（毫秒时间戳）；没有计时时为 null */
  deadlineAt: number | null;
}

/** 服务端 → 客户端 */
export type ServerMatchMessage =
  | ({ type: 'icg:state'; protocol: number } & MatchSnapshotForViewer)
  | ({ type: 'icg:step'; events: MatchEvent[] } & MatchSnapshotForViewer)
  | { type: 'icg:moveResult'; intentId: string; ok: true; stateID: number }
  | { type: 'icg:moveResult'; intentId: string; ok: false; code: MoveRejectCode }
  | { type: 'icg:seats'; matchID: string; seats: SeatInfo[] };

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
 * icg:sync 允许 payload 为 undefined / null / 空对象。
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
    // icg:sync 是特殊的，payload 可以不带或不是对象
    if (event === 'icg:sync') {
      // 如果 payload 是对象且有 type 字段，必须是 'icg:sync'
      if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
        const desc = Object.getOwnPropertyDescriptor(payload, 'type');
        if (desc && 'value' in desc && desc.value !== 'icg:sync') return null;
      }
      return { type: 'icg:sync' };
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
