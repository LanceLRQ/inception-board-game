// E2E 测试 Fixtures 和基础工具
/* eslint-disable react-hooks/rules-of-hooks */

import { test as base, expect, type Page } from '@playwright/test';

// 扩展 fixture：每个 test 自动注入版权 ack + 错误监听
export const test = base.extend({
  page: async ({ page }, use) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => {
      consoleErrors.push(`[pageerror] ${err.message}`);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // 忽略 favicon / HMR 噪音
        if (text.includes('favicon.ico')) return;
        if (text.includes('vite') && text.includes('reload')) return;
        consoleErrors.push(`[console.error] ${text}`);
      }
    });

    // 注入 localStorage 预设：跳过版权弹窗与首次昵称引导
    await page.addInitScript(() => {
      try {
        localStorage.setItem('icgame-copyright-ack', '1');
      } catch {
        /* ignore */
      }
    });

    await use(page);

    // 测试结束附加 console errors 到 test info（非 assertion，便于排查）
    if (consoleErrors.length > 0) {
      console.warn('[E2E] Captured console errors during test:\n' + consoleErrors.join('\n'));
    }
  },
});

export { expect };

// 移动端 UA 检测
export function isMobileProject(projectName: string): boolean {
  return projectName.startsWith('mobile-') || projectName.startsWith('tablet-');
}

// 等待页面就绪
// - 不依赖 networkidle（Web Worker / WS 长连接会让它永不触发）
// - 仅等待 DOM 完成 + React 懒加载根节点挂载
export async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page
    .waitForFunction(() => !!document.querySelector('#root')?.firstChild, null, {
      timeout: 8_000,
    })
    .catch(() => {});
}

/**
 * 收集 test 执行期间页面层的 console errors（可选显式使用）
 */
export function createConsoleErrorRecorder(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (text.includes('favicon.ico')) return;
      errors.push(text);
    }
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return { errors };
}
