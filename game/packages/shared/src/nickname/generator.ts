// Bot 昵称生成器
// 对照：plans/tasks.md NicknameGenerator（阵营池 + 难度扩展池 + 加权后缀 + 防撞 + UGC 过滤 + 🤖 徽章）
//
// 设计要点：
//   - 纯函数 + 可注入 rand / existing set，便于单测
//   - 阵营池：master / thief / neutral，各 12-16 基础 + easy/hard 扩展
//   - 加权后缀：40% 空后缀 + 多个 ·α/·β/·改/·NG 等小尾巴
//   - 防撞序号：命中已存在时追加 #2 / #3 直到唯一
//   - UGC 过滤：剥离脏字 + 敏感词；返回 null 时调用方应回退
//   - 🤖 徽章：UI 展示时加前缀，原始 nickname 不含（便于数据检索）

import botNamesJson from '../config/bot-names.json' with { type: 'json' };

export type Faction = 'master' | 'thief' | 'neutral';
export type BotDifficulty = 'easy' | 'normal' | 'hard';

export interface Suffix {
  readonly text: string;
  readonly weight: number;
}

export interface BotNamesConfig {
  readonly version: number;
  readonly pools: Readonly<
    Record<
      Faction,
      {
        readonly base: readonly string[];
        readonly easy: readonly string[];
        readonly hard: readonly string[];
      }
    >
  >;
  readonly suffixes: readonly Suffix[];
  readonly botBadge: string;
}

export const BOT_NAMES_CONFIG: BotNamesConfig = botNamesJson as BotNamesConfig;

/** 默认 UGC 敏感词列表（示例，实际部署按需扩充） */
export const DEFAULT_UGC_BAN_WORDS: readonly string[] = [
  'admin',
  '管理员',
  '官方',
  '系统',
  'system',
  'mod',
  '客服',
  'fuck',
  'shit',
  '傻逼',
  '操',
];

// === 纯函数 ===

/** 根据阵营和难度取合适的名字池 */
export function getPoolFor(
  faction: Faction,
  difficulty: BotDifficulty,
  config: BotNamesConfig = BOT_NAMES_CONFIG,
): readonly string[] {
  const p = config.pools[faction];
  if (difficulty === 'easy') return [...p.base, ...p.easy];
  if (difficulty === 'hard') return [...p.base, ...p.hard];
  return p.base;
}

/** 纯函数：加权抽一个后缀（rand 注入，便于测试） */
export function pickWeightedSuffix(suffixes: readonly Suffix[], rand: () => number): string {
  if (suffixes.length === 0) return '';
  const totalWeight = suffixes.reduce((s, x) => s + Math.max(0, x.weight), 0);
  if (totalWeight <= 0) return suffixes[0]!.text;
  let r = rand() * totalWeight;
  for (const s of suffixes) {
    r -= Math.max(0, s.weight);
    if (r <= 0) return s.text;
  }
  return suffixes[suffixes.length - 1]!.text;
}

/** 纯函数：从数组中均匀抽 1 个（rand 注入） */
export function pickRandom<T>(arr: readonly T[], rand: () => number): T | null {
  if (arr.length === 0) return null;
  const i = Math.floor(rand() * arr.length) % arr.length;
  return arr[i] ?? null;
}

/** 纯函数：UGC 过滤判定（仅判定、不修改）。返回 true 代表命中敏感词。 */
export function containsBannedWord(
  name: string,
  banList: readonly string[] = DEFAULT_UGC_BAN_WORDS,
): boolean {
  const lower = name.toLowerCase();
  for (const w of banList) {
    if (!w) continue;
    if (lower.includes(w.toLowerCase())) return true;
  }
  return false;
}

/** 纯函数：防撞——如果候选已存在，追加 #2/#3... 直到唯一 */
export function resolveCollision(
  candidate: string,
  existing: ReadonlySet<string>,
  maxAttempts = 20,
): string {
  if (!existing.has(candidate)) return candidate;
  for (let i = 2; i <= maxAttempts; i++) {
    const name = `${candidate}#${i}`;
    if (!existing.has(name)) return name;
  }
  // 最终兜底：追加随机 4 位序号
  return `${candidate}#${Math.floor(Math.random() * 9000) + 1000}`;
}

/** UI 展示时给 Bot 昵称加徽章前缀（不改数据库值） */
export function withBotBadge(name: string, config: BotNamesConfig = BOT_NAMES_CONFIG): string {
  if (name.startsWith(config.botBadge)) return name;
  return `${config.botBadge} ${name}`;
}

// === 主入口 ===

export interface GenerateOptions {
  readonly faction: Faction;
  readonly difficulty?: BotDifficulty;
  /** 已使用的昵称集合，避免碰撞 */
  readonly existing?: ReadonlySet<string>;
  /** 可注入随机源（测试） */
  readonly rand?: () => number;
  /** UGC 黑名单（测试或自定义） */
  readonly banWords?: readonly string[];
  /** 最多重试次数（命中 UGC 敏感词时） */
  readonly maxRetries?: number;
  /** 自定义配置（测试） */
  readonly config?: BotNamesConfig;
}

export interface GenerateResult {
  /** 最终昵称（不含 bot 徽章，用于数据库存储） */
  readonly nickname: string;
  /** UI 展示用（含 🤖 徽章） */
  readonly display: string;
  /** 是否触发了防撞序号 */
  readonly collisionResolved: boolean;
  /** 是否触发 UGC 重试 */
  readonly ugcRetried: boolean;
}

/**
 * 生成 Bot 昵称（主入口）。
 * - 从 pool 中抽基础名 + 加权后缀 → 校验 UGC → 防撞序号 → 返回
 * - rand 可注入用于测试稳定
 * - existing 用于一批次生成时避免同一批内冲突
 */
export function generateBotNickname(opts: GenerateOptions): GenerateResult {
  const faction = opts.faction;
  const difficulty = opts.difficulty ?? 'normal';
  const existing = opts.existing ?? new Set<string>();
  const rand = opts.rand ?? Math.random;
  const banWords = opts.banWords ?? DEFAULT_UGC_BAN_WORDS;
  const maxRetries = opts.maxRetries ?? 5;
  const config = opts.config ?? BOT_NAMES_CONFIG;

  const pool = getPoolFor(faction, difficulty, config);
  let candidate = '';
  let ugcRetried = false;

  for (let attempt = 0; attempt < Math.max(1, maxRetries); attempt++) {
    const base = pickRandom(pool, rand) ?? 'Bot';
    const suffix = pickWeightedSuffix(config.suffixes, rand);
    candidate = `${base}${suffix}`;
    if (!containsBannedWord(candidate, banWords)) break;
    ugcRetried = true;
    candidate = '';
  }

  if (!candidate) {
    // 全部尝试都命中 UGC：强制用第一个 pool 名字（不带 suffix）
    candidate = pool[0] ?? 'Bot';
  }

  const before = candidate;
  candidate = resolveCollision(candidate, existing);
  const collisionResolved = before !== candidate;

  return {
    nickname: candidate,
    display: withBotBadge(candidate, config),
    collisionResolved,
    ugcRetried,
  };
}

/** 批量生成：用于房间一次性造多个 Bot */
export function generateBatch(
  count: number,
  opts: Omit<GenerateOptions, 'existing'> & { readonly initialExisting?: ReadonlySet<string> },
): GenerateResult[] {
  const existing = new Set<string>(opts.initialExisting ?? []);
  const out: GenerateResult[] = [];
  for (let i = 0; i < count; i++) {
    const r = generateBotNickname({ ...opts, existing });
    out.push(r);
    existing.add(r.nickname);
  }
  return out;
}
