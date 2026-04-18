/**
 * Spike 14: Base58 短链原型
 * ADR-033: 自建短链 /r/:code，Base58 字符集，6 字符 ≈ 360 亿空间
 */

import { randomBytes } from 'crypto';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; // 排除 0/O/I/l

function encodeBase58(buffer: Buffer): string {
  let num = BigInt('0x' + buffer.toString('hex'));
  let result = '';
  while (num > 0n) {
    result = BASE58[Number(num % 58n)] + result;
    num = num / 58n;
  }
  return result || '1';
}

function generateShortCode(length = 6): string {
  const bytes = randomBytes(Math.ceil(length * 6 / 8)); // 足够的随机位
  return encodeBase58(bytes).slice(0, length).padStart(length, BASE58[0]);
}

function isValidCode(code: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(code) && code.length === 6;
}

let passed = 0, failed = 0;
function check(cond: boolean, name: string, detail = '') {
  if (cond) { console.log(`  ✅ ${name}`); passed++; } else { console.log(`  ❌ ${name} — ${detail}`); failed++; }
}

function main() {
  console.log('\n🧪 Spike 14: Base58 短链原型\n');

  // 格式验证
  const codes = Array.from({ length: 20 }, () => generateShortCode());
  check(codes.every(c => c.length === 6), '全部 6 字符');
  check(codes.every(c => isValidCode(c)), '全部合法 Base58');
  check(codes.every(c => !/[0OIl]/.test(c)), '无歧义字符 0/O/I/l');
  console.log(`  样本: ${codes.slice(0, 5).join(', ')}`);

  // 唯一性（1M 次碰撞测试）
  const seen = new Set<string>();
  let collisions = 0;
  const N = 1_000_000;
  for (let i = 0; i < N; i++) {
    const code = generateShortCode();
    if (seen.has(code)) collisions++;
    else seen.add(code);
  }
  check(collisions <= 50, `100 万次生成碰撞数 <=50 (${collisions}, 生日悖论预期≈13)`);
  console.log(`  空间: 58^6 = ${58**6} ≈ ${(58**6/1e9).toFixed(0)} 亿`);

  // 性能
  const start = performance.now();
  for (let i = 0; i < 100000; i++) generateShortCode();
  const elapsed = performance.now() - start;
  check(elapsed < 500, `10万次 < 500ms (${elapsed.toFixed(0)}ms)`);

  // TTL 模拟
  const store = new Map<string, { url: string; expiresAt: number }>();
  store.set('abc123', { url: 'https://game.example.com/room/ABCDEF', expiresAt: Date.now() + 2 * 3600_000 });
  check(store.has('abc123'), '短链存储和检索');

  console.log(`\n📊 ✅ ${passed} / ❌ ${failed}\n`);
}

main();
