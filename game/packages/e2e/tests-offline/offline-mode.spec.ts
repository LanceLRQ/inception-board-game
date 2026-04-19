// 离线模式 E2E（prod 构建 + vite preview + Service Worker）
// 对照：plans/tasks.md P0 ★ 离线模式验证（断网人机可玩）
//
// 核心验收：
//   1. 首次联网加载后 SW 注册成功，app shell 落入 workbox precache
//   2. 刷新后即便断网，首页 / /local 仍能打开
//   3. 人机对战在离线状态下可走到 playing 阶段（Worker + BGIO Local 完全客户端内闭环）

import { test, expect } from '@playwright/test';

/** 等待 Service Worker 激活并接管页面 */
async function waitForSWActive(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('no SW api');
    const reg = await navigator.serviceWorker.ready;
    // 等 controller 接管（首次安装可能需要一次 reload）
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        });
        // 兜底：2s 超时自动 resolve，下一次断言会明确成败
        setTimeout(() => resolve(), 2_000);
      });
    }
    return reg.active?.state ?? null;
  });
}

test.beforeEach(async ({ page }) => {
  // 注入版权 ack，免弹窗
  await page.addInitScript(() => {
    try {
      localStorage.setItem('icgame-copyright-ack', '1');
    } catch {
      /* ignore */
    }
  });
});

test.describe('离线模式 Offline', () => {
  test('SW 注册并激活，precache 就绪', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await waitForSWActive(page);

    // 二次刷新确保 controller 非空
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    const hasController = await page.evaluate(() => !!navigator.serviceWorker.controller);
    expect(hasController).toBe(true);
  });

  test('断网后首页仍可打开', async ({ page, context }) => {
    await page.goto('/');
    await waitForSWActive(page);
    await page.reload(); // 让 controller 接管
    await page.waitForLoadState('domcontentloaded');

    // 切断网络
    await context.setOffline(true);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: '盗梦都市' })).toBeVisible({
      timeout: 10_000,
    });

    await context.setOffline(false);
  });

  test('断网后导航至 /local 且人机局能启动', async ({ page, context }) => {
    // 先联网预热 SW 与路由块
    await page.goto('/');
    await waitForSWActive(page);
    await page.goto('/local');
    await page.waitForLoadState('domcontentloaded');
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // 断网
    await context.setOffline(true);

    // 刷新 /local
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: /人机对战|Local/ })).toBeVisible({
      timeout: 10_000,
    });

    // 开始人机局 → 等待进入 playing
    await page.getByRole('button', { name: /开始游戏|Start/ }).click();
    await expect(page.getByText(/回合\s*[1-9]/)).toBeVisible({ timeout: 15_000 });

    await context.setOffline(false);
  });

  test('完全离线下刷新 /local 不出现浏览器默认 offline 错误页', async ({ page, context }) => {
    // 先 / 预热让 SW 注册 + controller 接管
    await page.goto('/');
    await waitForSWActive(page);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // 再 /local 预热懒加载 chunk 进 cache
    await page.goto('/local');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: /人机对战|Local/ })).toBeVisible();

    await context.setOffline(true);
    const response = await page.reload();
    // workbox 离线应返回 200（来自 cache）
    if (response) {
      expect(response.status()).toBeLessThan(400);
    }

    // 等懒加载 chunk 从 precache 加载完成（Suspense 解开）
    await expect(page.getByRole('heading', { name: /人机对战|Local/ })).toBeVisible({
      timeout: 10_000,
    });

    await context.setOffline(false);
  });
});
