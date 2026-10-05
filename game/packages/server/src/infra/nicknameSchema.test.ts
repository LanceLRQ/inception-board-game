import { describe, it, expect } from 'vitest';
import { nicknameSchema } from './nicknameSchema.js';

describe('nicknameSchema', () => {
  it('输出规范化后的值', () => {
    expect(nicknameSchema.parse(' ＡＢ  c​ ')).toBe('AB c');
  });
  it('全空白、超长、违禁词都抛错', () => {
    expect(() => nicknameSchema.parse('   ')).toThrow();
    expect(() => nicknameSchema.parse('x'.repeat(21))).toThrow();
    expect(() => nicknameSchema.parse('官方客服')).toThrow();
  });
});
