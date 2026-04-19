import { describe, it, expect, vi } from 'vitest';
import {
  BASE58_ALPHABET,
  DEFAULT_SHORTLINK_LENGTH,
  encodeBase58,
  isValidBase58Code,
  generateShortCode,
  generateUniqueShortCode,
} from './base58.js';

describe('BASE58_ALPHABET', () => {
  it('has 58 unique characters', () => {
    expect(BASE58_ALPHABET.length).toBe(58);
    expect(new Set(BASE58_ALPHABET).size).toBe(58);
  });

  it('excludes ambiguous characters 0/O/I/l', () => {
    for (const ch of '0OIl') {
      expect(BASE58_ALPHABET.includes(ch)).toBe(false);
    }
  });
});

describe('encodeBase58', () => {
  it('returns "1" for all-zero bytes', () => {
    expect(encodeBase58(new Uint8Array([0, 0, 0]))).toBe('1');
  });

  it('is deterministic for the same input', () => {
    const bytes = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
    expect(encodeBase58(bytes)).toBe(encodeBase58(bytes));
  });

  it('outputs only valid Base58 characters', () => {
    const bytes = new Uint8Array([0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xaa]);
    const code = encodeBase58(bytes);
    for (const ch of code) {
      expect(BASE58_ALPHABET.includes(ch)).toBe(true);
    }
  });
});

describe('isValidBase58Code', () => {
  it('accepts correct Base58 strings of default length', () => {
    expect(isValidBase58Code('AbC123', 6)).toBe(true);
  });

  it('rejects wrong length when expectedLength given', () => {
    expect(isValidBase58Code('abc', 6)).toBe(false);
  });

  it('rejects strings with ambiguous characters', () => {
    expect(isValidBase58Code('0abcde')).toBe(false);
    expect(isValidBase58Code('Oabcde')).toBe(false);
    expect(isValidBase58Code('Iabcde')).toBe(false);
    expect(isValidBase58Code('labcde')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidBase58Code('')).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isValidBase58Code(null as unknown as string)).toBe(false);
    expect(isValidBase58Code(123 as unknown as string)).toBe(false);
  });
});

describe('generateShortCode', () => {
  it('returns a code of requested length by default', () => {
    const code = generateShortCode();
    expect(code.length).toBe(DEFAULT_SHORTLINK_LENGTH);
    expect(isValidBase58Code(code, DEFAULT_SHORTLINK_LENGTH)).toBe(true);
  });

  it('respects explicit length', () => {
    for (const len of [4, 6, 8, 10]) {
      const code = generateShortCode(len);
      expect(code.length).toBe(len);
      expect(isValidBase58Code(code, len)).toBe(true);
    }
  });

  it('throws on non-positive length', () => {
    expect(() => generateShortCode(0)).toThrow();
    expect(() => generateShortCode(-1)).toThrow();
  });

  it('uses injected randomBytes for determinism', () => {
    const fixedBytes: RandomBytesFnIn = () => new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc]);
    const a = generateShortCode(6, fixedBytes);
    const b = generateShortCode(6, fixedBytes);
    expect(a).toBe(b);
  });

  it('100 generations have very few collisions', () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) set.add(generateShortCode());
    // 6 字符 base58 空间 388 亿，碰撞概率可忽略
    expect(set.size).toBeGreaterThanOrEqual(99);
  });
});

describe('generateUniqueShortCode', () => {
  it('returns a code on first try when no collision', async () => {
    const exists = vi.fn(() => false);
    const code = await generateUniqueShortCode(exists);
    expect(code).toHaveLength(DEFAULT_SHORTLINK_LENGTH);
    expect(exists).toHaveBeenCalledTimes(1);
  });

  it('retries until a free code is found', async () => {
    let attempts = 0;
    const exists = vi.fn(async () => {
      attempts++;
      return attempts < 3;
    });
    const code = await generateUniqueShortCode(exists, { maxAttempts: 5 });
    expect(code).toHaveLength(DEFAULT_SHORTLINK_LENGTH);
    expect(attempts).toBe(3);
  });

  it('throws after maxAttempts collisions', async () => {
    await expect(generateUniqueShortCode(() => true, { maxAttempts: 3 })).rejects.toThrow(
      /failed to generate unique short code/,
    );
  });

  it('supports sync exists function', async () => {
    const code = await generateUniqueShortCode(() => false);
    expect(code).toHaveLength(DEFAULT_SHORTLINK_LENGTH);
  });
});

type RandomBytesFnIn = (n: number) => Uint8Array;
