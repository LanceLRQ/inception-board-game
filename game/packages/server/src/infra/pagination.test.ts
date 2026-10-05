import { describe, it, expect } from 'vitest';
import { AppError } from './errors.js';
import { decodeCursor, encodeCursor } from './pagination.js';

describe('decodeCursor', () => {
  it('还原编码时的字段', () => {
    expect(decodeCursor(encodeCursor({ stateID: 7 }))).toEqual({ stateID: 7 });
  });

  it('无法解码或解出来不是普通对象时抛校验错误', () => {
    for (const bad of ['abc', 'bnVsbA', Buffer.from('[1]').toString('base64url'), '']) {
      expect(() => decodeCursor(bad)).toThrow(AppError);
      expect(() => decodeCursor(bad)).toThrow('invalid cursor');
    }
  });
});
