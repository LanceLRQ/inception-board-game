// ASSETS_MODE 开关
//
// 作用：
//   - 构建时 Vite env `VITE_ASSETS_MODE=placeholder` → 所有卡图（CardArt）走文字占位，不加载卡图
//   - 私有部署/开源 fork 没有授权卡图时，设置此值即可完整运行
//
// 纯函数导出便于测试；Hook 包装留给上层。

export type AssetsMode = 'normal' | 'placeholder';

/** 从字符串归一化为合法值 */
export function normalizeAssetsMode(raw: string | undefined): AssetsMode {
  if (typeof raw !== 'string') return 'normal';
  const lower = raw.trim().toLowerCase();
  return lower === 'placeholder' ? 'placeholder' : 'normal';
}

/** 当前 mode（Vite env 注入）。SSR 或 vitest 环境下退化为 normal。 */
export function getAssetsMode(): AssetsMode {
  try {
    const raw = import.meta.env?.['VITE_ASSETS_MODE'] as string | undefined;
    return normalizeAssetsMode(raw);
  } catch {
    return 'normal';
  }
}

export function isPlaceholderMode(): boolean {
  return getAssetsMode() === 'placeholder';
}
