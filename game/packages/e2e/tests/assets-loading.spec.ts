// 素材预加载：进站只取关键素材；进对局前的加载界面显示真实进度；失败的素材不阻塞，卡图降级为文字加类别色块

import { test, expect, waitForAppReady } from './fixtures/index.js';

/** 卡图请求（只匹配 /cards/ 下的 webp；开发服务器里的 shared/src/cards/*.ts 模块不能被拦） */
const CARD_IMAGES = /\/cards\/.*\.webp(?:\?.*)?$/;

test.describe('素材预加载', () => {
  test('进站（首页）只取界面必需的小图，不取角色牌与行动牌', async ({ page }) => {
    const cardRequests: string[] = [];
    page.on('request', (req) => {
      const url = decodeURIComponent(new URL(req.url()).pathname);
      if (url.startsWith('/cards/')) cardRequests.push(url);
    });
    await page.goto('/');
    await waitForAppReady(page);
    await page.waitForTimeout(1_500);
    expect(cardRequests.length).toBeGreaterThanOrEqual(1);
    expect(cardRequests.length).toBeLessThan(15);
    expect(cardRequests.some((u) => u.startsWith('/cards/thief/') && !u.includes('背面'))).toBe(
      false,
    );
    expect(cardRequests.some((u) => u.startsWith('/cards/action/') && !u.includes('背面'))).toBe(
      false,
    );
  });

  test('卡图地址都带版本参数；<img> 实际请求的地址与预加载取的是同一批', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (req) => {
      const u = new URL(req.url());
      if (u.pathname.startsWith('/cards/') && u.pathname.endsWith('.webp')) {
        requested.push(u.pathname + u.search);
      }
    });
    await page.goto('/game/debug');
    await waitForAppReady(page);
    await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('asset-loading-screen')).toHaveCount(0, { timeout: 25_000 });
    expect(requested.length).toBeGreaterThan(10);
    for (const u of requested) expect(u, u).toMatch(/\?v=[0-9a-f]{10}$/);
    // 页面上的卡图 <img> 地址同样带版本参数，且都在已请求过的地址里（命中同一份缓存）
    const srcs = await page.evaluate(() =>
      [...document.images]
        .map((img) => new URL(img.currentSrc || img.src))
        .filter((u) => u.pathname.startsWith('/cards/'))
        .map((u) => u.pathname + u.search),
    );
    expect(srcs.length).toBeGreaterThan(0);
    const seen = new Set(requested);
    for (const s of srcs) {
      expect(s, s).toMatch(/\?v=[0-9a-f]{10}$/);
      expect(seen.has(s), `${s} 没有被请求过`).toBe(true);
    }
  });

  test('进对局前取得慢：显示已加载 / 总数的真实进度，取完后放行', async ({ page }) => {
    let n = 0;
    await page.route(CARD_IMAGES, async (route) => {
      n += 1;
      await new Promise((r) => setTimeout(r, 300 + (n % 4) * 150));
      await route.continue();
    });
    await page.goto('/game/debug');
    await waitForAppReady(page);
    const screen = page.getByTestId('asset-loading-screen');
    await expect(screen).toBeVisible({ timeout: 8_000 });
    const text = (await page.getByTestId('asset-loading-count').textContent()) ?? '';
    const m = /(\d+)\s*\/\s*(\d+)/.exec(text);
    expect(m, `进度文字应含「已加载 n / 总数」：${text}`).not.toBeNull();
    expect(Number(m![2])).toBeGreaterThan(10);
    await expect(screen).toHaveCount(0, { timeout: 25_000 });
    await expect(page.getByTestId('runtime-stage')).toBeVisible();
  });

  test('素材全部加载失败：不阻塞进入对局，卡图降级为卡名文字与类别色块，没有破图', async ({
    page,
  }) => {
    await page.route(CARD_IMAGES, (route) => route.abort());
    await page.goto('/game/debug');
    await waitForAppReady(page);
    await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
    // 加载界面最多停留几秒就放行
    await expect(page.getByTestId('asset-loading-screen')).toHaveCount(0, { timeout: 15_000 });
    const hand = page.getByTestId('human-hand');
    await expect(hand.locator('[data-testid="card-art-fallback"]').first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(hand.locator('[data-testid="card-art-fallback"]').first()).not.toBeEmpty();
    // 页面里没有留下加载失败的 <img>：图片报错到换成占位之间隔着一次渲染，等它收敛而不是只取一次快照
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              [...document.images].filter((img) => img.complete && img.naturalWidth === 0).length,
          ),
        { timeout: 10_000 },
      )
      .toBe(0);
    // 类别色块带分类标记，换主题也只用令牌
    await expect(
      hand.locator('[data-testid="card-art-fallback"][data-category="action"]').first(),
    ).toBeVisible();
  });
});
