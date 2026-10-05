// move 被服务端拒绝时的提示归类：返回 i18n 键；返回 null 表示不提示
// （界面随后会被新视图覆盖，或对局已结束，提示只会添乱）

import type { MoveRejectCode } from '@icgame/game-engine';

export type RejectInput = MoveRejectCode | 'not_ready' | 'timeout';

/** 请求形状类（not_object 等）与规则类（not_active 等）都归为「现在不能这样做」 */
export function rejectMessage(code: RejectInput): string | null {
  switch (code) {
    case 'stale_state':
    case 'duplicate_intent':
    case 'match_over':
    case 'game_over':
      return null;
    case 'rate_limited':
      return 'match.reject.too_fast';
    case 'timeout':
    case 'not_ready':
    case 'internal_error':
    case 'not_in_match':
      return 'match.reject.network';
    case 'not_object':
    case 'move_not_string':
    case 'args_not_array':
    case 'args_too_long':
    case 'request_too_large':
    case 'not_serializable':
    case 'unknown_move':
    case 'intent_id_not_string':
    case 'not_active':
    case 'invalid_move':
    case 'move_error':
      return 'match.reject.not_allowed';
    default: {
      // 新增拒绝码时这里会报类型错误，提醒补充归类
      const unreachable: never = code;
      return unreachable;
    }
  }
}
