// 最小二维码生成器：只支持字节模式、纠错等级 M、版本 1–10（最长 213 字节），够放一条邀请链接。
// 纯函数、无依赖。步骤：数据编码 → 分块并附加 Reed-Solomon 纠错码 → 交错 → 摆放到矩阵 → 选罚分最低的掩码。
// 结构与取值对照 ISO/IEC 18004。

/** 二维码矩阵：true 为深色模块；行优先，matrix[y][x] */
export type QrMatrix = boolean[][];

/** 每个版本的纠错码字数（每块）与分块数，纠错等级 M；下标是版本号 */
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const NUM_BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

export const QR_MIN_VERSION = 1;
export const QR_MAX_VERSION = 10;
/** 纠错等级 M 在格式信息里的编码 */
const ECC_FORMAT_BITS_M = 0;

const PAD_BYTES = [0xec, 0x11];

// 罚分规则的系数
const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

function bit(value: number, index: number): boolean {
  return ((value >>> index) & 1) !== 0;
}

/** 某个版本的矩阵边长（模块数） */
export function qrSize(version: number): number {
  return version * 4 + 17;
}

/** 某个版本用来放数据与纠错码的模块数（含剩余位） */
function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

/** 某个版本的码字总数（数据 + 纠错） */
export function totalCodewords(version: number): number {
  return Math.floor(rawDataModules(version) / 8);
}

/** 某个版本能放的数据码字数（纠错等级 M） */
export function dataCodewords(version: number): number {
  return totalCodewords(version) - ECC_PER_BLOCK[version]! * NUM_BLOCKS[version]!;
}

/** 字节模式下各版本最多放多少字节 */
export function byteCapacity(version: number): number {
  const countBits = version <= 9 ? 8 : 16;
  return Math.floor((dataCodewords(version) * 8 - 4 - countBits) / 8);
}

// ---------- GF(256) 与 Reed-Solomon ----------

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

/** 生成多项式（首项系数 1 省略）：(x - 2^0)(x - 2^1)…(x - 2^(degree-1)) */
function reedSolomonDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j]!, root);
      if (j + 1 < result.length) result[j] = result[j]! ^ result[j + 1]!;
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/** 数据码字除以生成多项式的余式，即 degree 个纠错码字 */
export function reedSolomonRemainder(data: readonly number[], degree: number): number[] {
  const divisor = reedSolomonDivisor(degree);
  const result = new Array<number>(degree).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift()!;
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] = result[i]! ^ gfMultiply(coef, factor);
    });
  }
  return result;
}

// ---------- 数据编码 ----------

/** 把 UTF-8 字节编成数据码字（含模式、长度、终止符与填充） */
export function encodeDataCodewords(bytes: readonly number[], version: number): number[] {
  const bits: number[] = [];
  const push = (value: number, count: number): void => {
    for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4); // 字节模式
  push(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);

  const capacityBits = dataCodewords(version) * 8;
  push(0, Math.min(4, capacityBits - bits.length)); // 终止符
  push(0, (8 - (bits.length % 8)) % 8);
  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j]!;
    codewords.push(v);
  }
  for (let pad = 0; codewords.length < dataCodewords(version); pad++) {
    codewords.push(PAD_BYTES[pad % 2]!);
  }
  return codewords;
}

/** 分块、附加纠错码并交错，得到最终的码字序列 */
export function interleaveWithEcc(data: readonly number[], version: number): number[] {
  const numBlocks = NUM_BLOCKS[version]!;
  const blockEccLen = ECC_PER_BLOCK[version]!;
  const rawCodewords = totalCodewords(version);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dataLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const block = data.slice(k, k + dataLen);
    k += dataLen;
    const ecc = reedSolomonRemainder(block, blockEccLen);
    if (i < numShortBlocks) block.push(0); // 占位，交错时跳过
    blocks.push(block.concat(ecc));
  }

  const result: number[] = [];
  for (let i = 0; i < blocks[0]!.length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]!);
    });
  }
  return result;
}

// ---------- 格式信息与版本信息 ----------

/** 15 位格式信息（纠错等级 M + 掩码编号），已与 0x5412 异或 */
export function formatBits(mask: number): number {
  const data = (ECC_FORMAT_BITS_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** 18 位版本信息（版本 7 及以上才画） */
export function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

// ---------- 矩阵 ----------

function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const size = qrSize(version);
  const step = Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

class Grid {
  readonly modules: boolean[][];
  readonly isFunction: boolean[][];

  constructor(readonly size: number) {
    this.modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    this.isFunction = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  }

  setFunction(x: number, y: number, dark: boolean): void {
    this.modules[y]![x] = dark;
    this.isFunction[y]![x] = true;
  }

  drawFormat(mask: number): void {
    const bits = formatBits(mask);
    const { size } = this;
    for (let i = 0; i <= 5; i++) this.setFunction(8, i, bit(bits, i));
    this.setFunction(8, 7, bit(bits, 6));
    this.setFunction(8, 8, bit(bits, 7));
    this.setFunction(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) this.setFunction(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) this.setFunction(size - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) this.setFunction(8, size - 15 + i, bit(bits, i));
    this.setFunction(8, size - 8, true); // 固定的深色模块
  }

  drawFunctionPatterns(version: number): void {
    const { size } = this;
    for (let i = 0; i < size; i++) {
      this.setFunction(6, i, i % 2 === 0);
      this.setFunction(i, 6, i % 2 === 0);
    }
    this.drawFinder(3, 3);
    this.drawFinder(size - 4, 3);
    this.drawFinder(3, size - 4);

    const align = alignmentPositions(version);
    const n = align.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        this.drawAlignment(align[i]!, align[j]!);
      }
    }

    this.drawFormat(0); // 先占位，选定掩码后重画
    if (version >= 7) {
      const bits = versionBits(version);
      for (let i = 0; i < 18; i++) {
        const dark = bit(bits, i);
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        this.setFunction(a, b, dark);
        this.setFunction(b, a, dark);
      }
    }
  }

  private drawFinder(cx: number, cy: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < this.size && y >= 0 && y < this.size) {
          this.setFunction(x, y, dist !== 2 && dist !== 4);
        }
      }
    }
  }

  private drawAlignment(cx: number, cy: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  /** 按之字形把码字摆进非功能区 */
  drawCodewords(codewords: readonly number[]): void {
    const { size } = this;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!this.isFunction[y]![x] && i < codewords.length * 8) {
            this.modules[y]![x] = bit(codewords[i >>> 3]!, 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }

  applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!this.isFunction[y]![x] && maskApplies(mask, x, y)) {
          this.modules[y]![x] = !this.modules[y]![x];
        }
      }
    }
  }

  penaltyScore(): number {
    const { size, modules } = this;
    let result = 0;

    // 规则 1 与 3：同色连续块、类似定位图案的 1:1:3:1:1 序列（按行与按列各扫一遍）
    for (let pass = 0; pass < 2; pass++) {
      for (let a = 0; a < size; a++) {
        const line: boolean[] = [];
        for (let b = 0; b < size; b++) line.push(pass === 0 ? modules[a]![b]! : modules[b]![a]!);
        let run = 1;
        for (let b = 1; b < size; b++) {
          if (line[b] === line[b - 1]) {
            run++;
            if (run === 5) result += PENALTY_N1;
            else if (run > 5) result++;
          } else {
            run = 1;
          }
        }
        const text = line.map((d) => (d ? '1' : '0')).join('');
        for (let b = 0; b + 11 <= size; b++) {
          const w = text.slice(b, b + 11);
          if (w === '10111010000' || w === '00001011101') result += PENALTY_N3;
        }
      }
    }

    // 规则 2：2×2 同色块
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = modules[y]![x];
        if (c === modules[y]![x + 1] && c === modules[y + 1]![x] && c === modules[y + 1]![x + 1]) {
          result += PENALTY_N2;
        }
      }
    }

    // 规则 4：深色模块占比偏离 50% 的程度
    let dark = 0;
    for (const row of modules) for (const d of row) if (d) dark++;
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += Math.max(0, k) * PENALTY_N4;
    return result;
  }
}

function maskApplies(mask: number, x: number, y: number): boolean {
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
}

/** 某个版本里属于功能区（定位、对齐、定时、格式、版本信息）的模块，true 为功能区；测试与解码校验用 */
export function functionModuleMap(version: number): boolean[][] {
  const grid = new Grid(qrSize(version));
  grid.drawFunctionPatterns(version);
  return grid.isFunction;
}

function utf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

/** 能放下这么多字节的最小版本；放不下返回 null */
export function smallestVersion(byteLength: number): number | null {
  for (let v = QR_MIN_VERSION; v <= QR_MAX_VERSION; v++) {
    if (byteLength <= byteCapacity(v)) return v;
  }
  return null;
}

/**
 * 生成二维码矩阵（字节模式、纠错等级 M）。文本超过版本 10 的容量（213 字节）时抛错。
 * 不含四周的静区，渲染时由调用方留白。
 */
export function encodeQr(text: string): QrMatrix {
  const bytes = utf8Bytes(text);
  const version = smallestVersion(bytes.length);
  if (version === null) {
    throw new RangeError(
      `二维码内容过长：${bytes.length} 字节，最多 ${byteCapacity(QR_MAX_VERSION)}`,
    );
  }
  const codewords = interleaveWithEcc(encodeDataCodewords(bytes, version), version);

  const grid = new Grid(qrSize(version));
  grid.drawFunctionPatterns(version);
  grid.drawCodewords(codewords);

  let bestMask = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask++) {
    grid.applyMask(mask);
    grid.drawFormat(mask);
    const score = grid.penaltyScore();
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
    }
    grid.applyMask(mask); // 异或两次还原
  }
  grid.applyMask(bestMask);
  grid.drawFormat(bestMask);
  return grid.modules;
}

/** 把矩阵转成一条 SVG path（每行连续的深色模块合并成一个矩形），坐标单位是模块 */
export function qrToSvgPath(matrix: QrMatrix, quietZone = 4): string {
  const parts: string[] = [];
  matrix.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x++;
      parts.push(`M${start + quietZone} ${y + quietZone}h${x - start}v1h${start - x}z`);
    }
  });
  return parts.join('');
}
