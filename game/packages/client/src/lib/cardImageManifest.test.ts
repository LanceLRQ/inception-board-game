// 入库的卡图清单与 public/cards 的实际内容一致：卡图增、删、改之后没重新生成清单就会失败
// （重新生成：pnpm --filter @icgame/client cards:manifest）
import { describe, it, expect } from 'vitest';
import {
  ACTION_CARDS,
  BRIBE_CARDS,
  CARD_BACK_IMAGES,
  DREAM_CARDS,
  MASTER_CHARACTERS,
  NIGHTMARE_CARDS,
  OTHER_CARDS,
  THIEF_CHARACTERS,
  VAULT_CARDS,
} from '@icgame/shared';
import {
  describeCardImage,
  renderCardImageManifestModule,
  shortHash,
  HASH_LENGTH,
  type CardImageManifestEntry,
} from './cardImageManifestBuild';
import { CARD_IMAGE_MANIFEST } from './generated/cardImageManifest';

const KEY_PREFIX = '../../public/cards/';
// ?inline 取回文件内容的 base64 数据地址（不是文字解码，字节不会损坏）
const LOADERS = import.meta.glob('../../public/cards/**/*.webp', {
  query: '?inline',
  import: 'default',
});

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function decodeDataUrl(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** 目录里每张卡图实际算出的清单项，键是相对 public/cards 的路径 */
async function scanDirectory(): Promise<Record<string, CardImageManifestEntry>> {
  const out: Record<string, CardImageManifestEntry> = {};
  for (const [key, load] of Object.entries(LOADERS)) {
    const bytes = decodeDataUrl((await load()) as string);
    out[key.slice(KEY_PREFIX.length).normalize('NFC')] = describeCardImage(
      bytes,
      await sha256Hex(bytes),
    );
  }
  return out;
}

describe('卡图清单与 public/cards 一致', () => {
  it('清单里的路径与目录里的文件一一对应（没有新增、也没有删掉的卡图）', async () => {
    const files = Object.keys(LOADERS)
      .map((k) => k.slice(KEY_PREFIX.length).normalize('NFC'))
      .sort();
    expect(files.length).toBeGreaterThan(80);
    expect(Object.keys(CARD_IMAGE_MANIFEST).sort()).toEqual(files);
  });

  it('每张卡图的哈希、字节数与宽高都与清单一致（没有改过内容而没重新生成）', async () => {
    const actual = await scanDirectory();
    expect(actual).toEqual(CARD_IMAGE_MANIFEST);
  }, 60_000);

  it('版本哈希长度固定，同目录下不同文件的哈希互不相同', () => {
    const hashes = Object.values(CARD_IMAGE_MANIFEST).map((e) => e.hash);
    for (const h of hashes) expect(h).toMatch(new RegExp(`^[0-9a-f]{${HASH_LENGTH}}$`));
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('卡牌配置里的每个图片路径（含双面角色的背面与各类通用背面）都在清单里', () => {
    const missing: string[] = [];
    const cards = [
      ...THIEF_CHARACTERS,
      ...MASTER_CHARACTERS,
      ...ACTION_CARDS,
      ...NIGHTMARE_CARDS,
      ...DREAM_CARDS,
      ...VAULT_CARDS,
      ...BRIBE_CARDS,
      ...OTHER_CARDS,
    ];
    for (const c of cards) {
      for (const p of [c.imagePath, 'backImagePath' in c ? c.backImagePath : undefined]) {
        if (p && !(p in CARD_IMAGE_MANIFEST)) missing.push(`${c.id}: ${p}`);
      }
    }
    for (const [kind, p] of Object.entries(CARD_BACK_IMAGES)) {
      if (!(p in CARD_IMAGE_MANIFEST)) missing.push(`${kind} 通用背面: ${p}`);
    }
    expect(missing).toEqual([]);
  });
});

describe('卡图尺寸', () => {
  // 界面按竖版 745/1040 的比例排牌；梦主角色牌（含通用背面）与配置表是横版 1040×745，其余全是竖版
  const landscape = new Set<string>([
    ...MASTER_CHARACTERS.map((c) => c.imagePath),
    CARD_BACK_IMAGES.master,
    ...OTHER_CARDS.filter((c) => c.id === 'other_config_table').map((c) => c.imagePath),
  ]);

  it('只有两种尺寸：竖版 745×1040 与横版 1040×745', () => {
    const sizes = new Set(Object.values(CARD_IMAGE_MANIFEST).map((e) => `${e.width}x${e.height}`));
    expect([...sizes].sort()).toEqual(['1040x745', '745x1040']);
  });

  it('横版的恰好是梦主角色牌、梦主通用背面和配置表，其余全是竖版', () => {
    expect(landscape.size).toBe(MASTER_CHARACTERS.length + 2);
    for (const [path, e] of Object.entries(CARD_IMAGE_MANIFEST)) {
      const expected = landscape.has(path) ? '1040x745' : '745x1040';
      expect(`${e.width}x${e.height}`, path).toBe(expected);
    }
  });
});

describe('清单的描述与排版', () => {
  it('shortHash 只收 64 位小写十六进制，取前 HASH_LENGTH 位', () => {
    const full = 'ab'.repeat(32);
    expect(shortHash(full)).toBe(full.slice(0, HASH_LENGTH));
    expect(() => shortHash('xyz')).toThrow();
    expect(() => shortHash('AB'.repeat(32))).toThrow();
  });

  it('describeCardImage 解析不了的文件直接抛错', () => {
    expect(() => describeCardImage(new Uint8Array(40), 'ab'.repeat(32))).toThrow();
  });

  it('renderCardImageManifestModule 按路径排序输出，同样的输入同样的输出', () => {
    const entry = (hash: string): CardImageManifestEntry => ({
      hash,
      bytes: 1,
      width: 2,
      height: 3,
    });
    const a = renderCardImageManifestModule({ 'b/x.webp': entry('1'), 'a/y.webp': entry('2') });
    const b = renderCardImageManifestModule({ 'a/y.webp': entry('2'), 'b/x.webp': entry('1') });
    expect(a).toBe(b);
    expect(a.indexOf('a/y.webp')).toBeLessThan(a.indexOf('b/x.webp'));
    expect(a).toContain('AUTO-GENERATED');
  });
});
