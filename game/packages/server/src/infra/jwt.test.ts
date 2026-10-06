// JWT 工具函数测试

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  signToken,
  verifyToken,
  extractBearerToken,
  tokenExpiresAt,
  resolveJwtSecret,
  resetJwtSecretCacheForTest,
  MIN_JWT_SECRET_LENGTH,
  type JWTPayload,
} from './jwt.js';

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from './logger.js';

const LONG_SECRET = 'x'.repeat(MIN_JWT_SECRET_LENGTH);

describe('resolveJwtSecret', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetJwtSecretCacheForTest();
  });

  it('生产环境未配置时抛错', () => {
    expect(() => resolveJwtSecret({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
  });

  it('生产环境配置了但短于 32 个字符时抛错，并提示生成方式', () => {
    const env = { NODE_ENV: 'production', JWT_SECRET: 'y'.repeat(MIN_JWT_SECRET_LENGTH - 1) };
    expect(() => resolveJwtSecret(env)).toThrow(/prod\.sh secrets/);
  });

  it('生产环境配置了足够长的值时原样返回', () => {
    expect(resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: LONG_SECRET })).toBe(LONG_SECRET);
  });

  it('非生产环境配置了短值也接受', () => {
    expect(resolveJwtSecret({ NODE_ENV: 'development', JWT_SECRET: 'short' })).toBe('short');
  });

  it('非生产环境未配置时返回开发值，且只告警一次', () => {
    const a = resolveJwtSecret({ NODE_ENV: 'test' });
    const b = resolveJwtSecret({});
    expect(a).toBeTruthy();
    expect(b).toBe(a);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe('jwt 密钥缓存与算法', () => {
  const original = { ...process.env };

  beforeEach(() => {
    resetJwtSecretCacheForTest();
  });

  afterEach(() => {
    process.env = { ...original };
    resetJwtSecretCacheForTest();
  });

  it('首次使用时才读取环境变量，之后沿用缓存', () => {
    process.env.JWT_SECRET = 'first-secret';
    const token = signToken({ playerId: 'p', nickname: 'n' });
    process.env.JWT_SECRET = 'second-secret';
    expect(verifyToken(token).playerId).toBe('p');
    resetJwtSecretCacheForTest();
    expect(() => verifyToken(token)).toThrow();
  });

  it('用别的密钥签的令牌被拒', () => {
    process.env.JWT_SECRET = 'real-secret';
    const forged = jwt.sign({ playerId: 'p', nickname: 'n' }, 'other-secret', {
      algorithm: 'HS256',
    });
    expect(() => verifyToken(forged)).toThrow();
  });

  it('alg 为 none 的令牌被拒', () => {
    process.env.JWT_SECRET = 'real-secret';
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ playerId: 'p', nickname: 'n' })}.`;
    expect(() => verifyToken(unsigned)).toThrow();
  });

  it('用同一密钥但 HS512 签的令牌被拒（算法已钉死为 HS256）', () => {
    process.env.JWT_SECRET = 'real-secret';
    const token = jwt.sign({ playerId: 'p', nickname: 'n' }, 'real-secret', {
      algorithm: 'HS512',
    });
    expect(() => verifyToken(token)).toThrow();
  });

  it('签发的令牌头部算法是 HS256', () => {
    const token = signToken({ playerId: 'p', nickname: 'n' });
    const header = JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString()) as {
      alg: string;
    };
    expect(header.alg).toBe('HS256');
  });

  it('JWT_EXPIRES_IN 生效', () => {
    process.env.JWT_EXPIRES_IN = '1h';
    const decoded = verifyToken(signToken({ playerId: 'p', nickname: 'n' })) as JWTPayload & {
      iat: number;
      exp: number;
    };
    expect(decoded.exp - decoded.iat).toBe(3600);
  });

  it('未设置 JWT_EXPIRES_IN 时缺省 30 天', () => {
    delete process.env.JWT_EXPIRES_IN;
    const decoded = verifyToken(signToken({ playerId: 'p', nickname: 'n' })) as JWTPayload & {
      iat: number;
      exp: number;
    };
    expect(decoded.exp - decoded.iat).toBe(30 * 24 * 3600);
  });
});

describe('jwt', () => {
  const testPayload: JWTPayload = { playerId: 'player-1', nickname: 'TestUser' };

  describe('signToken / verifyToken', () => {
    it('signs and verifies a token round-trip', () => {
      const token = signToken(testPayload);
      const decoded = verifyToken(token);
      expect(decoded.playerId).toBe('player-1');
      expect(decoded.nickname).toBe('TestUser');
    });

    it('throws on invalid token', () => {
      expect(() => verifyToken('invalid.token.here')).toThrow();
    });

    it('throws on empty string', () => {
      expect(() => verifyToken('')).toThrow();
    });

    it('includes iat and exp in decoded token', () => {
      const token = signToken(testPayload);
      const decoded = verifyToken(token) as JWTPayload & { iat: number; exp: number };
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(decoded.iat);
    });
  });

  describe('extractBearerToken', () => {
    it('extracts token from valid Bearer header', () => {
      expect(extractBearerToken('Bearer abc123')).toBe('abc123');
    });

    it('returns null for undefined header', () => {
      expect(extractBearerToken(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(extractBearerToken('')).toBeNull();
    });

    it('returns null for missing Bearer prefix', () => {
      expect(extractBearerToken('Basic abc123')).toBeNull();
    });

    it('returns null for wrong format', () => {
      expect(extractBearerToken('Bearer')).toBeNull();
      expect(extractBearerToken('Bearer token extra')).toBeNull();
    });

    it('handles tokens with dots (JWT format)', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.xxx';
      expect(extractBearerToken(`Bearer ${jwt}`)).toBe(jwt);
    });
  });

  describe('tokenExpiresAt', () => {
    it('returns the expiry carried by the token, in milliseconds', () => {
      const token = signToken({ playerId: 'p1', nickname: 'n' });
      const { exp } = jwt.decode(token) as { exp: number };
      expect(tokenExpiresAt(token)).toBe(exp * 1000);
    });
  });
});
