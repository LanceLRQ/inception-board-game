// 卡图的离线缓存（prod 构建 + vite preview + Service Worker）
//
// 约定：约一百张卡图（十几 MB）不进预缓存，走「用到哪张缓存哪张」的运行时缓存（cache-first，有数量上限与过期）。
// 验收：1. 预缓存里没有卡图；2. 联网看过的卡图进了运行时缓存；3. 断网后刷新，同一局面的卡图仍然显示（不是文字占位）。

import { test, expect, type Page } from '@playwright/test';

async function waitForSWActive(page: Page): Promise<void> {
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('no SW api');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        });
        setTimeout(() => resolve(), 2_000);
      });
    }
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('icgame-copyright-ack', '1');
    } catch {
      /* ignore */
    }
  });
});

/** 手牌区里所有 <img> 都已加载成功（有像素），且没有降级成文字占位 */
async function handArtLoaded(page: Page): Promise<{ imgs: number; ok: number; fallbacks: number }> {
  return page.evaluate(() => {
    const hand = document.querySelector('[data-testid="human-hand"]');
    const imgs = [...(hand?.querySelectorAll('img') ?? [])];
    return {
      imgs: imgs.length,
      ok: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
      fallbacks: hand?.querySelectorAll('[data-testid="card-art-fallback"]').length ?? 0,
    };
  });
}

test('卡图不进预缓存，看过的进运行时缓存，断网后仍能显示', async ({ page, context }) => {
  // 先让 Service Worker 接管页面，之后加载的卡图才会经过它
  await page.goto('/');
  await waitForSWActive(page);
  await page.reload();
  await waitForSWActive(page);

  await page.goto('/game/debug');
  await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => (await handArtLoaded(page)).ok, { timeout: 15_000 })
    .toBeGreaterThan(0);

  // 1. 预缓存（workbox-precache-*）里没有任何卡图
  const precacheCards = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((n) => n.includes('precache'));
    let count = 0;
    for (const n of names) {
      const keys = await (await caches.open(n)).keys();
      count += keys.filter((r) => new URL(r.url).pathname.startsWith('/cards/')).length;
    }
    return count;
  });
  expect(precacheCards).toBe(0);

  // 2. 看过的卡图已进入运行时缓存 card-art-cache
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          if (!(await caches.keys()).includes('card-art-cache')) return 0;
          return (await (await caches.open('card-art-cache')).keys()).length;
        }),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(5);

  // 2b. 运行时缓存的键是带版本参数的完整地址：路由规则命中带参数的地址，图换了哈希就变
  const cachedKeys = await page.evaluate(async () =>
    (await (await caches.open('card-art-cache')).keys()).map((r) => new URL(r.url).search),
  );
  expect(cachedKeys.length).toBeGreaterThan(5);
  for (const search of cachedKeys) expect(search).toMatch(/^\?v=[0-9a-f]{10}$/);

  // 3. 断网后刷新：同一局面的卡图仍然是图，不是文字占位
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => (await handArtLoaded(page)).ok, { timeout: 15_000 })
    .toBeGreaterThan(0);
  const after = await handArtLoaded(page);
  expect(after.fallbacks).toBe(0);
  expect(after.ok).toBe(after.imgs);
  await context.setOffline(false);
});
