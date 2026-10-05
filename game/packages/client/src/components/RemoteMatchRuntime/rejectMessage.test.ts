// move 被拒时的提示归类

import { describe, it, expect } from 'vitest';
import { rejectMessage } from './rejectMessage';

describe('rejectMessage', () => {
  it('stale_state、duplicate_intent、match_over 不提示', () => {
    expect(rejectMessage('stale_state')).toBeNull();
    expect(rejectMessage('duplicate_intent')).toBeNull();
    expect(rejectMessage('match_over')).toBeNull();
    expect(rejectMessage('game_over')).toBeNull();
  });

  it('rate_limited 提示操作太快', () => {
    expect(rejectMessage('rate_limited')).toBe('match.reject.too_fast');
  });

  it('超时、未就绪、内部错误、不在对局中提示网络问题', () => {
    for (const code of ['timeout', 'not_ready', 'internal_error', 'not_in_match'] as const) {
      expect(rejectMessage(code)).toBe('match.reject.network');
    }
  });

  it('请求形状类拒绝提示现在不能这样做', () => {
    for (const code of [
      'not_object',
      'move_not_string',
      'args_not_array',
      'args_too_long',
      'request_too_large',
      'not_serializable',
      'intent_id_not_string',
    ] as const) {
      expect(rejectMessage(code)).toBe('match.reject.not_allowed');
    }
  });

  it('规则类拒绝提示现在不能这样做', () => {
    for (const code of ['unknown_move', 'not_active', 'invalid_move', 'move_error'] as const) {
      expect(rejectMessage(code)).toBe('match.reject.not_allowed');
    }
  });
});
