// Crockford's Base32 编码（参照设计文档 §8.3 匿名身份）
// 排除 I/L/O/U 防止混淆

const ENCODING_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const DECODING_MAP = new Map<string, number>();
for (let i = 0; i < ENCODING_CHARS.length; i++) {
  DECODING_MAP.set(ENCODING_CHARS.charAt(i), i);
}

export function encodeCrockford(num: bigint): string {
  if (num === 0n) return '0';
  let result = '';
  let n = num;
  while (n > 0n) {
    const idx = Number(n % 32n);
    result = ENCODING_CHARS[idx]! + result;
    n /= 32n;
  }
  return result;
}

export function generateRecoveryCode(): string {
  const bytes = new Uint8Array(5); // 40 bits → 8 chars in base32
  crypto.getRandomValues(bytes);
  let num = 0n;
  for (const b of bytes) {
    num = num * 256n + BigInt(b);
  }
  const raw = encodeCrockford(num).padStart(8, '0');
  // 格式化为 XXXX-XXXX
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}
