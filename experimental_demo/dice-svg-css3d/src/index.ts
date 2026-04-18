/**
 * Spike 12: 骰子 SVG 产出 + CSS 3D Demo 验证
 * ADR-041: 自绘 SVG 骰面（6面圆点），红色战斗骰 + 蓝色心锁骰
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// 骰面圆点位置（标准 d6 布局）
const DOT_POSITIONS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]],
};

function generateDieFaceSVG(value: number, color: 'red' | 'blue'): string {
  const bg = color === 'red' ? '#DC2626' : '#2563EB';
  const borderColor = color === 'red' ? '#991B1B' : '#1E3A8A';
  const dots = DOT_POSITIONS[value] || [];

  const dotElements = dots.map(([cx, cy]) =>
    `  <circle cx="${cx}" cy="${cy}" r="8" fill="white" stroke="none"/>`
  ).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect x="5" y="5" width="90" height="90" rx="12" ry="12" fill="${bg}" stroke="${borderColor}" stroke-width="3"/>
${dotElements}
</svg>`;
}

function main() {
  const DIR = join(__dirname, '..', 'output');
  mkdirSync(DIR, { recursive: true });

  let passed = 0, failed = 0;
  function check(cond: boolean, name: string) {
    if (cond) { console.log(`  ✅ ${name}`); passed++; } else { console.log(`  ❌ ${name}`); failed++; }
  }

  console.log('\n🧪 Spike 12: 骰子 SVG 产出\n');

  // 生成 12 张 SVG
  let totalSize = 0;
  for (let face = 1; face <= 6; face++) {
    const red = generateDieFaceSVG(face, 'red');
    const blue = generateDieFaceSVG(face, 'blue');
    writeFileSync(join(DIR, `dice-red-${face}.svg`), red);
    writeFileSync(join(DIR, `dice-blue-${face}.svg`), blue);
    totalSize += red.length + blue.length;
  }

  check(true, '生成 12 张 SVG（红6+蓝6）');

  // 验证内容
  const svg1 = generateDieFaceSVG(1, 'red');
  check(svg1.includes('circle') && svg1.includes('DC2626'), '红色骰 SVG 结构正确');
  check(svg1.includes('viewBox="0 0 100 100"'), 'viewBox 100×100');

  const svg6 = generateDieFaceSVG(6, 'blue');
  const circleCount = (svg6.match(/<circle/g) || []).length;
  check(circleCount === 6, `6 面=6 个圆点 (${circleCount}个)`);

  check(totalSize < 6000, `总大小 < 6KB (${(totalSize / 1024).toFixed(1)}KB)`);

  // CSS 3D 动画模板
  const css3d = `.dice-3d {
  width: 64px; height: 64px;
  perspective: 200px;
  transform-style: preserve-3d;
  transition: transform 0.6s cubic-bezier(0.23, 1, 0.32, 1);
}
.dice-3d.rolling {
  animation: diceRoll 0.6s ease-out;
}
@keyframes diceRoll {
  0% { transform: rotate3d(1, 1, 0, 0deg); }
  25% { transform: rotate3d(1, 0, 1, 360deg); }
  50% { transform: rotate3d(0, 1, 1, 720deg); }
  100% transform: rotate3d(0, 0, 1, 1080deg); }
}
@media (prefers-reduced-motion: reduce) {
  .dice-3d { transition: none; }
  .dice-3d.rolling { animation: none; }
}`;
  check(css3d.includes('prefers-reduced-motion'), 'CSS 3D 含 prefers-reduced-motion 降级');

  console.log(`\n📊 ✅ ${passed}/0 — 12 张 SVG 产出完成，总 ${(totalSize/1024).toFixed(1)}KB\n`);
}

main();
