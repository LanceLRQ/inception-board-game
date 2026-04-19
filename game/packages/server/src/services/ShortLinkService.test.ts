import { describe, it, expect, beforeEach } from 'vitest';
import { ShortLinkService, InMemoryShortLinkStore } from './ShortLinkService.js';

describe('ShortLinkService', () => {
  let store: InMemoryShortLinkStore;
  let now: Date;
  let svc: ShortLinkService;

  beforeEach(() => {
    store = new InMemoryShortLinkStore();
    now = new Date('2026-04-19T12:00:00Z');
    svc = new ShortLinkService(store, {
      length: 6,
      defaultTtlMs: 7 * 24 * 3600 * 1000,
      now: () => now,
    });
  });

  describe('create', () => {
    it('produces a 6-char Base58 code', async () => {
      const rec = await svc.create({ targetType: 'room', targetId: 'room-123' });
      expect(rec.code).toHaveLength(6);
      expect(rec.targetType).toBe('room');
      expect(rec.targetId).toBe('room-123');
    });

    it('computes expiresAt = createdAt + default TTL', async () => {
      const rec = await svc.create({ targetType: 'room', targetId: 'r' });
      expect(rec.createdAt.toISOString()).toBe(now.toISOString());
      const expectedExpiry = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
      expect(rec.expiresAt?.toISOString()).toBe(expectedExpiry.toISOString());
    });

    it('respects custom expiresInMs', async () => {
      const rec = await svc.create({
        targetType: 'match',
        targetId: 'm',
        expiresInMs: 3600 * 1000,
      });
      const expected = new Date(now.getTime() + 3600 * 1000);
      expect(rec.expiresAt?.toISOString()).toBe(expected.toISOString());
    });

    it('expiresInMs=0 creates a non-expiring link', async () => {
      const rec = await svc.create({
        targetType: 'replay',
        targetId: 'rp',
        expiresInMs: 0,
      });
      expect(rec.expiresAt).toBeNull();
    });

    it('stores createdByPlayerId when provided', async () => {
      const rec = await svc.create({
        targetType: 'room',
        targetId: 'r',
        createdByPlayerId: 'p1',
      });
      expect(rec.createdByPlayerId).toBe('p1');
    });

    it('defaults createdByPlayerId to null', async () => {
      const rec = await svc.create({ targetType: 'room', targetId: 'r' });
      expect(rec.createdByPlayerId).toBeNull();
    });

    it('returned records are actually persisted', async () => {
      const rec = await svc.create({ targetType: 'room', targetId: 'r' });
      expect(store.size()).toBe(1);
      const found = await store.findByCode(rec.code);
      expect(found?.targetId).toBe('r');
    });
  });

  describe('resolve', () => {
    it('returns NOT_FOUND for unknown code', async () => {
      const r = await svc.resolve('abcdef');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('NOT_FOUND');
    });

    it('returns INVALID_CODE for wrong length', async () => {
      const r = await svc.resolve('abc');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('INVALID_CODE');
    });

    it('returns INVALID_CODE for ambiguous chars', async () => {
      const r = await svc.resolve('0abcde'); // 含 0
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('INVALID_CODE');
    });

    it('returns EXPIRED when past expiresAt', async () => {
      const rec = await svc.create({
        targetType: 'room',
        targetId: 'r',
        expiresInMs: 1000,
      });
      now = new Date(now.getTime() + 2000); // 时间前进 2 秒
      const r = await svc.resolve(rec.code);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('EXPIRED');
    });

    it('returns ok for fresh links', async () => {
      const rec = await svc.create({ targetType: 'room', targetId: 'r' });
      const r = await svc.resolve(rec.code);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.record.targetId).toBe('r');
    });

    it('records a hit on successful resolve', async () => {
      const rec = await svc.create({ targetType: 'room', targetId: 'r' });
      await svc.resolve(rec.code);
      // 等待异步 recordHit 完成
      await new Promise((r) => setTimeout(r, 10));
      const after = await store.findByCode(rec.code);
      expect(after?.hitCount).toBe(1);
      expect(after?.lastHitAt).not.toBeNull();
    });

    it('never-expiring link is always resolvable', async () => {
      const rec = await svc.create({
        targetType: 'replay',
        targetId: 'rp',
        expiresInMs: 0,
      });
      now = new Date(now.getTime() + 10 * 365 * 24 * 3600 * 1000); // 10 年后
      const r = await svc.resolve(rec.code);
      expect(r.ok).toBe(true);
    });
  });

  describe('collision retry', () => {
    it('retries when code collides until finding free one', async () => {
      // 预先填入 2 个已知码，service 随机生成多半不会碰，但测 exists 调用链
      await store.save({
        code: 'AAAAAA',
        targetType: 'room',
        targetId: 'x',
        createdByPlayerId: null,
        createdAt: now,
        expiresAt: null,
      });
      const rec = await svc.create({ targetType: 'room', targetId: 'y' });
      expect(rec.code).not.toBe('AAAAAA');
    });

    it('fails gracefully if always colliding (with injected randomBytes)', async () => {
      const alwaysSameBytes = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc]);
      const svc2 = new ShortLinkService(store, {
        length: 6,
        maxAttempts: 3,
        now: () => now,
        randomBytes: () => alwaysSameBytes,
      });
      // 第一次 create 成功
      const first = await svc2.create({ targetType: 'room', targetId: 'a' });
      // 第二次随机字节相同 + maxAttempts=3 → 必碰撞失败
      await expect(svc2.create({ targetType: 'room', targetId: 'b' })).rejects.toThrow(
        /unique short code/,
      );
      expect(first.code).toHaveLength(6);
    });
  });
});
