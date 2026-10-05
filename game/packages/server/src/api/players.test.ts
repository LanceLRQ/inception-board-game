import { describe, it, expect } from 'vitest';
import { updateMeSchema } from './players.js';

describe('PATCH /players/me 请求体', () => {
  it('昵称规范化后写入，超过 20 个字符被拒绝，不再允许 50 字', () => {
    expect(updateMeSchema.parse({ nickname: ' ＡＢ ' }).nickname).toBe('AB');
    expect(() => updateMeSchema.parse({ nickname: 'x'.repeat(21) })).toThrow();
    expect(() => updateMeSchema.parse({ nickname: 'x'.repeat(50) })).toThrow();
  });
  it('违禁词与全空白被拒绝', () => {
    expect(() => updateMeSchema.parse({ nickname: 'system' })).toThrow();
    expect(() => updateMeSchema.parse({ nickname: '   ' })).toThrow();
  });
});
