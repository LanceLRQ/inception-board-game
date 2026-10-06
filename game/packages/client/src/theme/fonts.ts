// 主题字体的按需加载：只有应用了带字体的主题才去请求它的字体样式
//
// 字体样式表经动态 import 加载（构建后是独立的 CSS chunk，字体文件按字符集分片、按用到的字才下载），
// 不进任何其他主题的首屏。字体样式声明了 font-display: swap，加载期间先用回落字体，不阻塞渲染。
// 加载失败只记一条警告，界面继续用回落字体；失败后下次应用该主题时会重试。

import { logger } from '../lib/logger';
import { getSkin } from './skins';
import type { ThemeId } from './themes';

/** 每个主题的字体加载只触发一次；失败时清掉缓存以便重试 */
const loading = new Map<ThemeId, Promise<void>>();

/** 触发主题自带字体的加载；没有自带字体的主题直接完成。永不抛出 */
export function loadThemeFonts(
  id: ThemeId,
  loader: (() => Promise<unknown>) | undefined = getSkin(id).loadFonts,
): Promise<void> {
  if (!loader) return Promise.resolve();
  const pending = loading.get(id);
  if (pending) return pending;
  const task = loader().then(
    () => {
      logger.flow('ui/theme', 'theme fonts loaded', { theme: id });
    },
    (err: unknown) => {
      loading.delete(id);
      logger.warn('ui/theme', 'theme fonts failed to load, falling back', { theme: id, err });
    },
  );
  loading.set(id, task);
  return task;
}

/** 仅供测试：清空已加载记录 */
export function resetThemeFontLoading(): void {
  loading.clear();
}
