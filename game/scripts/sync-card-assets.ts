#!/usr/bin/env npx tsx
// 卡图素材同步脚本（仓库里唯一的卡图同步入口）
//
// 源：内部素材目录下的 cards/{category}/*.webp（不入库，只在维护者本机有；CI 上没有这个目录，不会跑本脚本）
// 目标：game/packages/client/public/cards/{category}/*.webp（卡图随仓库入库）
// 策略：只同步 webp（已预压缩），jpg 忽略；目标里已有且内容相同的文件跳过；
//       只复制不删除，素材目录里删掉的卡图要手动从目标目录删
//
// 用法（在 game/ 下）：
//   pnpm assets:sync
// 它先同步卡图，再重新生成卡图清单（packages/client/src/lib/generated/cardImageManifest.ts，
// 记录每张卡图的内容哈希、字节数与宽高；客户端据此给卡图地址加版本参数，卡图换了内容老用户才拿得到新图）。
// 清单与卡图是否一致由客户端的单元测试守护，只改卡图没重新生成清单会让测试失败。

import { readdirSync, mkdirSync, copyFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../');
const SRC = resolve(ROOT, 'docs/_internal/reference/assets/cards');
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

    // 增量复制：目标已存在且内容完全相同则跳过
    if (existsSync(destPath)) {
      const destStat = statSync(destPath);
      if (destStat.size === srcStat.size && readFileSync(srcPath).equals(readFileSync(destPath))) {
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
