// 像素头像确定性生成算法（跨端：浏览器 + Node）
// 对照：plans/design/06-frontend-design.md §6.7 像素头像 / ADR-032
// Spike 验证：experimental_demo/pixel-avatar-algo（已通过 6/6）
//
// 设计：
//   - 输入：任意字符串 seed（通常是 playerID 或用户摇骰的随机 hex）
//   - 输出：{ grid: 8×8 bool, palette: 4 色, foregroundColor, backgroundColor }
//   - 确定性：同 seed → 同结果
//   - 对称性：左右镜像（让脸看起来更像"头像"）
//   - 跨端：用 cyrb53 + mulberry32 纯函数（不依赖 Node Buffer）

export const AVATAR_GRID_SIZE = 8;

/** 5 套预设调色板（前景色 × 背景色） */
export const AVATAR_PALETTES: ReadonlyArray<{
  readonly id: string;
  readonly foreground: string;
  readonly background: string;
}> = [
  { id: 'sunset', foreground: '#FF6B6B', background: '#FFF3E0' },
  { id: 'ocean', foreground: '#4ECDC4', background: '#E0F7F5' },
  { id: 'forest', foreground: '#95C391', background: '#E8F5E9' },
  { id: 'lavender', foreground: '#957DAD', background: '#F3E5F5' },
  { id: 'gold', foreground: '#F7DC6F', background: '#FFF9C4' },
];

export interface PixelAvatar {
  readonly seed: string;
  readonly grid: ReadonlyArray<ReadonlyArray<boolean>>;
  readonly paletteId: string;
  readonly foregroundColor: string;
  readonly backgroundColor: string;
}

// === 跨端 hash ===

/** cyrb53 - 快速 53-bit 字符串哈希（纯函数） */
export function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** mulberry32 - 确定性伪随机生成器 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// === 核心生成 ===

/** 生成 8×8 对称像素网格 */
export function generatePixelAvatar(seed: string): PixelAvatar {
  if (typeof seed !== 'string' || seed.length === 0) {
    throw new Error('pixelAvatar: seed must be a non-empty string');
  }

  const h = cyrb53(seed);
  const rand = mulberry32(h);

  const paletteIndex = Math.floor(rand() * AVATAR_PALETTES.length) % AVATAR_PALETTES.length;
  const palette = AVATAR_PALETTES[paletteIndex]!;

  const size = AVATAR_GRID_SIZE;
  const halfWidth = Math.ceil(size / 2);
  const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // 填充规则：
  //   - 左半边每格用 PRNG 决定是否填色
  //   - 边缘（x=0, y=0, y=size-1）降低填充率，避免头像贴边太满
  //   - 右半边镜像对称
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < halfWidth; x++) {
      const threshold = x === 0 || y === 0 || y === size - 1 ? 0.3 : 0.5;
      const filled = rand() < threshold;
      grid[y]![x] = filled;
      grid[y]![size - 1 - x] = filled;
    }
  }

  return {
    seed,
    grid,
    paletteId: palette.id,
    foregroundColor: palette.foreground,
    backgroundColor: palette.background,
  };
}

/** 将头像网格序列化为 SVG 字符串（纯函数，方便服务端缓存/预渲染） */
export function avatarToSVG(avatar: PixelAvatar, pixelSize = 12): string {
  const size = avatar.grid.length;
  const totalPx = size * pixelSize;
  let rects = `<rect x="0" y="0" width="${totalPx}" height="${totalPx}" fill="${avatar.backgroundColor}"/>`;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (avatar.grid[y]![x]) {
        rects += `<rect x="${x * pixelSize}" y="${y * pixelSize}" width="${pixelSize}" height="${pixelSize}" fill="${avatar.foregroundColor}"/>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalPx} ${totalPx}" width="${totalPx}" height="${totalPx}">${rects}</svg>`;
}

/** 生成一个新的随机 seed（供"摇骰换头像"使用） */
export function generateRandomAvatarSeed(now = Date.now, rand = Math.random): string {
  const ts = now().toString(36);
  const r = Math.floor(rand() * 0xffffff)
    .toString(36)
    .padStart(4, '0');
  return `${ts}-${r}`;
}
