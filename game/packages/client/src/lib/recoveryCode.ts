// 恢复码的输入整理与错误文案映射（纯函数）
//
// 恢复码是 8 位 Crockford Base32，展示形式 XXXX-XXXX。
// 服务端只接受规范字符集（不含 I L O U），所以输入侧先按 Crockford 规则归一易混字符，
// 避免用户把 0 抄成 O、1 抄成 I 而被服务端当成"无效码"并计入失败次数。

import { ApiRequestError } from './api';

const CODE_LENGTH = 8;
const GROUP = 4;

/** 把任意输入整理成 `XXXX-XXXX` 的前缀形式：大写、去无关字符、易混字符归一、最多 8 位 */
export function formatRecoveryCodeInput(raw: string): string {
  const chars = raw
    .toUpperCase()
    .replace(/[OIL]/g, (c) => (c === 'O' ? '0' : '1'))
    .replace(/[^0-9A-Z]/g, '')
    .replace(/U/g, '')
    .slice(0, CODE_LENGTH);
  return chars.length > GROUP ? `${chars.slice(0, GROUP)}-${chars.slice(GROUP)}` : chars;
}

/** 已输满 8 个有效字符 */
export function isRecoveryCodeComplete(formatted: string): boolean {
  return formatted.replace('-', '').length === CODE_LENGTH;
}

function codeOf(err: unknown): { status: number; code: string } | null {
  return err instanceof ApiRequestError ? { status: err.status, code: err.code } : null;
}

/** 恢复失败 → 文案键 */
export function recoverErrorKey(err: unknown): string {
  const e = codeOf(err);
  if (e) {
    if (e.code === 'OFFLINE') return 'recovery.error.offline';
    if (e.code === 'INVALID_RECOVERY_CODE') return 'recovery.error.invalid';
    if (e.code === 'BANNED') return 'recovery.error.banned';
    if (e.code === 'RATE_LIMITED' || e.status === 429) return 'recovery.error.rateLimited';
    if (e.code === 'VALIDATION_ERROR') return 'recovery.error.format';
  }
  return 'recovery.error.network';
}

/** 重新生成失败 → 文案键 */
export function rotateErrorKey(err: unknown): string {
  const e = codeOf(err);
  if (e?.code === 'OFFLINE') return 'recovery.error.offline';
  if (e?.status === 401) return 'recovery.rotateError.unauthorized';
  return 'recovery.error.network';
}
