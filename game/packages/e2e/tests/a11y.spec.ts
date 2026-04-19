// 基础无障碍 E2E
// 对照：plans/tasks.md P1 · 基础无障碍（键盘导航 + prefers-reduced-motion）
// WCAG 2.1 / 2.2 基础要求：
//   - 2.1.1 Keyboard - 所有交互可键盘达成
//   - 2.4.1 Bypass Blocks - 跳过导航到主内容
//   - 2.4.7 Focus Visible - 聚焦可见
//   - 2.3.3 Animation from Interactions - 尊重 prefers-reduced-motion

import { test, expect, waitForAppReady } from './fixtures/index.js';

test.describe('无障碍 A11y', () => {
  // WebKit 默认 Tab 键不聚焦普通链接（依赖用户开启"全键盘访问"）
  // 键盘导航相关断言仅在 Chromium 系运行；WebKit 侧依赖真机测试
  test('首个 Tab 聚焦到"跳到主内容"链接', async ({ page, browserName }) => {
    test.skip(
      browserName === 'webkit',
      'WebKit 默认键盘导航需要系统开启"全键盘访问"，不在 E2E 矩阵内',
    );
    await page.goto('/');
    await waitForAppReady(page);

    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      text: document.activeElement?.textContent?.trim() ?? '',
      href: (document.activeElement as HTMLAnchorElement | null)?.getAttribute?.('href') ?? '',
    }));

    expect(focused.tag).toBe('A');
    expect(focused.text).toMatch(/跳到主内容|Skip to main/);
    expect(focused.href).toBe('#main-content');
  });

  test('#main-content 存在且可作为跳转锚点', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    const main = page.locator('#main-content');
    await expect(main).toHaveCount(1);
    const role = await main.getAttribute('id');
    expect(role).toBe('main-content');
  });

  test('Landing 主要链接可纯键盘导航（Tab + Enter 跳转 /local）', async ({ page, browserName }) => {
    test.skip(
      browserName === 'webkit',
      'WebKit 默认键盘导航需要系统开启"全键盘访问"，不在 E2E 矩阵内',
    );
    await page.goto('/');
    await waitForAppReady(page);
    // 等 Suspense 解开、Landing 内容真正渲染出来
    await expect(page.getByRole('link', { name: /单机练习|Single/ })).toBeVisible({
      timeout: 8_000,
    });

    // 连续 Tab 直到聚焦到"单机练习"链接（最多 15 次，避免死循环）
    let matched = false;
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      const label = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
      if (/单机练习|Single/.test(label)) {
        matched = true;
        break;
      }
    }
    expect(matched).toBe(true);

    await page.keyboard.press('Enter');
    await page.waitForURL(/\/local/);
    await expect(page.getByRole('heading', { name: /人机对战|Local/ })).toBeVisible();
  });

  test('prefers-reduced-motion=reduce 时 transition 被压缩', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.addInitScript(() => {
      try {
        localStorage.setItem('icgame-copyright-ack', '1');
      } catch {
        /* ignore */
      }
    });

    await page.goto('/');
    await waitForAppReady(page);

    // 验证 matchMedia 返回 true
    const matches = await page.evaluate(
      () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    expect(matches).toBe(true);

    // 验证全局 CSS 规则压缩 transition 时长到 1ms
    const duration = await page.evaluate(() => {
      const el = document.createElement('div');
      el.style.transition = 'opacity 500ms ease';
      document.body.appendChild(el);
      const computed = getComputedStyle(el).transitionDuration;
      document.body.removeChild(el);
      return computed;
    });
    // "1ms" 或 "0.001s"
    expect(duration).toMatch(/^(1ms|0\.001s)$/);

    await context.close();
  });

  test('主题切换按钮有 aria-label', async ({ page }) => {
    await page.goto('/settings');
    await waitForAppReady(page);

    const toggle = page.getByRole('button', { name: /切换主题|theme|Theme/i }).first();
    const ariaLabel = await toggle.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
  });

  test('Landing 页无 pageerror 且 lang 属性已设置', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');
    await waitForAppReady(page);

    const lang = await page.getAttribute('html', 'lang');
    expect(lang).toBeTruthy();
    expect(errors).toEqual([]);
  });
});
