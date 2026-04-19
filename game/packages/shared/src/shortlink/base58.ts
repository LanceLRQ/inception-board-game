// Base58 短链编码（跨端：浏览器 + Node）
// 对照：plans/design/07-backend-network.md §7.11 短链 / ADR-033
// Spike 验证：experimental_demo/base58-shortlink（6/6 通过）
//
// 设计：
//   - Base58 字符集排除歧义字符 0 / O / I / l
//   - 默认 6 字符码 ≈ 58^6 ≈ 388 亿空间
//   - 生成使用 Web Crypto `getRandomValues`（浏览器 + Node 20+ 原生支持）

/** Base58 字符集（无歧义）。 */
export const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** 默认短链长度 */
export const DEFAULT_SHORTLINK_LENGTH = 6;

const BASE58_SET = new Set(BASE58_ALPHABET);

/** 字节数组 → Base58 字符串 */
export function encodeBase58(bytes: Uint8Array | ArrayLike<number>): string {
  let num = 0n;
  for (let i = 0; i < bytes.length; i++) {
    num = (num << 8n) | BigInt(bytes[i] ?? 0);
  }
  if (num === 0n) return BASE58_ALPHABET[0]!;
  let out = '';
  while (num > 0n) {
    const rem = Number(num % 58n);
    out = BASE58_ALPHABET[rem]! + out;
    num /= 58n;
  }
  return out;
}

/** 校验字符串是否是合法 Base58 码（长度 + 字符） */
export function isValidBase58Code(code: string, expectedLength?: number): boolean {
  if (typeof code !== 'string') return false;
  if (expectedLength !== undefined && code.length !== expectedLength) return false;
  if (code.length === 0) return false;
  for (let i = 0; i < code.length; i++) {
    if (!BASE58_SET.has(code.charAt(i))) return false;
  }
  return true;
}

/** 内置跨端 randomBytes：Web Crypto 优先，否则 fallback Math.random（仅开发/测试） */
export type RandomBytesFn = (byteLength: number) => Uint8Array;

export function defaultRandomBytes(byteLength: number): Uint8Array {
  const buf = new Uint8Array(byteLength);
  const g = globalThis as unknown as { crypto?: { getRandomValues?: (b: Uint8Array) => void } };
  if (g.crypto && typeof g.crypto.getRandomValues === 'function') {
    g.crypto.getRandomValues(buf);
    return buf;
  }
  // fallback（仅限非生产环境；Node 20+ 原生有 crypto.getRandomValues，此分支基本不会触发）
  for (let i = 0; i < byteLength; i++) buf[i] = Math.floor(Math.random() * 256);
  return buf;
}

/** 生成一个固定长度的 Base58 短码 */
export function generateShortCode(
  length: number = DEFAULT_SHORTLINK_LENGTH,
  randomBytes: RandomBytesFn = defaultRandomBytes,
): string {
  if (length <= 0) throw new Error('length must be positive');
  // 多取几字节保证 encode 后长度足够
  const bytes = randomBytes(Math.ceil((length * 6) / 8) + 2);
  const encoded = encodeBase58(bytes);
  if (encoded.length >= length) return encoded.slice(0, length);
  return encoded.padStart(length, BASE58_ALPHABET[0]!);
}

/** 带碰撞重试的短码生成 */
export async function generateUniqueShortCode(
  exists: (code: string) => boolean | Promise<boolean>,
  opts: {
    readonly length?: number;
    readonly maxAttempts?: number;
    readonly randomBytes?: RandomBytesFn;
  } = {},
): Promise<string> {
  const length = opts.length ?? DEFAULT_SHORTLINK_LENGTH;
  const maxAttempts = opts.maxAttempts ?? 8;
  const rand = opts.randomBytes ?? defaultRandomBytes;

  for (let i = 0; i < maxAttempts; i++) {
    const code = generateShortCode(length, rand);
    const taken = await exists(code);
    if (!taken) return code;
  }
  throw new Error(`failed to generate unique short code after ${maxAttempts} attempts`);
}
