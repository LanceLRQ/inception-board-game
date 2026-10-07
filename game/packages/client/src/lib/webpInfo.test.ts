import { describe, it, expect } from 'vitest';
import { parseWebpInfo } from './webpInfo';

function ascii(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0));
}

/** 拼一个只含文件头的最小 WebP：RIFF 头 + 首个数据块的前 10 字节 */
function riff(chunk: string, payload: number[]): Uint8Array {
  const body = [...ascii('WEBP'), ...ascii(chunk), 0x10, 0, 0, 0, ...payload];
  const padded = [...body, ...new Array(Math.max(0, 30 - 8 - body.length)).fill(0)];
  return new Uint8Array([...ascii('RIFF'), padded.length, 0, 0, 0, ...padded]);
}

describe('parseWebpInfo', () => {
  it('VP8（有损）：读出 14 位宽高，忽略高 2 位的缩放标记', () => {
    // 帧标签 3 字节（最低位 0 = 关键帧）+ 起始码 + 宽 745 + 高 1040
    const bytes = riff('VP8 ', [
      0x50,
      0,
      0,
      0x9d,
      0x01,
      0x2a,
      745 & 0xff,
      745 >> 8,
      1040 & 0xff,
      1040 >> 8,
    ]);
    expect(parseWebpInfo(bytes)).toEqual({ format: 'VP8', width: 745, height: 1040 });

    const scaled = riff('VP8 ', [
      0x50,
      0,
      0,
      0x9d,
      0x01,
      0x2a,
      745 & 0xff,
      (745 >> 8) | 0xc0,
      1040 & 0xff,
      1040 >> 8,
    ]);
    expect(parseWebpInfo(scaled).width).toBe(745);
  });

  it('VP8L（无损）：宽高各存「值 - 1」的 14 位', () => {
    const w = 745 - 1;
    const h = 1040 - 1;
    const bits = (w | (h << 14)) >>> 0;
    const bytes = riff('VP8L', [
      0x2f,
      bits & 0xff,
      (bits >> 8) & 0xff,
      (bits >> 16) & 0xff,
      (bits >>> 24) & 0xff,
    ]);
    expect(parseWebpInfo(bytes)).toEqual({ format: 'VP8L', width: 745, height: 1040 });
  });

  it('VP8X（扩展）：宽高各存「值 - 1」的 24 位小端', () => {
    const w = 1040 - 1;
    const h = 745 - 1;
    const bytes = riff('VP8X', [
      0,
      0,
      0,
      0,
      w & 0xff,
      (w >> 8) & 0xff,
      (w >> 16) & 0xff,
      h & 0xff,
      (h >> 8) & 0xff,
      (h >> 16) & 0xff,
    ]);
    expect(parseWebpInfo(bytes)).toEqual({ format: 'VP8X', width: 1040, height: 745 });
  });

  it('不是 WebP、被截断、签名不对时一律抛错', () => {
    expect(() => parseWebpInfo(new Uint8Array(10))).toThrow(/放不下文件头/);
    const notRiff = riff('VP8 ', [0x50, 0, 0, 0x9d, 0x01, 0x2a, 1, 0, 1, 0]);
    notRiff[0] = 0x50;
    expect(() => parseWebpInfo(notRiff)).toThrow(/RIFF/);
    const notWebp = riff('VP8 ', [0x50, 0, 0, 0x9d, 0x01, 0x2a, 1, 0, 1, 0]);
    notWebp[8] = 0x58;
    expect(() => parseWebpInfo(notWebp)).toThrow(/WEBP/);
    expect(() => parseWebpInfo(riff('ALPH', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toThrow(/数据块/);
    expect(() => parseWebpInfo(riff('VP8 ', [0x51, 0, 0, 0x9d, 0x01, 0x2a, 1, 0, 1, 0]))).toThrow(
      /关键帧/,
    );
    expect(() => parseWebpInfo(riff('VP8 ', [0x50, 0, 0, 0x00, 0x01, 0x2a, 1, 0, 1, 0]))).toThrow(
      /起始码/,
    );
    expect(() => parseWebpInfo(riff('VP8 ', [0x50, 0, 0, 0x9d, 0x01, 0x2a, 0, 0, 1, 0]))).toThrow(
      /为 0/,
    );
    expect(() => parseWebpInfo(riff('VP8L', [0x00, 0, 0, 0, 0]))).toThrow(/签名/);
  });
});
