// JWT 工具函数测试

import { describe, it, expect } from 'vitest';
import { signToken, verifyToken, extractBearerToken, type JWTPayload } from './jwt.js';

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
});
