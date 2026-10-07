// WebP 文件头解析：只取画布宽高
//
// 卡图清单（scripts/cardImageManifest.ts）和它的一致性测试共用。WebP 是 RIFF 容器，
// 第一个数据块决定画布尺寸的存放方式：
//   - VP8  有损：帧头里 14 位宽、14 位高
//   - VP8L 无损：头部 14 位（宽 - 1）、14 位（高 - 1）
//   - VP8X 扩展：24 位（宽 - 1）、24 位（高 - 1）
// 解析不了就抛错，不给默认值。

export type WebpFormat = 'VP8' | 'VP8L' | 'VP8X';

export interface WebpInfo {
  readonly format: WebpFormat;
  readonly width: number;
  readonly height: number;
}

function fourcc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  );
}

function fail(why: string): never {
  throw new Error(`不是可解析的 WebP：${why}`);
}

/** 24 位小端整数 */
function u24(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);
}

export function parseWebpInfo(bytes: Uint8Array): WebpInfo {
  if (bytes.length < 30) fail(`文件只有 ${bytes.length} 字节，放不下文件头`);
  if (fourcc(bytes, 0) !== 'RIFF') fail('缺少 RIFF 标记');
  if (fourcc(bytes, 8) !== 'WEBP') fail('缺少 WEBP 标记');
  const chunk = fourcc(bytes, 12);

  if (chunk === 'VP8 ') {
    // 20..22 帧标签（最低位 0 表示关键帧），23..25 起始码 9d 01 2a，26..29 宽高（各 14 位有效）
    if (((bytes[20] ?? 1) & 1) !== 0) fail('VP8 不是关键帧');
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) fail('VP8 起始码不对');
    const width = ((bytes[26] ?? 0) | ((bytes[27] ?? 0) << 8)) & 0x3fff;
    const height = ((bytes[28] ?? 0) | ((bytes[29] ?? 0) << 8)) & 0x3fff;
    if (width === 0 || height === 0) fail('VP8 宽高为 0');
    return { format: 'VP8', width, height };
  }

  if (chunk === 'VP8L') {
    // 20 签名 0x2f，21..24 起 14 位（宽 - 1）与 14 位（高 - 1）
    if (bytes[20] !== 0x2f) fail('VP8L 签名不对');
    const bits =
      ((bytes[21] ?? 0) |
        ((bytes[22] ?? 0) << 8) |
        ((bytes[23] ?? 0) << 16) |
        ((bytes[24] ?? 0) << 24)) >>>
      0;
    return { format: 'VP8L', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }

  if (chunk === 'VP8X') {
    // 20..23 标志位与保留，24..26 宽 - 1，27..29 高 - 1
    return { format: 'VP8X', width: u24(bytes, 24) + 1, height: u24(bytes, 27) + 1 };
  }

  return fail(`不认识的首个数据块 ${JSON.stringify(chunk)}`);
}
