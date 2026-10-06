// 二维码生成器：用公开的已知向量校验纠错码、格式与版本信息，再用「按标准反向读取」验证整张矩阵

import { describe, it, expect } from 'vitest';
import {
  byteCapacity,
  dataCodewords,
  encodeDataCodewords,
  encodeQr,
  formatBits,
  functionModuleMap,
  qrSize,
  qrToSvgPath,
  reedSolomonRemainder,
  smallestVersion,
  totalCodewords,
  versionBits,
} from './qrEncoder';

const bitString = (value: number, width: number): string => value.toString(2).padStart(width, '0');

describe('Reed-Solomon 纠错码', () => {
  it('与公开示例一致：HELLO WORLD（版本 1，13 个纠错码字）', () => {
    // 来自常见的二维码入门教程中的完整推演：数据码字与对应的纠错码字
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236];
    expect(reedSolomonRemainder(data, 13)).toEqual([
      168, 72, 22, 82, 217, 54, 156, 0, 46, 15, 180, 122, 16,
    ]);
  });

  it('全零数据的余式全零', () => {
    expect(reedSolomonRemainder([0, 0, 0, 0], 10)).toEqual(new Array(10).fill(0));
  });
});

describe('格式信息与版本信息', () => {
  it.each([
    [0, '101010000010010'],
    [1, '101000100100101'],
    [2, '101111001111100'],
    [3, '101101101001011'],
    [4, '100010111111001'],
    [5, '100000011001110'],
    [6, '100111110010111'],
    [7, '100101010100000'],
  ])('纠错等级 M、掩码 %i 的格式信息', (mask, expected) => {
    expect(bitString(formatBits(mask), 15)).toBe(expected);
  });

  it.each([
    [7, '000111110010010100'],
    [8, '001000010110111100'],
    [9, '001001101010011001'],
    [10, '001010010011010011'],
  ])('版本 %i 的版本信息', (version, expected) => {
    expect(bitString(versionBits(version), 18)).toBe(expected);
  });
});

describe('容量表', () => {
  it('各版本数据码字数与字节模式容量（纠错等级 M）', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(dataCodewords)).toEqual([
      16, 28, 44, 64, 86, 108, 124, 154, 182, 216,
    ]);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(byteCapacity)).toEqual([
      14, 26, 42, 62, 84, 106, 122, 152, 180, 213,
    ]);
  });

  it('选能放下的最小版本；超过版本 10 返回 null', () => {
    expect(smallestVersion(0)).toBe(1);
    expect(smallestVersion(14)).toBe(1);
    expect(smallestVersion(15)).toBe(2);
    expect(smallestVersion(213)).toBe(10);
    expect(smallestVersion(214)).toBeNull();
  });

  it('矩阵边长 = 版本 × 4 + 17', () => {
    expect(qrSize(1)).toBe(21);
    expect(qrSize(7)).toBe(45);
  });
});

describe('数据编码', () => {
  it('字节模式：模式位、长度、数据、终止符与 EC/11 填充', () => {
    const cw = encodeDataCodewords([0x41, 0x42], 1);
    expect(cw).toHaveLength(16);
    // 0100 00000010 01000001 01000010 0000 → 40 24 14 20，其后交替填充
    expect(cw.slice(0, 4)).toEqual([0x40, 0x24, 0x14, 0x20]);
    expect(cw.slice(4, 8)).toEqual([0xec, 0x11, 0xec, 0x11]);
  });
});

/** 按标准反向读取矩阵，得到数据；同时校验每个块的纠错码 */
function decode(matrix: boolean[][]): string {
  const size = matrix.length;
  const version = (size - 17) / 4;

  // 格式信息（左上角的那一份）
  let format = 0;
  const get = (x: number, y: number): number => (matrix[y]![x] ? 1 : 0);
  for (let i = 0; i <= 5; i++) format |= get(8, i) << i;
  format |= get(8, 7) << 6;
  format |= get(8, 8) << 7;
  format |= get(7, 8) << 8;
  for (let i = 9; i < 15; i++) format |= get(14 - i, 8) << i;
  const mask = ((format ^ 0x5412) >>> 10) & 7;
  const eccLevelBits = (format ^ 0x5412) >>> 13;
  expect(eccLevelBits).toBe(0); // 纠错等级 M
  expect(formatBits(mask)).toBe(format);

  // 去掉掩码，按之字形读码字
  const isFunction = functionModuleMap(version);
  const bits: number[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (isFunction[y]![x]) continue;
        const inverted = (() => {
          switch (mask) {
            case 0:
              return (x + y) % 2 === 0;
            case 1:
              return y % 2 === 0;
            case 2:
              return x % 3 === 0;
            case 3:
              return (x + y) % 3 === 0;
            case 4:
              return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
            case 5:
              return ((x * y) % 2) + ((x * y) % 3) === 0;
            case 6:
              return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
            default:
              return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
          }
        })();
        bits.push(get(x, y) ^ (inverted ? 1 : 0));
      }
    }
  }
  const total = totalCodewords(version);
  const codewords: number[] = [];
  for (let i = 0; i < total; i++) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i * 8 + j]!;
    codewords.push(v);
  }

  // 反交错 → 逐块校验纠错码 → 拼出数据码字
  const numBlocks = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5][version]!;
  const eccLen = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26][version]!;
  const shortCount = numBlocks - (total % numBlocks);
  const shortLen = Math.floor(total / numBlocks);
  const blockData: number[][] = Array.from({ length: numBlocks }, () => []);
  const blockEcc: number[][] = Array.from({ length: numBlocks }, () => []);
  let k = 0;
  for (let i = 0; i < shortLen - eccLen + 1; i++) {
    for (let b = 0; b < numBlocks; b++) {
      if (i === shortLen - eccLen && b < shortCount) continue;
      blockData[b]!.push(codewords[k++]!);
    }
  }
  for (let i = 0; i < eccLen; i++) {
    for (let b = 0; b < numBlocks; b++) blockEcc[b]!.push(codewords[k++]!);
  }
  expect(k).toBe(total);
  for (let b = 0; b < numBlocks; b++) {
    expect(reedSolomonRemainder(blockData[b]!, eccLen)).toEqual(blockEcc[b]);
  }
  const data = blockData.flat();

  // 解析字节模式头
  let pos = 0;
  const read = (n: number): number => {
    let v = 0;
    for (let i = 0; i < n; i++) {
      v = (v << 1) | ((data[pos >>> 3]! >>> (7 - (pos & 7))) & 1);
      pos++;
    }
    return v;
  };
  expect(read(4)).toBe(0b0100);
  const length = read(version <= 9 ? 8 : 16);
  const out: number[] = [];
  for (let i = 0; i < length; i++) out.push(read(8));
  return new TextDecoder().decode(new Uint8Array(out));
}

describe('encodeQr', () => {
  it('定位图案、定时图案与固定深色模块的位置正确', () => {
    const m = encodeQr('HELLO');
    const n = m.length;
    expect(n).toBe(21);
    // 左上定位图案：外框 7×7 深色，次外圈浅色，中心 3×3 深色
    for (let i = 0; i < 7; i++) {
      expect(m[0]![i]).toBe(true);
      expect(m[6]![i]).toBe(true);
      expect(m[i]![0]).toBe(true);
      expect(m[i]![6]).toBe(true);
    }
    expect(m[1]![1]).toBe(false);
    expect(m[3]![3]).toBe(true);
    // 右上与左下也有定位图案
    expect(m[0]![n - 1]).toBe(true);
    expect(m[n - 1]![0]).toBe(true);
    // 定时图案：第 6 行 / 列深浅交替
    for (let i = 8; i < n - 8; i++) {
      expect(m[6]![i]).toBe(i % 2 === 0);
      expect(m[i]![6]).toBe(i % 2 === 0);
    }
    expect(m[n - 8]![8]).toBe(true);
  });

  it('同样的输入得到同样的矩阵（确定性）', () => {
    expect(encodeQr('https://example.com/invite/ABC234')).toEqual(
      encodeQr('https://example.com/invite/ABC234'),
    );
  });

  it.each([
    ['A'],
    ['HELLO WORLD'],
    ['https://ico.example.com/invite/ABC234'],
    ['http://localhost:3000/invite/ABC234'],
    ['https://ico.example.com/invite/ABC234?utm=' + 'x'.repeat(40)],
    ['盗梦都市 · Inception City Online'],
    ['x'.repeat(100)],
    ['y'.repeat(150)],
    ['z'.repeat(213)],
  ])('整张矩阵按标准反向读取能还原内容且每块纠错码正确：%s', (text) => {
    expect(decode(encodeQr(text))).toBe(text);
  });

  it('内容过长时抛错', () => {
    expect(() => encodeQr('x'.repeat(214))).toThrow(RangeError);
  });
});

describe('qrToSvgPath', () => {
  it('每行连续的深色模块合并成一个矩形，并带静区偏移', () => {
    const path = qrToSvgPath(
      [
        [true, true, false],
        [false, true, false],
      ],
      1,
    );
    expect(path).toBe('M1 1h2v1h-2zM2 2h1v1h-1z');
  });
});
