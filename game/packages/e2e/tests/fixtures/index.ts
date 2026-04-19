// E2E 测试 Fixtures 和基础工具
/* eslint-disable react-hooks/rules-of-hooks */

import { test as base, expect } from '@playwright/test';

// 扩展 fixture
export const test = base.extend({
  page: async ({ page: pageInstance }, use) => {
    pageInstance.on('pageerror', (err) => {
      console.error('Page error:', err.message);
    });
    await use(pageInstance);
  },
});

export { expect };

// 移动端 UA 检测
export function isMobileProject(projectName: string): boolean {
  return projectName.startsWith('mobile-') || projectName.startsWith('tablet-');
}

// 等待页面就绪
export async function waitForAppReady(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('#root:empty', { state: 'hidden', timeout: 5000 }).catch(() => {});
}
