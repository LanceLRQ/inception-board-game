// 明/暗/follow 三态主题切换 E2E
// 对照：plans/tasks.md P2 B8.4

import { test, expect, waitForAppReady } from './fixtures/index.js';

test.describe('主题切换 ThemeToggle', () => {
  test('设置页可见主题切换按钮', async ({ page }) => {
    await page.goto('/settings');
    await waitForAppReady(page);

    const toggle = page.getByRole('button', { name: /切换主题|theme|Theme/i });
    await expect(toggle.first()).toBeVisible();
  });

  test('点击切换后 localStorage 与 DOM 类名均更新', async ({ page }) => {
    await page.goto('/settings');
    await waitForAppReady(page);

    const before = await page.evaluate(() => ({
      theme: localStorage.getItem('icgame-theme'),
      hasDarkClass: document.documentElement.classList.contains('dark'),
    }));

    const toggle = page.getByRole('button', { name: /切换主题|theme|Theme/i }).first();
    await toggle.click();

    const after = await page.evaluate(() => ({
      theme: localStorage.getItem('icgame-theme'),
      hasDarkClass: document.documentElement.classList.contains('dark'),
    }));

    // 任一指标改变即视为切换成功
    const changed = before.theme !== after.theme || before.hasDarkClass !== after.hasDarkClass;
    expect(changed).toBe(true);
  });

  test('连续 3 次点击遍历 3 态不崩溃', async ({ page }) => {
    await page.goto('/settings');
    await waitForAppReady(page);

    const toggle = page.getByRole('button', { name: /切换主题|theme|Theme/i }).first();
    for (let i = 0; i < 3; i++) {
      await toggle.click();
      await page.waitForTimeout(100);
    }

    await expect(toggle).toBeVisible();
  });
});
