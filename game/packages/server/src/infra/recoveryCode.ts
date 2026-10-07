import { createHmac } from 'node:crypto';
import { RECOVERY_CODE_ALPHABET, RECOVERY_CODE_LENGTH, formatRecoveryCode } from '@icgame/shared';
import { logger } from './logger.js';

// 恢复码生成：Crockford Base32，长度与字符集取自共享常量

/** 生成一个新的恢复码：每个字符取 5 位随机数（32 整除 256，取低 5 位没有取模偏差），共 60 位熵 */
export function generateRecoveryCode(): string {
  const bytes = new Uint8Array(RECOVERY_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let raw = '';
  for (const b of bytes) raw += RECOVERY_CODE_ALPHABET[b & 31]!;
  return formatRecoveryCode(raw);
}

// ---- 恢复码哈希 ----
// 恢复码只有 60 bit 熵，库里若只存无盐摘要，库一泄露仍可能被离线穷举；
// 因此带服务端密钥（pepper）做 HMAC，密钥不与数据放在一起。

/** 开发 / 测试环境未配置密钥时使用的固定值；生产环境禁止使用 */
const DEV_PEPPER = 'dev-only-recovery-code-pepper';

/** 生产环境密钥最短长度 */
const MIN_PEPPER_LENGTH = 16;

let devPepperWarned = false;

/** 去掉连字符并转大写，让 `abcd-2345-efgh` / `ABCD2345EFGH` 得到同一个哈希 */
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/-/g, '').toUpperCase();
}

/** 读取密钥：生产环境缺失时抛错；其他环境回落到开发值并提示一次 */
export function resolveRecoveryPepper(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.RECOVERY_CODE_PEPPER;
  if (configured) {
    if (env.NODE_ENV === 'production' && configured.length < MIN_PEPPER_LENGTH) {
      throw new Error(
        `RECOVERY_CODE_PEPPER 太短：生产环境至少 ${MIN_PEPPER_LENGTH} 个字符（可用 ./scripts/prod.sh secrets 生成）`,
      );
    }
    return configured;
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('RECOVERY_CODE_PEPPER 未设置：生产环境必须配置恢复码哈希密钥');
  }
  if (!devPepperWarned) {
    devPepperWarned = true;
    logger.warn('RECOVERY_CODE_PEPPER 未设置，使用开发用固定密钥（仅限非生产环境）');
  }
  return DEV_PEPPER;
}

/** HMAC-SHA256(密钥, 规范化恢复码)，十六进制 64 位 */
export function hashRecoveryCode(code: string, env: NodeJS.ProcessEnv = process.env): string {
  return createHmac('sha256', resolveRecoveryPepper(env))
    .update(normalizeRecoveryCode(code))
    .digest('hex');
}
