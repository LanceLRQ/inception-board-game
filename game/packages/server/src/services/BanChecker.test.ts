import { describe, it, expect } from 'vitest';
import {
  BAN_CACHE_MAX_ENTRIES,
  BAN_CACHE_TTL_MS,
  InMemoryBanChecker,
  PrismaBanChecker,
  isBanActive,
  type BanFields,
  type BanPrisma,
} from './BanChecker.js';

describe('isBanActive', () => {
  const now = 10_000;
  it('未封禁 → false，即使带有到期时间', () => {
    expect(isBanActive({ isBanned: false, banUntil: null }, now)).toBe(false);
    expect(isBanActive({ isBanned: false, banUntil: new Date(now + 1) }, now)).toBe(false);
  });
  it('永久封禁 → true', () => {
    expect(isBanActive({ isBanned: true, banUntil: null }, now)).toBe(true);
  });
  it('到期时间在未来 → true', () => {
    expect(isBanActive({ isBanned: true, banUntil: new Date(now + 1) }, now)).toBe(true);
  });
  it('到期时间等于当前或已过 → false', () => {
    expect(isBanActive({ isBanned: true, banUntil: new Date(now) }, now)).toBe(false);
    expect(isBanActive({ isBanned: true, banUntil: new Date(now - 1) }, now)).toBe(false);
  });
});

function fakePrisma() {
  const rows = new Map<string, BanFields>();
  const calls = { count: 0 };
  const prisma: BanPrisma = {
    player: {
      async findUnique({ where }) {
        calls.count++;
        return rows.get(where.id) ?? null;
      },
    },
  };
  return { rows, calls, prisma };
}

describe('PrismaBanChecker', () => {
  it('不存在的账号视为未封禁', async () => {
    const { prisma } = fakePrisma();
    expect(await new PrismaBanChecker(prisma).isBanned('ghost')).toBe(false);
  });

  it('缓存时长内不重复查库', async () => {
    const { prisma, rows, calls } = fakePrisma();
    let now = 0;
    const checker = new PrismaBanChecker(prisma, { now: () => now });
    rows.set('a', { isBanned: true, banUntil: null });
    expect(await checker.isBanned('a')).toBe(true);
    expect(await checker.isBanned('a')).toBe(true);
    expect(calls.count).toBe(1);
    now = BAN_CACHE_TTL_MS + 1;
    await checker.isBanned('a');
    expect(calls.count).toBe(2);
  });

  it('invalidate 后立刻读到新状态', async () => {
    const { prisma, rows } = fakePrisma();
    const checker = new PrismaBanChecker(prisma);
    rows.set('a', { isBanned: false, banUntil: null });
    expect(await checker.isBanned('a')).toBe(false);
    rows.set('a', { isBanned: true, banUntil: null });
    expect(await checker.isBanned('a')).toBe(false); // 缓存未失效
    checker.invalidate('a');
    expect(await checker.isBanned('a')).toBe(true);
  });

  it('到期的封禁在缓存过期后视为未封禁', async () => {
    const { prisma, rows } = fakePrisma();
    let now = 0;
    const checker = new PrismaBanChecker(prisma, { now: () => now, ttlMs: 10 });
    rows.set('a', { isBanned: true, banUntil: new Date(100) });
    expect(await checker.isBanned('a')).toBe(true);
    now = 101;
    expect(await checker.isBanned('a')).toBe(false);
  });
});

describe('PrismaBanChecker 缓存容量', () => {
  it('默认上限是 10000 条', () => {
    expect(BAN_CACHE_MAX_ENTRIES).toBe(10_000);
  });

  it('满了先清已过期的条目，保留仍有效的', async () => {
    const { prisma, calls } = fakePrisma();
    let now = 0;
    const checker = new PrismaBanChecker(prisma, { now: () => now, ttlMs: 100, maxEntries: 3 });
    await checker.isBanned('a'); // 过期于 100
    now = 60;
    await checker.isBanned('b'); // 过期于 160
    await checker.isBanned('c'); // 过期于 160
    now = 120; // a 已过期，b c 仍有效
    await checker.isBanned('d'); // 触发清理：只清掉 a
    expect(calls.count).toBe(4);
    await checker.isBanned('b');
    await checker.isBanned('c');
    await checker.isBanned('d');
    expect(calls.count).toBe(4); // b c d 仍在缓存里
  });

  it('清完过期的仍满，就整体清空', async () => {
    const { prisma, calls } = fakePrisma();
    const checker = new PrismaBanChecker(prisma, { now: () => 0, ttlMs: 100, maxEntries: 3 });
    await checker.isBanned('a');
    await checker.isBanned('b');
    await checker.isBanned('c');
    await checker.isBanned('d'); // 没有过期条目，整体清空后只剩 d
    expect(calls.count).toBe(4);
    await checker.isBanned('d');
    expect(calls.count).toBe(4);
    await checker.isBanned('a'); // 已被清掉，重新查库
    expect(calls.count).toBe(5);
  });
});

describe('InMemoryBanChecker', () => {
  it('封禁、到期与解封', async () => {
    let now = 0;
    const checker = new InMemoryBanChecker(() => now);
    expect(await checker.isBanned('a')).toBe(false);
    checker.ban('a', new Date(50));
    expect(await checker.isBanned('a')).toBe(true);
    now = 50;
    expect(await checker.isBanned('a')).toBe(false);
    checker.ban('a');
    expect(await checker.isBanned('a')).toBe(true);
    checker.unban('a');
    expect(await checker.isBanned('a')).toBe(false);
  });
});
