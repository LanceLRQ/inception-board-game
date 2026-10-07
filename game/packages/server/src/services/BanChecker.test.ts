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
  const rows = new Map<string, BanFields & { tokenVersion?: number }>();
  const calls = { count: 0 };
  /** 设了该钩子时，查询在返回前先等它：用来制造「查询进行中账号被改写」的竞态 */
  const gate: { before?: () => Promise<void> } = {};
  const prisma: BanPrisma = {
    player: {
      async findUnique({ where }) {
        calls.count++;
        const row = rows.get(where.id);
        // 先取快照再等待：模拟数据库在查询开始那一刻读到的值
        const snapshot = row ? { ...row, tokenVersion: row.tokenVersion ?? 0 } : null;
        await gate.before?.();
        return snapshot;
      },
    },
  };
  return { rows, calls, gate, prisma };
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

describe('PrismaBanChecker 令牌版本', () => {
  const unbanned = { isBanned: false, banUntil: null };

  it('令牌版本与库里一致才算当前，不一致或账号不存在都不是', async () => {
    const { prisma, rows } = fakePrisma();
    const checker = new PrismaBanChecker(prisma);
    rows.set('a', { ...unbanned, tokenVersion: 2 });
    expect(await checker.isTokenCurrent('a', 2)).toBe(true);
    expect(await checker.isTokenCurrent('a', 1)).toBe(false);
    expect(await checker.isTokenCurrent('a', 3)).toBe(false);
    expect(await checker.isTokenCurrent('ghost', 0)).toBe(false);
  });

  it('封禁与令牌版本共用一次查库与同一份缓存', async () => {
    const { prisma, rows, calls } = fakePrisma();
    const checker = new PrismaBanChecker(prisma);
    rows.set('a', { ...unbanned, tokenVersion: 0 });
    await checker.isBanned('a');
    await checker.isTokenCurrent('a', 0);
    await checker.isTokenCurrent('a', 0);
    expect(calls.count).toBe(1);
  });

  it('缓存时长内读不到版本变化，invalidate 之后立刻读到', async () => {
    const { prisma, rows } = fakePrisma();
    const checker = new PrismaBanChecker(prisma);
    rows.set('a', { ...unbanned, tokenVersion: 0 });
    expect(await checker.isTokenCurrent('a', 0)).toBe(true);
    rows.set('a', { ...unbanned, tokenVersion: 1 });
    expect(await checker.isTokenCurrent('a', 0)).toBe(true); // 缓存未失效
    checker.invalidate('a');
    expect(await checker.isTokenCurrent('a', 0)).toBe(false);
    expect(await checker.isTokenCurrent('a', 1)).toBe(true);
  });

  it('查询进行中账号被 invalidate：这次读到的旧值不写进缓存', async () => {
    const { prisma, rows, calls, gate } = fakePrisma();
    const checker = new PrismaBanChecker(prisma);
    rows.set('a', { ...unbanned, tokenVersion: 0 });
    let release!: () => void;
    gate.before = () => new Promise<void>((resolve) => (release = resolve));
    const pending = checker.isTokenCurrent('a', 0); // 读到版本 0 后卡住

    // 此时账号在别处被恢复：版本加一并失效缓存
    rows.set('a', { ...unbanned, tokenVersion: 1 });
    checker.invalidate('a');
    release();
    expect(await pending).toBe(true); // 这次请求本身按它读到的值判定

    gate.before = undefined;
    expect(await checker.isTokenCurrent('a', 0)).toBe(false); // 下一次必须重新查库
    expect(calls.count).toBe(2);
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

  it('令牌版本默认是 0，可按账号改写', async () => {
    const checker = new InMemoryBanChecker();
    expect(await checker.isTokenCurrent('a', 0)).toBe(true);
    expect(await checker.isTokenCurrent('a', 1)).toBe(false);
    checker.setTokenVersion('a', 2);
    expect(await checker.isTokenCurrent('a', 2)).toBe(true);
    expect(await checker.isTokenCurrent('a', 0)).toBe(false);
  });
});
