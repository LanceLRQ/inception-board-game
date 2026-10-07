import jwt from 'jsonwebtoken';
import { logger } from './logger.js';

/** 开发 / 测试环境未配置密钥时使用的固定值；生产环境禁止使用 */
const DEV_SECRET = 'dev-secret-change-me';

/** 生产环境密钥最短长度 */
export const MIN_JWT_SECRET_LENGTH = 32;

/** 未配置 JWT_EXPIRES_IN 时的令牌有效期 */
const DEFAULT_EXPIRES_IN = '30d';

let devSecretWarned = false;
let cachedSecret: string | null = null;

export interface JWTPayload {
  playerId: string;
  nickname: string;
  /** 签发时账号的令牌版本；账号凭恢复码在别处找回后版本加一，旧令牌随之作废 */
  tokenVersion: number;
}

/** 读取签名密钥：生产环境缺失或过短时抛错；其他环境回落到开发值并提示一次 */
export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.JWT_SECRET;
  if (configured) {
    if (env.NODE_ENV === 'production' && configured.length < MIN_JWT_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET 太短：生产环境至少 ${MIN_JWT_SECRET_LENGTH} 个字符（可用 ./scripts/prod.sh secrets 生成）`,
      );
    }
    return configured;
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET 未设置：生产环境必须配置令牌签名密钥');
  }
  if (!devSecretWarned) {
    devSecretWarned = true;
    logger.warn('JWT_SECRET 未设置，使用开发用固定密钥（仅限非生产环境）');
  }
  return DEV_SECRET;
}

/** 首次使用时解析并缓存，避免模块加载时就固定环境变量 */
function getSecret(): string {
  cachedSecret ??= resolveJwtSecret();
  return cachedSecret;
}

/** 仅供测试：清掉密钥缓存与开发值告警状态 */
export function resetJwtSecretCacheForTest(): void {
  cachedSecret = null;
  devSecretWarned = false;
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, getSecret(), {
    algorithm: 'HS256',
    expiresIn: (process.env.JWT_EXPIRES_IN || DEFAULT_EXPIRES_IN) as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): JWTPayload {
  const payload = jwt.verify(token, getSecret(), { algorithms: ['HS256'] }) as JWTPayload;
  // 没有版本号的令牌无法判断是否已被作废，一律当作无效
  if (!Number.isInteger(payload.tokenVersion) || payload.tokenVersion < 0) {
    throw new Error('token version missing');
  }
  return payload;
}

/** 令牌的过期时刻（毫秒时间戳），取自令牌自身，与配置的有效期保持一致 */
export function tokenExpiresAt(token: string): number {
  const { exp } = jwt.decode(token) as { exp: number };
  return exp * 1000;
}

export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1]!;
}
