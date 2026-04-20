#!/usr/bin/env npx tsx
// 卡图素材同步脚本
// 源：plans/assets/cards/{category}/*.webp
// 目标：game/packages/client/public/cards/{category}/*.webp
// 策略：只同步 webp（已预压缩），jpg 忽略；不在仓库保留目标目录

import { readdirSync, mkdirSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../');
const SRC = resolve(ROOT, 'plans/assets/cards');
const DEST = resolve(ROOT, 'game/packages/client/public/cards');

const CATEGORIES = [
  'thief',
  'dream-master',
  'action',
  'nightmare',
  'dream',
  'vault',
  'bribe',
  'other',
] as const;

interface SyncStat {
  copied: number;
  skipped: number;
  missingSrc: number;
}

function syncCategory(cat: string): SyncStat {
  const srcDir = join(SRC, cat);
  const destDir = join(DEST, cat);

  if (!existsSync(srcDir)) {
    console.warn(`⚠️  源目录缺失: ${srcDir}`);
    return { copied: 0, skipped: 0, missingSrc: 1 };
  }

  mkdirSync(destDir, { recursive: true });

  const files = readdirSync(srcDir).filter((f) => f.endsWith('.webp'));
  let copied = 0;
  let skipped = 0;

  for (const file of files) {
    const srcPath = join(srcDir, file);
    const destPath = join(destDir, file);
    const srcStat = statSync(srcPath);

    // 增量复制：目标已存在且大小一致则跳过
    if (existsSync(destPath)) {
      const destStat = statSync(destPath);
      if (destStat.size === srcStat.size) {
        skipped++;
        continue;
      }
    }

    copyFileSync(srcPath, destPath);
    copied++;
  }

  return { copied, skipped, missingSrc: 0 };
}

function main() {
  console.log(`📦 卡图同步开始`);
  console.log(`   源: ${SRC}`);
  console.log(`   目标: ${DEST}`);
  console.log('');

  let totalCopied = 0;
  let totalSkipped = 0;
  let totalMissing = 0;

  for (const cat of CATEGORIES) {
    const stat = syncCategory(cat);
    totalCopied += stat.copied;
    totalSkipped += stat.skipped;
    totalMissing += stat.missingSrc;
    console.log(
      `   ${cat.padEnd(14)} → +${stat.copied} copied · ${stat.skipped} skipped${
        stat.missingSrc ? ' · ⚠️ 源缺失' : ''
      }`,
    );
  }

  console.log('');
  console.log(
    `✅ 完成：${totalCopied} 新复制 · ${totalSkipped} 已存在跳过 · ${totalMissing} 分类源缺失`,
  );
}

main();
