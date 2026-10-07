// 恢复码生成与哈希测试

import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { RECOVERY_CODE_ALPHABET, RECOVERY_CODE_LENGTH } from '@icgame/shared';
import {
  generateRecoveryCode,
  hashRecoveryCode,
  normalizeRecoveryCode,
  resolveRecoveryPepper,
} from './recoveryCode.js';

describe('generateRecoveryCode', () => {
  it('格式为 XXXX-XXXX-XXXX，字符都在规范字符集内', () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[0-9A-HJ-KMNP-TV-Z]{4}-[0-9A-HJ-KMNP-TV-Z]{4}-[0-9A-HJ-KMNP-TV-Z]{4}$/);
  });

  it('长度取自共享常量（去掉连字符后）', () => {
    expect(generateRecoveryCode().replace(/-/g, '')).toHaveLength(RECOVERY_CODE_LENGTH);
  });

  it('不含易混字符 I L O U', () => {
    for (let i = 0; i < 200; i++) {
      for (const c of generateRecoveryCode().replace(/-/g, '')) {
        expect('ILOU').not.toContain(c);
      }
    }
  });

  it('每个字符均匀取自字符集：全 0 字节得到全 0，全 255 字节得到末位字符', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues');
    spy.mockImplementationOnce((arr) => {
      (arr as Uint8Array).fill(0);
      return arr;
    });
    expect(generateRecoveryCode()).toBe('0000-0000-0000');
    spy.mockImplementationOnce((arr) => {
      (arr as Uint8Array).fill(255);
      return arr;
    });
    expect(generateRecoveryCode()).toBe('ZZZZ-ZZZZ-ZZZZ');
    expect(RECOVERY_CODE_ALPHABET.at(-1)).toBe('Z');
    spy.mockRestore();
  });

  it('多次生成互不相同', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) codes.add(generateRecoveryCode());
    expect(codes.size).toBe(100);
  });
});

describe('恢复码哈希', () => {
  const env = { RECOVERY_CODE_PEPPER: 'pepper-a' } as NodeJS.ProcessEnv;

  it('哈希确定、64 位十六进制，且不是无盐摘要', () => {
    const h = hashRecoveryCode('ABCD-2345-EFGH', env);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecoveryCode('ABCD-2345-EFGH', env)).toBe(h);
    expect(h).not.toBe(createHash('sha256').update('ABCD2345EFGH').digest('hex'));
  });

  it('normalizeRecoveryCode 去连字符并转大写', () => {
    expect(normalizeRecoveryCode('abcd-2345-efgh')).toBe('ABCD2345EFGH');
  });

  it('规范化：连字符与大小写不影响结果', () => {
    expect(hashRecoveryCode('abcd-2345-efgh', env)).toBe(hashRecoveryCode('ABCD2345EFGH', env));
  });

  it('换密钥后哈希不同', () => {
    const other = { RECOVERY_CODE_PEPPER: 'pepper-b' } as NodeJS.ProcessEnv;
    expect(hashRecoveryCode('ABCD-2345-EFGH', other)).not.toBe(
      hashRecoveryCode('ABCD-2345-EFGH', env),
    );
  });

  it('生产环境缺密钥时报错，其他环境用开发值', () => {
    expect(() => resolveRecoveryPepper({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(
      /RECOVERY_CODE_PEPPER/,
    );
    expect(() =>
      resolveRecoveryPepper({
        NODE_ENV: 'production',
        RECOVERY_CODE_PEPPER: 'x'.repeat(16),
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
    expect(resolveRecoveryPepper({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBeTruthy();
  });

  it('生产环境密钥短于 16 个字符时报错，非生产环境不限制', () => {
    expect(() =>
      resolveRecoveryPepper({
        NODE_ENV: 'production',
        RECOVERY_CODE_PEPPER: 'x'.repeat(15),
      } as NodeJS.ProcessEnv),
    ).toThrow(/16/);
    expect(
      resolveRecoveryPepper({
        NODE_ENV: 'development',
        RECOVERY_CODE_PEPPER: 'short',
      } as NodeJS.ProcessEnv),
    ).toBe('short');
  });
});
