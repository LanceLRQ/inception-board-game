import { createHmac, createHash } from 'node:crypto';
import { logger } from './logger.js';

// Crockford's Base32 编码（匿名身份的恢复码格式）
// 排除 I/L/O/U 防止混淆

const ENCODING_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const DECODING_MAP = new Map<string, number>();
for (let i = 0; i < ENCODING_CHARS.length; i++) {
  DECODING_MAP.set(ENCODING_CHARS.charAt(i), i);
}

export function encodeCrockford(num: bigint): string {
  if (num === 0n) return '0';
  let result = '';
  let n = num;
  while (n > 0n) {
    const idx = Number(n % 32n);
    result = ENCODING_CHARS[idx]! + result;
    n /= 32n;
  }
  return result;
}

export function generateRecoveryCode(): string {
  const bytes = new Uint8Array(5); // 40 bits → 8 chars in base32
  crypto.getRandomValues(bytes);
  let num = 0n;
  for (const b of bytes) {
    num = num * 256n + BigInt(b);
  }
  const raw = encodeCrockford(num).padStart(8, '0');
  // 格式化为 XXXX-XXXX
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

// ---- 恢复码哈希 ----
// 恢复码只有约 40 bit 熵，库里若只存无盐摘要，库一泄露就能离线穷举；
// 因此带服务端密钥（pepper）做 HMAC，密钥不与数据放在一起。

/** 开发 / 测试环境未配置密钥时使用的固定值；生产环境禁止使用 */
const DEV_PEPPER = 'dev-only-recovery-code-pepper';

/** 生产环境密钥最短长度 */
const MIN_PEPPER_LENGTH = 16;

let devPepperWarned = false;

/** 去掉连字符并转大写，让 `abcd-1234` / `ABCD1234` 得到同一个哈希 */
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

/** 旧数据的哈希：对「带连字符的大写形式」做无盐 SHA-256，仅用于识别并升级旧记录 */
export function legacyHashRecoveryCode(code: string): string {
  return createHash('sha256').update(code.toUpperCase()).digest('hex');
}
