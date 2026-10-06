// 主题机制 E2E：主题 id 与明暗属性、主题单选组、旧存储值回落

import { test, expect, waitForAppReady } from './fixtures/index.js';

test.describe('主题 Theme', () => {
  test('默认主题为深眠影院，根元素带主题与明暗属性', async ({ page }) => {
    await page.goto('/settings');
    await waitForAppReady(page);

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'noir');
    await expect(html).toHaveAttribute('data-scheme', 'dark');
  });

  test('设置页主题单选组可见且深眠影院为选中态', async ({ page }) => {
    await page.goto('/settings');
    await waitForAppReady(page);

    await expect(page.getByRole('radiogroup', { name: /选择主题|Choose theme/ })).toBeVisible();
    const noir = page.getByRole('radio', { name: /深眠影院|Cinematic Noir/ });
    await expect(noir).toBeVisible();
    await expect(noir).toHaveAttribute('aria-checked', 'true');
  });

  test('localStorage 里的无效旧值刷新后回落到 noir', async ({ page }) => {
    await page.goto('/settings');
    await waitForAppReady(page);

    await page.evaluate(() => localStorage.setItem('icgame-theme', 'light'));
    await page.reload();
    await waitForAppReady(page);

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'noir');
    await expect(html).toHaveAttribute('data-scheme', 'dark');
  });
});
