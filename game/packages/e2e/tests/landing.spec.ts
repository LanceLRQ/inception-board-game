// Landing Page E2E
import { test, expect, waitForAppReady } from './fixtures/index.js';

test.describe('Landing Page', () => {
  test('should load and show title', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    const title = await page.title();
    expect(title).toContain('盗梦都市');

    await expect(page.getByRole('heading', { name: '盗梦都市' })).toBeVisible();
  });

  test('should have correct theme color meta', async ({ page }) => {
    await page.goto('/');
    const themeColor = await page.getAttribute('meta[name="theme-color"]', 'content');
    expect(themeColor).toBeTruthy();
  });

  test('should have viewport meta for mobile', async ({ page }) => {
    await page.goto('/');
    const viewport = await page.getAttribute('meta[name="viewport"]', 'content');
    expect(viewport).toContain('width=device-width');
  });

  test('单机练习与多人房间两个入口可见', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await expect(page.getByRole('link', { name: /单机练习|Single/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /多人房间|Multi/ })).toBeVisible();
  });

  test('点击单机练习跳转到 /local', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await page.getByRole('link', { name: /单机练习|Single/ }).click();
    await page.waitForURL(/\/local/);
    await expect(page.getByRole('heading', { name: /人机对战|Local/ })).toBeVisible({
      timeout: 5_000,
    });
  });
});
