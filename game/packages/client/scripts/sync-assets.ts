#!/usr/bin/env tsx
// ADR-042 卡牌素材同步脚本
// 对照：plans/design/06-frontend-design.md §6.17.3
//
// 用法：
//   pnpm assets:sync              # 默认：按 sha256 幂等复制 + 重写 manifest.json
//   pnpm assets:sync --check      # CI：仅校验目标产物与源一致，差异则 exit 1（不改文件）
//   pnpm assets:sync --clean      # 清理 public/cards/ 下不在 manifest 中的孤儿文件
//
// 来源：
//   - plans/assets/cards-data.json（唯一事实源，已 gitignored）
//   - plans/assets/cards/**/*.webp（仅 webp 白名单）
//
// 目标：
//   - game/packages/client/public/cards/{category}/{id}.webp
//   - game/packages/client/public/cards/manifest.json

import { createHash } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  copyFileSync,
  rmSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AssetManifest,
  type AssetManifestEntry,
  type CardCategory,
  assignTier,
  computeManifestDiff,
  deriveTargetPath,
  entryToUrl,
  extractCardsFromJson,
  hasChanges,
  sortEntries,
  toWebpSourcePath,
} from './assetPipeline.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 路径解析（脚本在 game/packages/client/scripts/）
const REPO_ROOT = resolve(__dirname, '../../../..');
const SOURCE_DATA = resolve(REPO_ROOT, 'plans/assets/cards-data.json');
const SOURCE_CARDS_DIR = resolve(REPO_ROOT, 'plans/assets');
const TARGET_DIR = resolve(__dirname, '../public/cards');
const MANIFEST_PATH = join(TARGET_DIR, 'manifest.json');
const MANIFEST_VERSION = '1.0.0';

type Mode = 'sync' | 'check' | 'clean';

function parseArgs(argv: readonly string[]): Mode {
  if (argv.includes('--check')) return 'check';
  if (argv.includes('--clean')) return 'clean';
  return 'sync';
}

function sha256File(path: string): string {
  const buf = readFileSync(path);
  return createHash('sha256').update(buf).digest('hex');
}

function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

/** 读取磁盘上现有 manifest（若存在） */
function readCurrentManifest(): AssetManifest | null {
  if (!existsSync(MANIFEST_PATH)) return null;
  try {
    const text = readFileSync(MANIFEST_PATH, 'utf-8');
    return JSON.parse(text) as AssetManifest;
  } catch {
    return null;
  }
}

/** 构建下一版 manifest 条目（扫描源文件） */
function buildNextEntries(): {
  entries: AssetManifestEntry[];
  missing: string[];
  jpgBlocked: string[];
} {
  const json = JSON.parse(readFileSync(SOURCE_DATA, 'utf-8')) as Parameters<
    typeof extractCardsFromJson
  >[0];
  const cards = extractCardsFromJson(json);

  const entries: AssetManifestEntry[] = [];
  const missing: string[] = [];
  const jpgBlocked: string[] = [];

  for (const c of cards) {
    // 拒绝复制 jpg 源
    if (/\.(jpe?g|png)$/i.test(c.image) && !c.image.endsWith('.webp')) {
      // OK: 允许，因为会被 toWebpSourcePath 改成 webp 查找
    }
    const webpRel = toWebpSourcePath(c.image);
    const srcAbs = resolve(SOURCE_CARDS_DIR, webpRel);
    if (!existsSync(srcAbs)) {
      missing.push(c.id);
      continue;
    }
    if (!srcAbs.toLowerCase().endsWith('.webp')) {
      jpgBlocked.push(c.id);
      continue;
    }
    const size = statSync(srcAbs).size;
    const sha = sha256File(srcAbs);
    const cat = c.category as CardCategory;
    entries.push({
      id: c.id,
      category: cat,
      url: entryToUrl({ id: c.id, category: cat }),
      bytes: size,
      sha256: sha,
      tier: assignTier(c.id, cat),
    });
  }
  return { entries: sortEntries(entries), missing, jpgBlocked };
}

/** 比较磁盘上已有 webp 文件的 sha256，判断是否需要复制 */
function needsCopy(destAbs: string, expectedSha: string): boolean {
  if (!existsSync(destAbs)) return true;
  return sha256File(destAbs) !== expectedSha;
}

function run(): void {
  const mode = parseArgs(process.argv.slice(2));

  if (!existsSync(SOURCE_DATA)) {
    console.error(`[assets:sync] cards-data.json 不存在：${SOURCE_DATA}`);
    console.error(
      '[assets:sync] 私有部署/开源 fork 没有源素材时属正常，可设 ASSETS_MODE=placeholder 跳过',
    );
    if (mode === 'check') process.exit(0); // 允许 CI 在无源时通过
    process.exit(1);
  }

  console.log(`[assets:sync] mode=${mode}`);
  const { entries, missing, jpgBlocked } = buildNextEntries();
  const now = new Date().toISOString();
  const totalBytes = entries.reduce((s, e) => s + e.bytes, 0);
  const nextManifest: AssetManifest = {
    version: MANIFEST_VERSION,
    generatedAt: now,
    totalBytes,
    entries,
  };

  const current = readCurrentManifest();
  const diff = computeManifestDiff(
    (current?.entries ?? []).map((e) => ({ url: e.url, sha256: e.sha256 })),
    entries.map((e) => ({ url: e.url, sha256: e.sha256 })),
  );

  // 打印统计
  console.log(`  entries: ${entries.length}  totalBytes: ${totalBytes}`);
  console.log(
    `  added: ${diff.added.length}  updated: ${diff.updated.length}  orphan: ${diff.orphan.length}  unchanged: ${diff.unchanged.length}`,
  );
  if (missing.length > 0)
    console.warn(
      `  ⚠ ${missing.length} 张卡在 cards-data 中有 id 但源 webp 缺失：${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}`,
    );
  if (jpgBlocked.length > 0)
    console.warn(`  ✗ ${jpgBlocked.length} 张卡源为非 webp，已跳过：${jpgBlocked.join(', ')}`);

  if (mode === 'check') {
    if (hasChanges(diff)) {
      console.error('[assets:sync] --check 发现差异，退出 1');
      process.exit(1);
    }
    console.log('[assets:sync] --check 通过，无差异');
    return;
  }

  if (mode === 'clean') {
    cleanOrphans(entries);
    return;
  }

  // sync：幂等复制 + 重写 manifest
  let copied = 0;
  let skipped = 0;
  for (const entry of entries) {
    const destRel = deriveTargetPath(entry.id, entry.category);
    const destAbs = join(TARGET_DIR, destRel);
    const srcAbs = findSourceFor(entry);
    if (!srcAbs) continue;
    ensureDir(dirname(destAbs));
    if (!needsCopy(destAbs, entry.sha256)) {
      skipped++;
      continue;
    }
    copyFileSync(srcAbs, destAbs);
    copied++;
  }
  ensureDir(TARGET_DIR);
  writeFileSync(MANIFEST_PATH, JSON.stringify(nextManifest, null, 2) + '\n', 'utf-8');
  console.log(
    `  copied: ${copied}  skipped: ${skipped}  manifest: ${relative(REPO_ROOT, MANIFEST_PATH)}`,
  );
}

function findSourceFor(entry: AssetManifestEntry): string | null {
  // 解析回源：entry.url = '/cards/{category}/{id}.webp'
  // 源在 plans/assets/cards/**/*.webp（中文原名），需要通过 cards-data.json 反查
  // 简化：用 tier/id 直接找最匹配的 webp——通过 sha256 反查不现实
  // 这里改为：再读一次 cards-data 取 image 并替换为 .webp
  const json = JSON.parse(readFileSync(SOURCE_DATA, 'utf-8')) as Parameters<
    typeof extractCardsFromJson
  >[0];
  const cards = extractCardsFromJson(json);
  const m = cards.find((c) => c.id === entry.id);
  if (!m) return null;
  const abs = resolve(SOURCE_CARDS_DIR, toWebpSourcePath(m.image));
  return existsSync(abs) ? abs : null;
}

function cleanOrphans(entries: readonly AssetManifestEntry[]): void {
  if (!existsSync(TARGET_DIR)) {
    console.log('[assets:sync] --clean: 目标目录不存在，nothing to do');
    return;
  }
  const keep = new Set(entries.map((e) => join(TARGET_DIR, deriveTargetPath(e.id, e.category))));
  keep.add(MANIFEST_PATH);
  let removed = 0;
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (!keep.has(p)) {
        rmSync(p);
        removed++;
      }
    }
  };
  walk(TARGET_DIR);
  console.log(`  removed orphans: ${removed}`);
}

run();
