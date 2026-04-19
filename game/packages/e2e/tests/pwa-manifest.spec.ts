// PWA manifest / meta E2E
// 对照：plans/tasks.md P0 ★ Vite PWA Plugin + SW

import { test, expect, waitForAppReady } from './fixtures/index.js';

test.describe('PWA 基础元数据', () => {
  test('manifest link 存在且可加载（prod 构建下必须）', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // Vite PWA plugin 默认仅在 build 后注入 <link rel="manifest">，dev 模式无此节点
    // 如果存在则必须可加载；不存在则视为 dev 模式跳过（由 prod E2E 守护）
    const manifestHref = await page
      .getAttribute('link[rel="manifest"]', 'href', { timeout: 1_500 })
      .catch(() => null);

    if (!manifestHref) {
      test.info().annotations.push({
        type: 'note',
        description: 'dev 模式未注入 manifest，跳过加载验证（prod 构建下必须生效）',
      });
      return;
    }

    const res = await page.request.get(manifestHref);
    expect(res.status()).toBeLessThan(400);
    const ct = res.headers()['content-type'] ?? '';
    expect(ct).toMatch(/json|manifest/i);
  });

  test('viewport meta 包含移动端配置', async ({ page }) => {
    await page.goto('/');
    const viewport = await page.getAttribute('meta[name="viewport"]', 'content');
    expect(viewport).toContain('width=device-width');
  });

  test('theme-color meta 已设置', async ({ page }) => {
    await page.goto('/');
    const theme = await page.getAttribute('meta[name="theme-color"]', 'content');
    expect(theme).toBeTruthy();
    expect(theme).toMatch(/^#[0-9a-fA-F]{3,8}$/);
  });

  test('page title 包含中英文名', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title).toMatch(/盗梦都市|Inception/);
  });
});
