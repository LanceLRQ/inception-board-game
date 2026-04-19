import { test, expect, waitForAppReady } from './fixtures/index.js';

test.describe('Landing Page', () => {
  test('should load and show title', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // 验证页面标题
    const title = await page.title();
    expect(title).toContain('盗梦都市');
  });

  test('should have correct theme color meta', async ({ page }) => {
    await page.goto('/');
    const themeColor = await page.getAttribute('meta[name="theme-color"]', 'content');
    expect(themeColor).toBe('#1a1a2e');
  });

  test('should have viewport meta for mobile', async ({ page }) => {
    await page.goto('/');
    const viewport = await page.getAttribute('meta[name="viewport"]', 'content');
    expect(viewport).toContain('width=device-width');
    expect(viewport).toContain('user-scalable=no');
  });
});
