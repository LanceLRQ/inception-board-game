// Crockford's Base32 编码 + 恢复码生成测试

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  encodeCrockford,
  generateRecoveryCode,
  hashRecoveryCode,
  legacyHashRecoveryCode,
  resolveRecoveryPepper,
} from './recoveryCode.js';

describe('recoveryCode', () => {
  describe('encodeCrockford', () => {
    it('encodes 0', () => {
      expect(encodeCrockford(0n)).toBe('0');
    });

    it('encodes single digit values', () => {
      expect(encodeCrockford(1n)).toBe('1');
      expect(encodeCrockford(9n)).toBe('9');
      expect(encodeCrockford(10n)).toBe('A');
      expect(encodeCrockford(31n)).toBe('Z');
    });

    it('encodes multi-digit values', () => {
      // 32 → 10 (base32) → "10"
      expect(encodeCrockford(32n)).toBe('10');
      // 33 → 11 → "11"
      expect(encodeCrockford(33n)).toBe('11');
    });

    it('excludes I/L/O/U characters', () => {
      // 遍历所有32个编码字符，确保不含 I L O U
      const chars = new Set<string>();
      for (let i = 0n; i < 32n; i++) {
        const encoded = encodeCrockford(i);
        for (const c of encoded) chars.add(c);
      }
      expect(chars.has('I')).toBe(false);
      expect(chars.has('L')).toBe(false);
      expect(chars.has('O')).toBe(false);
      expect(chars.has('U')).toBe(false);
    });

    it('produces deterministic results', () => {
      const val = 123456789n;
      const a = encodeCrockford(val);
      const b = encodeCrockford(val);
      expect(a).toBe(b);
    });

    it('round-trips for known values', () => {
      // 已知值: 1n -> "1"
      expect(encodeCrockford(1n)).toBe('1');
      // 255n -> 7*32 + 31 -> "7Z"
      expect(encodeCrockford(255n)).toBe('7Z');
      // 1024n -> 1*32^2 = "100"
      expect(encodeCrockford(1024n)).toBe('100');
    });
  });

  describe('generateRecoveryCode', () => {
    it('generates code in XXXX-XXXX format', () => {
      const code = generateRecoveryCode();
      expect(code).toMatch(/^[0-9A-HJ-KMNP-TV-Z]{4}-[0-9A-HJ-KMNP-TV-Z]{4}$/);
    });

    it('generates 8 character codes (excluding dash)', () => {
      const code = generateRecoveryCode();
      expect(code.replace('-', '')).toHaveLength(8);
    });

    it('generates unique codes', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        codes.add(generateRecoveryCode());
      }
      // 100 次生成应该是唯一的（碰撞概率极低）
      expect(codes.size).toBeGreaterThan(90);
    });

    it('does not contain forbidden characters', () => {
      for (let i = 0; i < 50; i++) {
        const code = generateRecoveryCode();
        const clean = code.replace('-', '');
        for (const c of clean) {
          expect('ILOU').not.toContain(c);
        }
      }
    });
  });
});

describe('恢复码哈希', () => {
  const env = { RECOVERY_CODE_PEPPER: 'pepper-a' } as NodeJS.ProcessEnv;

  it('新哈希确定、64 位十六进制，且与旧的无盐哈希不同', () => {
    const h = hashRecoveryCode('ABCD-1234', env);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecoveryCode('ABCD-1234', env)).toBe(h);
    expect(h).not.toBe(legacyHashRecoveryCode('ABCD-1234'));
  });

  it('规范化：连字符与大小写不影响结果', () => {
    expect(hashRecoveryCode('abcd-1234', env)).toBe(hashRecoveryCode('ABCD1234', env));
  });

  it('换密钥后哈希不同', () => {
    const other = { RECOVERY_CODE_PEPPER: 'pepper-b' } as NodeJS.ProcessEnv;
    expect(hashRecoveryCode('ABCD-1234', other)).not.toBe(hashRecoveryCode('ABCD-1234', env));
  });

  it('旧哈希是带连字符大写形式的 SHA-256', () => {
    expect(legacyHashRecoveryCode('abcd-1234')).toBe(
      createHash('sha256').update('ABCD-1234').digest('hex'),
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
