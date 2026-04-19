// 资产管线纯逻辑（ADR-042）
// 对照：plans/design/06-frontend-design.md §6.17
//
// 拆出来的纯函数模块——便于单测，不做任何 IO。
// IO 相关（读/写/sha256/扫描目录）放在 sync-assets.ts 入口里。

export type CardCategory =
  | 'thief'
  | 'dream-master'
  | 'action'
  | 'bribe'
  | 'dream'
  | 'nightmare'
  | 'vault'
  | 'other';

export type AssetTier = 'critical' | 'match-entry' | 'idle';

export interface CardEntry {
  readonly id: string;
  readonly category: CardCategory;
  /** 原 JSON 中首选面的 image 字段（jpg 路径，后缀会被替换为 webp） */
  readonly image: string;
}

export interface AssetManifestEntry {
  readonly id: string;
  readonly category: CardCategory;
  readonly url: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly tier: AssetTier;
}

export interface AssetManifest {
  readonly version: string;
  readonly generatedAt: string;
  readonly totalBytes: number;
  readonly entries: readonly AssetManifestEntry[];
}

export interface DiffReport {
  readonly added: readonly string[]; // 新增的目标 url
  readonly updated: readonly string[]; // sha256 变化的目标 url
  readonly orphan: readonly string[]; // 目标已有但 manifest 里没有
  readonly missing: readonly string[]; // manifest 里有但源缺失
  readonly unchanged: readonly string[];
}

/** 校验英文 id：仅 a-z0-9_，长度 1-60 */
const ID_PATTERN = /^[a-z0-9_]{1,60}$/;

export function isValidCardId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/**
 * 依据 id 和 category 生成相对目标路径（不带前导 /）。
 * 例：('thief_space_queen', 'thief') → 'thief/thief_space_queen.webp'
 */
export function deriveTargetPath(id: string, category: CardCategory): string {
  return `${category}/${id}.webp`;
}

/**
 * 依据 id + category 分配 tier：
 *   - 名称匹配 *_back / *_marker → critical
 *   - category === 'other' + 非关键 → idle
 *   - 其余（角色/行动牌/梦魇/世界观 等） → match-entry
 */
export function assignTier(id: string, category: CardCategory): AssetTier {
  if (/_back$/.test(id) || /_marker$/.test(id)) return 'critical';
  if (category === 'other') return 'idle';
  return 'match-entry';
}

/**
 * 把 cards-data.json 的 image 字段（jpg 路径）转为相对于 plans/assets/ 的 webp 路径。
 * 例：'cards/thief/foo.jpg' → 'cards/thief/foo.webp'
 */
export function toWebpSourcePath(imagePathInJson: string): string {
  return imagePathInJson.replace(/\.(jpe?g|png)$/i, '.webp');
}

/**
 * 计算目标 URL（放入 manifest 的形式，带前导 /）。
 */
export function entryToUrl(entry: { id: string; category: CardCategory }): string {
  return `/cards/${deriveTargetPath(entry.id, entry.category)}`;
}

/**
 * 按 url 升序排序（保证 manifest 输出稳定、diff 可读）。
 */
export function sortEntries<T extends { url: string }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => a.url.localeCompare(b.url));
}

/**
 * 计算 diff：next（本次扫描+计算出的 manifest）vs current（磁盘上 manifest.json）。
 * 输入均为 { url, sha256 } 的集合。
 */
export function computeManifestDiff(
  current: ReadonlyArray<{ readonly url: string; readonly sha256: string }>,
  next: ReadonlyArray<{ readonly url: string; readonly sha256: string }>,
): DiffReport {
  const curr = new Map(current.map((e) => [e.url, e.sha256]));
  const nx = new Map(next.map((e) => [e.url, e.sha256]));

  const added: string[] = [];
  const updated: string[] = [];
  const unchanged: string[] = [];
  for (const [url, sha] of nx) {
    const prev = curr.get(url);
    if (prev === undefined) added.push(url);
    else if (prev !== sha) updated.push(url);
    else unchanged.push(url);
  }
  const orphan: string[] = [];
  for (const url of curr.keys()) {
    if (!nx.has(url)) orphan.push(url);
  }
  return {
    added: added.sort(),
    updated: updated.sort(),
    orphan: orphan.sort(),
    missing: [],
    unchanged: unchanged.sort(),
  };
}

/**
 * 按 diff 计算是否"有变更"（--check 用）。
 */
export function hasChanges(diff: DiffReport): boolean {
  return diff.added.length > 0 || diff.updated.length > 0 || diff.orphan.length > 0;
}

/**
 * 按 id 去重 + 双面角色 back 共享：
 * 输入多条原始 card，若 id 以 `_back` 结尾代表共享背面；
 * 返回去重后的 entry 列表（保持输入顺序）。
 */
export function dedupeCards(cards: readonly CardEntry[]): CardEntry[] {
  const seen = new Set<string>();
  const out: CardEntry[] = [];
  for (const c of cards) {
    if (!isValidCardId(c.id)) continue;
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

/**
 * 从 cards-data.json 的结构中提取平铺 card 列表。
 * JSON shape: { cards: { thief: [...], dreamMaster: [...], action: [...], ... } }
 * 其中 dreamMaster 的 key 要映射为 'dream-master'。
 */
export function extractCardsFromJson(json: {
  readonly cards: Record<string, readonly Record<string, unknown>[]>;
}): CardEntry[] {
  const out: CardEntry[] = [];
  const keyToCategory: Record<string, CardCategory> = {
    thief: 'thief',
    dreamMaster: 'dream-master',
    action: 'action',
    bribe: 'bribe',
    dream: 'dream',
    nightmare: 'nightmare',
    vault: 'vault',
    other: 'other',
  };
  for (const [key, arr] of Object.entries(json.cards)) {
    const category = keyToCategory[key];
    if (!category) continue;
    for (const raw of arr) {
      const id = typeof raw['id'] === 'string' ? (raw['id'] as string) : null;
      if (!id) continue;
      // 从 sides 或 image 字段取首个可用 image
      let image = '';
      if (Array.isArray(raw['sides'])) {
        const front = (raw['sides'] as Array<Record<string, unknown>>).find(
          (s) => s['side'] === 'front',
        );
        if (front && typeof front['image'] === 'string') image = front['image'] as string;
      }
      if (!image && typeof raw['image'] === 'string') image = raw['image'] as string;
      if (!image) continue;
      out.push({ id, category, image });
    }
  }
  return out;
}
