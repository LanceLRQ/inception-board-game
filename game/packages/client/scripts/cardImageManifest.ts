#!/usr/bin/env tsx
// 卡图清单生成脚本
//
// 扫描 public/cards 下的全部卡图，写出入库的清单 src/lib/generated/cardImageManifest.ts：
// 每张图的内容哈希（卡图地址的版本参数）、字节数与宽高。宽高从 WebP 文件头解析，解析不了就报错。
// 描述与排版逻辑在 src/lib/cardImageManifestBuild.ts（纯函数，有单元测试），这里只负责读写文件。
//
// 用法（在 game/ 下）：
//   pnpm --filter @icgame/client cards:manifest           # 重新生成
//   pnpm --filter @icgame/client cards:manifest --check   # 只核对入库的清单是否与卡图一致，不一致时退出码为 1
//
// 卡图增删改之后要重新生成；pnpm assets:sync 同步完卡图会自动调用本脚本。
// 清单是否与目录一致另有单元测试守护（src/lib/cardImageManifest.test.ts）。

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import {
  describeCardImage,
  renderCardImageManifestModule,
  type CardImageManifestEntry,
} from '../src/lib/cardImageManifestBuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = resolve(__dirname, '../public/cards');
const OUTPUT = resolve(__dirname, '../src/lib/generated/cardImageManifest.ts');

/** public/cards 下全部文件的相对路径（正斜杠、NFC），遇到不是 webp 的文件直接报错 */
function listCardImages(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (/\.webp$/i.test(entry.name)) {
        out.push(relative(dir, path).split(sep).join('/').normalize('NFC'));
      } else {
        throw new Error(`public/cards 下有不是 webp 的文件：${path}`);
      }
    }
  };
  walk(dir);
  return out.sort();
}

function buildEntries(): Record<string, CardImageManifestEntry> {
  const entries: Record<string, CardImageManifestEntry> = {};
  for (const rel of listCardImages(CARDS_DIR)) {
    const bytes = readFileSync(join(CARDS_DIR, rel));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    try {
      entries[rel] = describeCardImage(new Uint8Array(bytes), sha256);
    } catch (err) {
      throw new Error(`${rel}：${err instanceof Error ? err.message : String(err)}`, {
        cause: err,
      });
    }
  }
  return entries;
}

async function main(): Promise<void> {
  const entries = buildEntries();
  const config = await prettier.resolveConfig(OUTPUT);
  const output = await prettier.format(renderCardImageManifestModule(entries), {
    ...config,
    filepath: OUTPUT,
  });
  const count = Object.keys(entries).length;

  if (process.argv.includes('--check')) {
    const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf-8') : '';
    if (current !== output) {
      console.error(`❌ ${OUTPUT} 与 public/cards 的内容不一致，请重新运行 cards:manifest`);
      process.exit(1);
    }
    console.log(`✅ ${count} card images up to date`);
    return;
  }

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, output);
  console.log(`✅ Generated manifest for ${count} card images → ${OUTPUT}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
