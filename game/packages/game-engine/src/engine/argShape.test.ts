// 参数形状判断

import { describe, it, expect } from 'vitest';
import { isPlainRecord, isRecordOf, isString, isStringArray } from './argShape.js';

describe('参数形状判断', () => {
  it('isString', () => {
    expect(isString('a')).toBe(true);
    expect(isString('')).toBe(true);
    for (const v of [undefined, null, 0, {}, []]) expect(isString(v)).toBe(false);
  });

  it('isStringArray', () => {
    expect(isStringArray([])).toBe(true);
    expect(isStringArray(['a', 'b'])).toBe(true);
    for (const v of [undefined, null, 'a', {}, [1], ['a', null]]) {
      expect(isStringArray(v)).toBe(false);
    }
  });

  it('isPlainRecord', () => {
    expect(isPlainRecord({})).toBe(true);
    expect(isPlainRecord({ a: 1 })).toBe(true);
    for (const v of [undefined, null, 'a', 0, []]) expect(isPlainRecord(v)).toBe(false);
  });

  it('isRecordOf', () => {
    expect(isRecordOf({}, isString)).toBe(true);
    expect(isRecordOf({ a: 'x' }, isString)).toBe(true);
    expect(isRecordOf({ a: ['x'] }, isStringArray)).toBe(true);
    expect(isRecordOf({ a: 1 }, isString)).toBe(false);
    expect(isRecordOf({ a: [1] }, isStringArray)).toBe(false);
    for (const v of [undefined, null, [], 'a']) expect(isRecordOf(v, isString)).toBe(false);
  });
});
