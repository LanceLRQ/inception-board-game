import { describe, expect, it } from 'vitest';
import { ApiRequestError } from './api';
import {
  formatRecoveryCodeInput,
  isRecoveryCodeComplete,
  recoverErrorKey,
  rotateErrorKey,
} from './recoveryCode';

describe('formatRecoveryCodeInput', () => {
  it('小写转大写，每 4 位自动补连字符', () => {
    expect(formatRecoveryCodeInput('abcd')).toBe('ABCD');
    expect(formatRecoveryCodeInput('abcde')).toBe('ABCD-E');
    expect(formatRecoveryCodeInput('abcd2345')).toBe('ABCD-2345');
    expect(formatRecoveryCodeInput('abcd2345efg')).toBe('ABCD-2345-EFG');
  });

  it('去掉空格、连字符和其他无关字符', () => {
    expect(formatRecoveryCodeInput(' ab cd-23 45 ')).toBe('ABCD-2345');
    expect(formatRecoveryCodeInput('ab_cd!@#23')).toBe('ABCD-23');
  });

  it('最多保留 12 个有效字符', () => {
    expect(formatRecoveryCodeInput('ABCD2345EFGH9999')).toBe('ABCD-2345-EFGH');
  });

  it('按 Crockford 规则归一易混字符：O→0，I/L→1，U 被丢弃', () => {
    expect(formatRecoveryCodeInput('oilu')).toBe('011');
    expect(formatRecoveryCodeInput('OIL0')).toBe('0110');
  });

  it('粘贴带或不带连字符的完整恢复码都得到同一个展示形式', () => {
    expect(formatRecoveryCodeInput('7K2M-9QXA-4B6C')).toBe('7K2M-9QXA-4B6C');
    expect(formatRecoveryCodeInput('7k2m9qxa4b6c')).toBe('7K2M-9QXA-4B6C');
  });

  it('空输入返回空串', () => {
    expect(formatRecoveryCodeInput('')).toBe('');
    expect(formatRecoveryCodeInput('----')).toBe('');
  });
});

describe('isRecoveryCodeComplete', () => {
  it('只有 12 个有效字符才算完整，8 位旧格式不算', () => {
    expect(isRecoveryCodeComplete('ABCD-2345-EFGH')).toBe(true);
    expect(isRecoveryCodeComplete('ABCD-2345-EFG')).toBe(false);
    expect(isRecoveryCodeComplete('ABCD-2345')).toBe(false);
    expect(isRecoveryCodeComplete('')).toBe(false);
  });
});

describe('recoverErrorKey', () => {
  it('恢复码无效或已使用', () => {
    expect(recoverErrorKey(new ApiRequestError(422, 'INVALID_RECOVERY_CODE', 'x'))).toBe(
      'recovery.error.invalid',
    );
  });
  it('账号被封禁', () => {
    expect(recoverErrorKey(new ApiRequestError(403, 'BANNED', 'x'))).toBe('recovery.error.banned');
  });
  it('尝试次数过多（按状态码或错误码）', () => {
    expect(recoverErrorKey(new ApiRequestError(429, 'RATE_LIMITED', 'x'))).toBe(
      'recovery.error.rateLimited',
    );
    expect(recoverErrorKey(new ApiRequestError(429, 'UNKNOWN', 'x'))).toBe(
      'recovery.error.rateLimited',
    );
  });
  it('格式不对', () => {
    expect(recoverErrorKey(new ApiRequestError(400, 'VALIDATION_ERROR', 'x'))).toBe(
      'recovery.error.format',
    );
  });
  it('离线模拟模式', () => {
    expect(recoverErrorKey(new ApiRequestError(0, 'OFFLINE', 'x'))).toBe('recovery.error.offline');
  });
  it('服务端 5xx 与网络异常都归为网络或服务端错误', () => {
    expect(recoverErrorKey(new ApiRequestError(500, 'INTERNAL_ERROR', 'x'))).toBe(
      'recovery.error.network',
    );
    expect(recoverErrorKey(new TypeError('Failed to fetch'))).toBe('recovery.error.network');
  });
});

describe('rotateErrorKey', () => {
  it('登录失效、离线与其他错误分别给出文案键', () => {
    expect(rotateErrorKey(new ApiRequestError(401, 'UNAUTHORIZED', 'x'))).toBe(
      'recovery.rotateError.unauthorized',
    );
    expect(rotateErrorKey(new ApiRequestError(0, 'OFFLINE', 'x'))).toBe('recovery.error.offline');
    expect(rotateErrorKey(new TypeError('Failed to fetch'))).toBe('recovery.error.network');
  });
});
