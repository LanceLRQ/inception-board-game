import { describe, it, expect } from 'vitest';
import { createCipheriv } from 'node:crypto';
import {
  chacha20Block,
  createStream,
  deriveKey,
  labelNonce,
  seededShuffle,
  shuffleWith,
} from './prng.js';

/** 旧的实现：32 位 FNV-1a 加 mulberry32，只用来证明新结果与它无关 */
function legacyShuffle<T>(input: readonly T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let t = h >>> 0;
  const rand = (): number => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  return shuffleWith(input, rand);
}

function fnv1a(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function wordsToBuffer(words: readonly number[]): Buffer {
  const buf = Buffer.alloc(words.length * 4);
  words.forEach((w, i) => buf.writeUInt32LE(w >>> 0, i * 4));
  return buf;
}

function nodeKeystream(key: Buffer, counter: number, nonce: Buffer): Buffer {
  const iv = Buffer.alloc(16);
  iv.writeUInt32LE(counter >>> 0, 0);
  nonce.copy(iv, 4);
  const cipher = createCipheriv('chacha20', key, iv);
  return cipher.update(Buffer.alloc(64));
}

function take(next: () => number, n: number): number[] {
  return Array.from({ length: n }, () => next());
}

describe('chacha20Block', () => {
  const cases: { name: string; key: number[]; nonce: [number, number, number]; counter: number }[] =
    [
      { name: '全零', key: Array(8).fill(0), nonce: [0, 0, 0], counter: 0 },
      { name: '计数器 1', key: [1, 2, 3, 4, 5, 6, 7, 8], nonce: [9, 10, 11], counter: 1 },
      {
        name: '大计数器',
        key: [0xdeadbeef, 0x01234567, 0x89abcdef, 0xfedcba98, 0, 1, 2, 3],
        nonce: [0xffffffff, 0x80000000, 7],
        counter: 0xfffffff0,
      },
      {
        name: '随机风格 A',
        key: [
          0x243f6a88, 0x85a308d3, 0x13198a2e, 0x03707344, 0xa4093822, 0x299f31d0, 0x082efa98,
          0xec4e6c89,
        ],
        nonce: [0x452821e6, 0x38d01377, 0xbe5466cf],
        counter: 12345,
      },
      {
        name: '随机风格 B',
        key: [
          0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff,
          0xffffffff,
        ],
        nonce: [0xffffffff, 0xffffffff, 0xffffffff],
        counter: 0xffffffff,
      },
    ];

  for (const c of cases) {
    it(`与 Node 自带实现逐字节一致：${c.name}`, () => {
      const ours = wordsToBuffer([...chacha20Block(Uint32Array.from(c.key), c.counter, c.nonce)]);
      const expected = nodeKeystream(wordsToBuffer(c.key), c.counter, wordsToBuffer(c.nonce));
      expect(ours.equals(expected)).toBe(true);
    });
  }
});

describe('流', () => {
  it('同种子同标签可复现', () => {
    const a = createStream(deriveKey('seed-1'), labelNonce('deck'));
    const b = createStream(deriveKey('seed-1'), labelNonce('deck'));
    expect(take(a.next, 32)).toEqual(take(b.next, 32));
  });

  it('输出落在 [0, 1) 且计数器每次加一', () => {
    const s = createStream(deriveKey('x'), labelNonce('y'), 5);
    for (const v of take(s.next, 50)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(s.counter()).toBe(55);
  });

  it('从记录的计数器续流，得到与连续取数相同的后续输出', () => {
    const key = deriveKey('resume');
    const nonce = labelNonce('runner');
    const whole = createStream(key, nonce);
    const head = take(whole.next, 10);
    const tail = take(whole.next, 10);
    const first = createStream(key, nonce);
    expect(take(first.next, 10)).toEqual(head);
    const resumed = createStream(key, nonce, first.counter());
    expect(take(resumed.next, 10)).toEqual(tail);
  });

  it('不同标签的流不同', () => {
    const key = deriveKey('seed-1');
    const a = take(createStream(key, labelNonce('vault')).next, 64);
    const b = take(createStream(key, labelNonce('bribe')).next, 64);
    expect(a).not.toEqual(b);
  });
});

describe('子流不可续算', () => {
  it('标签 A 的全部输出与标签 B 的输出没有逐位相等项，也不是错位的同一序列', () => {
    const key = deriveKey('some-seed');
    const a = take(createStream(key, labelNonce('deck')).next, 64);
    const b = take(createStream(key, labelNonce('vault')).next, 64);
    for (let i = 0; i < 64; i++) expect(a[i]).not.toBe(b[i]);
    const aSet = new Set(a);
    expect(b.some((v) => aSet.has(v))).toBe(false);
  });

  it('旧的哈希加线性发生器续算法，算不出新的洗牌结果', () => {
    const items = Array.from({ length: 24 }, (_, i) => i);
    const seed = 'some-seed';
    for (const label of ['bribe', 'nightmare', 'vault']) {
      const legacy = legacyShuffle(items, `${seed}:${label}`);
      const next = seededShuffle(items, seed, label);
      expect(next).not.toEqual(legacy);
    }
    expect(seededShuffle(items, seed, 'deck')).not.toEqual(legacyShuffle(items, seed));
  });
});

describe('洗牌', () => {
  it('结果是入参的排列，且不改入参', () => {
    const input = Array.from({ length: 30 }, (_, i) => i);
    const frozen = Object.freeze([...input]);
    const out = seededShuffle(frozen, 's', 'deck');
    expect([...out].sort((a, b) => a - b)).toEqual(input);
    expect(frozen).toEqual(input);
  });

  it('对 1000 个种子，每个元素落在每个位置的次数大致均匀', () => {
    const n = 6;
    const runs = 1000;
    const hits = Array.from({ length: n }, () => Array<number>(n).fill(0));
    for (let s = 0; s < runs; s++) {
      const out = seededShuffle([0, 1, 2, 3, 4, 5], `seed-${s}`, 'deck');
      out.forEach((item, pos) => {
        hits[item]![pos]!++;
      });
    }
    const expected = runs / n;
    for (const row of hits) {
      for (const count of row) {
        // 期望约 166.7，标准差约 12；放宽到 +-50
        expect(Math.abs(count - expected)).toBeLessThan(50);
      }
    }
  });
});

describe('状态空间', () => {
  it('只差一个字符的种子产出不同的流', () => {
    const a = take(createStream(deriveKey('seed-a'), labelNonce('deck')).next, 16);
    const b = take(createStream(deriveKey('seed-b'), labelNonce('deck')).next, 16);
    expect(a).not.toEqual(b);
  });

  it('32 位 FNV-1a 哈希相同的两个不同种子，产出不同的流', () => {
    // 生日碰撞：约 8 万个种子内必有一对
    const seen = new Map<number, string>();
    let pair: [string, string] | null = null;
    for (let i = 0; pair === null && i < 400000; i++) {
      const seed = `collide-${i}`;
      const h = fnv1a(seed);
      const other = seen.get(h);
      if (other !== undefined) pair = [other, seed];
      else seen.set(h, seed);
    }
    expect(pair).not.toBeNull();
    const [s1, s2] = pair!;
    expect(fnv1a(s1)).toBe(fnv1a(s2));
    expect(s1).not.toBe(s2);
    const a = take(createStream(deriveKey(s1), labelNonce('deck')).next, 16);
    const b = take(createStream(deriveKey(s2), labelNonce('deck')).next, 16);
    expect(a).not.toEqual(b);
  });
});
