#!/usr/bin/env npx tsx
// cards-data.json → TypeScript 生成脚本
// 输入：内部素材目录下的 cards-data.json
// 输出：packages/shared/src/cards/generated/cards.ts（已按项目格式规则排版，重复生成结果不变）
// 转换逻辑在 src/cards/codegen/transform.ts（纯函数，有单元测试），这里只负责读写文件
//
// 用法：
//   pnpm --filter @icgame/shared codegen           # 重新生成
//   pnpm --filter @icgame/shared codegen --check   # 只核对入库文件是否与数据源一致，不一致时退出码为 1

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import {
  countCards,
  renderCardsModule,
  transformCards,
  type RawCardsData,
} from '../src/cards/codegen/transform.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../../../');
const INPUT = resolve(ROOT, 'docs/_internal/reference/assets/cards-data.json');
const OUTPUT = resolve(__dirname, '../src/cards/generated/cards.ts');

async function main(): Promise<void> {
  const raw: RawCardsData = JSON.parse(readFileSync(INPUT, 'utf-8'));
  const tables = transformCards(raw);
  const counts = countCards(tables);

  const config = await prettier.resolveConfig(OUTPUT);
  const output = await prettier.format(renderCardsModule(tables), { ...config, filepath: OUTPUT });

  if (process.argv.includes('--check')) {
    const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf-8') : '';
    if (current !== output) {
      console.error(`❌ ${OUTPUT} 与数据源不一致，请重新运行 codegen`);
      process.exit(1);
    }
    console.log(`✅ ${counts.definitions} card definitions up to date`);
    return;
  }

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, output);
  console.log(`✅ Generated ${counts.definitions} card definitions → ${OUTPUT}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
