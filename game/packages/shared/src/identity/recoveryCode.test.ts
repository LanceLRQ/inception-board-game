import { describe, expect, it } from 'vitest';
import {
  RECOVERY_CODE_ALPHABET,
  RECOVERY_CODE_FORMATTED_LENGTH,
  RECOVERY_CODE_GROUP_SIZE,
  RECOVERY_CODE_LENGTH,
  formatRecoveryCode,
  isRecoveryCodeShape,
  normalizeRecoveryCodeInput,
} from './recoveryCode.js';

describe('恢复码常量', () => {
  it('长度 12、4 位一组，字符集是不含 I L O U 的 Crockford Base32', () => {
    expect(RECOVERY_CODE_LENGTH).toBe(12);
    expect(RECOVERY_CODE_GROUP_SIZE).toBe(4);
    expect(RECOVERY_CODE_FORMATTED_LENGTH).toBe('XXXX-XXXX-XXXX'.length);
    expect(RECOVERY_CODE_ALPHABET).toHaveLength(32);
    for (const c of 'ILOU') expect(RECOVERY_CODE_ALPHABET).not.toContain(c);
  });
});

describe('normalizeRecoveryCodeInput', () => {
  it('去掉连字符、空白与其他符号，转大写', () => {
    expect(normalizeRecoveryCodeInput(' ab cd-23 45_efgh ')).toBe('ABCD2345EFGH');
  });

  it('按 Crockford 规则归一易混字符：O→0，I/L→1，U 丢弃', () => {
    expect(normalizeRecoveryCodeInput('oilu')).toBe('011');
  });

  it('最多保留规定长度', () => {
    expect(normalizeRecoveryCodeInput('ABCD2345EFGH9999')).toBe('ABCD2345EFGH');
  });
});

describe('formatRecoveryCode', () => {
  it('每 4 位加一个连字符，不足一组不加尾部连字符', () => {
    expect(formatRecoveryCode('')).toBe('');
    expect(formatRecoveryCode('ABCD')).toBe('ABCD');
    expect(formatRecoveryCode('ABCDE')).toBe('ABCD-E');
    expect(formatRecoveryCode('ABCD2345')).toBe('ABCD-2345');
    expect(formatRecoveryCode('ABCD2345EFGH')).toBe('ABCD-2345-EFGH');
  });
});

describe('isRecoveryCodeShape', () => {
  it('带或不带连字符、大小写都认，但必须正好 12 位规范字符', () => {
    expect(isRecoveryCodeShape('ABCD-2345-EFGH')).toBe(true);
    expect(isRecoveryCodeShape('abcd2345efgh')).toBe(true);
    expect(isRecoveryCodeShape('ABCD-2345-EFG')).toBe(false);
    expect(isRecoveryCodeShape('ABCD-2345-EFGHJ')).toBe(false);
  });

  it('旧的 8 位码不再接受', () => {
    expect(isRecoveryCodeShape('ABCD-2345')).toBe(false);
  });

  it('含 I L O U 的不是规范字符', () => {
    expect(isRecoveryCodeShape('ABCD-2345-EFGI')).toBe(false);
    expect(isRecoveryCodeShape('ABCD-2345-EFGU')).toBe(false);
  });
});
