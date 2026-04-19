// ASSETS_MODE 开关（ADR-042 §6.17.1）
// 对照：plans/design/06-frontend-design.md §6.17.1 / §6.17.8
//
// 作用：
//   - 构建时 Vite env `VITE_ASSETS_MODE=placeholder` → 所有 GameCard 走文字占位，不加载卡图
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
