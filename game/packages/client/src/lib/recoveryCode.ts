// 恢复码的输入整理与错误文案映射（纯函数）
//
// 恢复码是 12 位 Crockford Base32，展示形式 XXXX-XXXX-XXXX，长度与分组取自共享常量。
// 服务端只接受规范字符集（不含 I L O U），所以输入侧先按 Crockford 规则归一易混字符，
// 避免用户把 0 抄成 O、1 抄成 I 而被服务端当成"无效码"并计入失败次数。

import {
  RECOVERY_CODE_LENGTH,
  formatRecoveryCode,
  normalizeRecoveryCodeInput,
} from '@icgame/shared';
import { ApiRequestError } from './api';

/** 把任意输入整理成 `XXXX-XXXX-XXXX` 的前缀形式：大写、去无关字符与连字符、易混字符归一、最多 12 位 */
export function formatRecoveryCodeInput(raw: string): string {
  return formatRecoveryCode(normalizeRecoveryCodeInput(raw));
}

/** 已输满全部有效字符 */
export function isRecoveryCodeComplete(formatted: string): boolean {
  return formatted.replace(/-/g, '').length === RECOVERY_CODE_LENGTH;
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
