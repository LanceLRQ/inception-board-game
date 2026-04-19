import { describe, it, expect } from 'vitest';
import {
  BOT_NAMES_CONFIG,
  DEFAULT_UGC_BAN_WORDS,
  containsBannedWord,
  generateBatch,
  generateBotNickname,
  getPoolFor,
  pickRandom,
  pickWeightedSuffix,
  resolveCollision,
  withBotBadge,
} from './generator.js';

function sequenceRand(values: readonly number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe('BOT_NAMES_CONFIG · 配置完整性', () => {
  it('every faction has 12+ base names', () => {
    expect(BOT_NAMES_CONFIG.pools.master.base.length).toBeGreaterThanOrEqual(12);
    expect(BOT_NAMES_CONFIG.pools.thief.base.length).toBeGreaterThanOrEqual(12);
    expect(BOT_NAMES_CONFIG.pools.neutral.base.length).toBeGreaterThanOrEqual(12);
  });

  it('every faction has easy/hard extension pools', () => {
    for (const f of ['master', 'thief', 'neutral'] as const) {
      expect(BOT_NAMES_CONFIG.pools[f].easy.length).toBeGreaterThan(0);
      expect(BOT_NAMES_CONFIG.pools[f].hard.length).toBeGreaterThan(0);
    }
  });

  it('suffixes include an empty option with high weight', () => {
    const empty = BOT_NAMES_CONFIG.suffixes.find((s) => s.text === '');
    expect(empty).toBeDefined();
    expect(empty!.weight).toBeGreaterThan(0);
  });

  it('botBadge is a non-empty emoji', () => {
    expect(BOT_NAMES_CONFIG.botBadge.length).toBeGreaterThan(0);
  });
});

describe('getPoolFor', () => {
  it('returns base only for normal difficulty', () => {
    const p = getPoolFor('thief', 'normal');
    expect(p).toEqual(BOT_NAMES_CONFIG.pools.thief.base);
  });

  it('appends easy pool for easy difficulty', () => {
    const p = getPoolFor('master', 'easy');
    expect(p.length).toBe(
      BOT_NAMES_CONFIG.pools.master.base.length + BOT_NAMES_CONFIG.pools.master.easy.length,
    );
  });

  it('appends hard pool for hard difficulty', () => {
    const p = getPoolFor('neutral', 'hard');
    expect(p).toContain(BOT_NAMES_CONFIG.pools.neutral.hard[0]);
  });
});

describe('pickWeightedSuffix', () => {
  it('returns empty-text suffix when weighted dominantly', () => {
    const s = pickWeightedSuffix(
      [
        { text: '', weight: 100 },
        { text: '·α', weight: 0 },
      ],
      () => 0.01,
    );
    expect(s).toBe('');
  });

  it('returns different suffix when rand is near 1', () => {
    const s = pickWeightedSuffix(
      [
        { text: 'A', weight: 10 },
        { text: 'B', weight: 10 },
        { text: 'C', weight: 10 },
      ],
      () => 0.99,
    );
    expect(s).toBe('C');
  });

  it('handles empty suffix list', () => {
    expect(pickWeightedSuffix([], () => 0.5)).toBe('');
  });

  it('handles zero/negative weights gracefully', () => {
    const s = pickWeightedSuffix(
      [
        { text: 'A', weight: 0 },
        { text: 'B', weight: -5 },
      ],
      () => 0.5,
    );
    expect(['A', 'B']).toContain(s);
  });
});

describe('pickRandom', () => {
  it('returns null on empty array', () => {
    expect(pickRandom([], () => 0.5)).toBeNull();
  });

  it('returns first item when rand is 0', () => {
    expect(pickRandom(['a', 'b', 'c'], () => 0)).toBe('a');
  });

  it('returns last item when rand is near 1', () => {
    expect(pickRandom(['a', 'b', 'c'], () => 0.99)).toBe('c');
  });
});

describe('containsBannedWord', () => {
  it('catches exact match case-insensitive', () => {
    expect(containsBannedWord('Admin Bot')).toBe(true);
    expect(containsBannedWord('管理员大人')).toBe(true);
  });

  it('returns false for clean names', () => {
    expect(containsBannedWord('潜行者·α')).toBe(false);
  });

  it('uses custom ban list when provided', () => {
    expect(containsBannedWord('BadName', ['BadName'])).toBe(true);
    expect(containsBannedWord('BadName', ['other'])).toBe(false);
  });
});

describe('resolveCollision', () => {
  it('returns original name when not in existing set', () => {
    expect(resolveCollision('潜行者', new Set())).toBe('潜行者');
  });

  it('appends #2 on first collision', () => {
    expect(resolveCollision('潜行者', new Set(['潜行者']))).toBe('潜行者#2');
  });

  it('keeps incrementing until unique', () => {
    const taken = new Set(['潜行者', '潜行者#2', '潜行者#3']);
    expect(resolveCollision('潜行者', taken)).toBe('潜行者#4');
  });

  it('falls back to random suffix after maxAttempts', () => {
    const taken = new Set<string>();
    for (let i = 2; i <= 20; i++) taken.add(`潜行者#${i}`);
    taken.add('潜行者');
    const r = resolveCollision('潜行者', taken, 20);
    expect(r).toMatch(/^潜行者#\d{4}$/);
  });
});

describe('withBotBadge', () => {
  it('adds 🤖 prefix', () => {
    const r = withBotBadge('潜行者');
    expect(r.startsWith(BOT_NAMES_CONFIG.botBadge)).toBe(true);
  });

  it('is idempotent (no double prefix)', () => {
    const once = withBotBadge('潜行者');
    const twice = withBotBadge(once);
    expect(once).toBe(twice);
  });
});

describe('generateBotNickname', () => {
  it('uses the right faction pool', () => {
    const r = generateBotNickname({
      faction: 'master',
      rand: () => 0, // 固定抽第一个
      existing: new Set(),
    });
    expect(BOT_NAMES_CONFIG.pools.master.base).toContain(r.nickname.replace(/[·#].*$/, ''));
  });

  it('output includes botBadge in display field', () => {
    const r = generateBotNickname({ faction: 'thief', rand: () => 0 });
    expect(r.display.startsWith(BOT_NAMES_CONFIG.botBadge)).toBe(true);
    expect(r.nickname).not.toContain(BOT_NAMES_CONFIG.botBadge);
  });

  it('sets collisionResolved when name clashes', () => {
    const existing = new Set<string>();
    // 先生成一次，记录结果再重新生成一次同 rand
    const first = generateBotNickname({
      faction: 'master',
      rand: () => 0,
      existing,
    });
    existing.add(first.nickname);
    const second = generateBotNickname({
      faction: 'master',
      rand: () => 0,
      existing,
    });
    expect(second.collisionResolved).toBe(true);
    expect(second.nickname).not.toBe(first.nickname);
  });

  it('retries on UGC ban word hit', () => {
    // 造一个 bannedWords 只禁第一个 pool item
    const faction = 'master' as const;
    const firstItem = BOT_NAMES_CONFIG.pools[faction].base[0]!;
    const banList = [firstItem];
    // 让 rand 前 2 次都抽 0（第一个池条目），第 3 次 rand 0.9 抽到末尾
    const rand = sequenceRand([0, 0, 0, 0, 0, 0, 0.99, 0, 0, 0]);
    const r = generateBotNickname({ faction, banWords: banList, rand, maxRetries: 5 });
    expect(r.ugcRetried).toBe(true);
    // 重试后 nickname 不应以第一个池条目开头
    expect(r.nickname.startsWith(firstItem)).toBe(false);
  });

  it('honors difficulty → pool selection', () => {
    const easyOnly = BOT_NAMES_CONFIG.pools.master.easy[0]!;
    // 抽中 easy 池末尾：让 rand 返回 ~1，base 长度大于 easy，所以 normal 抽不到 easy
    const r = generateBotNickname({ faction: 'master', difficulty: 'easy', rand: () => 0.99 });
    // easy 最后一项的末尾（pool = base + easy）
    const easyPool = [...BOT_NAMES_CONFIG.pools.master.base, ...BOT_NAMES_CONFIG.pools.master.easy];
    expect(easyPool.some((name) => r.nickname.startsWith(name))).toBe(true);
    expect(easyOnly.length).toBeGreaterThan(0);
  });
});

describe('generateBatch', () => {
  it('produces N unique nicknames', () => {
    const batch = generateBatch(10, { faction: 'thief' });
    expect(batch.length).toBe(10);
    const set = new Set(batch.map((b) => b.nickname));
    expect(set.size).toBe(10);
  });

  it('respects initialExisting for collision base', () => {
    const rand = () => 0; // 总是抽第一个
    const first = generateBotNickname({ faction: 'thief', rand });
    const batch = generateBatch(3, {
      faction: 'thief',
      rand,
      initialExisting: new Set([first.nickname]),
    });
    for (const b of batch) {
      expect(b.nickname).not.toBe(first.nickname);
    }
  });
});

describe('DEFAULT_UGC_BAN_WORDS', () => {
  it('contains 敏感 system keywords', () => {
    expect(DEFAULT_UGC_BAN_WORDS).toContain('admin');
    expect(DEFAULT_UGC_BAN_WORDS).toContain('管理员');
  });
});
