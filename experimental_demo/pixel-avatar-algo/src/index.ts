/**
 * Spike 13: 像素头像算法验证
 * ADR-032: 基于 playerID hash 确定性生成 8×8 像素艺术头像（对称布局，4-6 色调色板）
 */

import { createHash } from 'crypto';

const PALETTES = [
  ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F'],
  ['#A8E6CF', '#DCEDC1', '#FFD3B6', '#FFAAA5', '#FF8B94', '#B5EAD7'],
  ['#E2F0CB', '#FFDBC5', '#E0BBE4', '#957DAD', '#D291BC', '#FEE1C7'],
];

function generatePixelAvatar(playerID: string, size = 8): boolean[][] {
  const hash = createHash('sha256').update(playerID).digest();
  const palette = PALETTES[hash[0] % PALETTES.length];
  const halfWidth = Math.ceil(size / 2);

  const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < halfWidth; x++) {
      const bitIndex = y * halfWidth + x;
      const byteIndex = Math.floor(bitIndex / 8);
      const bitOffset = bitIndex % 8;
      const isFilled = (hash[(byteIndex + 1) % hash.length] >> bitOffset) & 1;
      grid[y][x] = !!isFilled;
      grid[y][size - 1 - x] = !!isFilled; // 镜像对称
    }
  }

  return grid;
}

function avatarToSVG(grid: boolean[][], color: string): string {
  const size = grid.length;
  const px = 10;
  let rects = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (grid[y][x]) {
        rects += `<rect x="${x * px}" y="${y * px}" width="${px}" height="${px}" fill="${color}"/>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size * px} ${size * px}">${rects}</svg>`;
}

let passed = 0, failed = 0;
function check(cond: boolean, name: string, detail = '') {
  if (cond) { console.log(`  ✅ ${name}`); passed++; } else { console.log(`  ❌ ${name} — ${detail}`); failed++; }
}

function main() {
  console.log('\n🧪 Spike 13: 像素头像算法验证\n');

  // 确定性
  const a1 = generatePixelAvatar('player-1');
  const a2 = generatePixelAvatar('player-1');
  check(JSON.stringify(a1) === JSON.stringify(a2), '确定性：同 ID 结果相同');

  // 唯一性
  const ids = Array.from({ length: 1000 }, (_, i) => `p-${i}`);
  const unique = new Set(ids.map(id => JSON.stringify(generatePixelAvatar(id))));
  check(unique.size === 1000, `1000 个 ID 生成 1000 个唯一头像`);

  // 对称性
  const g = generatePixelAvatar('test-sym');
  const isSymmetric = g.every(row => {
    const half = Math.ceil(row.length / 2);
    for (let i = 0; i < half; i++) {
      if (row[i] !== row[row.length - 1 - i]) return false;
    }
    return true;
  });
  check(isSymmetric, '左右镜像对称');

  // SVG 输出
  const svg = avatarToSVG(a1, '#FF6B6B');
  check(svg.includes('<svg') && svg.includes('<rect'), 'SVG 输出正确');
  check(svg.length < 3000, `SVG 大小合理 (${svg.length} bytes)`);

  // 性能
  const start = performance.now();
  for (let i = 0; i < 10000; i++) generatePixelAvatar(`perf-${i}`);
  const elapsed = performance.now() - start;
  check(elapsed < 500, `10K 生成 < 500ms (${elapsed.toFixed(0)}ms)`);

  console.log(`\n📊 ✅ ${passed} / ❌ ${failed}\n`);
}

main();
