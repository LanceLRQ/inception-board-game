// 路由导航 E2E
// 验证 8 条路由都能打开（不 404），且首屏不抛 pageerror

import { test, expect, waitForAppReady } from './fixtures/index.js';

const ROUTES: Array<{ path: string; expectText: RegExp | string }> = [
  { path: '/', expectText: '盗梦都市' },
  { path: '/local', expectText: /人机对战|Local Match/ },
  { path: '/lobby', expectText: /Lobby|好友房/ },
  { path: '/about', expectText: /关于|About/ },
  { path: '/settings', expectText: /设置|Settings/ },
  { path: '/tutorial', expectText: /教学|Tutorial|下一步|Next/ },
];

for (const route of ROUTES) {
  test(`路由 ${route.path} 可加载且包含关键文案`, async ({ page }) => {
    await page.goto(route.path);
    await waitForAppReady(page);
    await expect(page.getByText(route.expectText).first()).toBeVisible({ timeout: 5_000 });
  });
}

test.describe('参数化路由 — 不应 404，允许降级展示', () => {
  test('/room/:code 使用伪房间码可打开', async ({ page }) => {
    const res = await page.goto('/room/TESTROOM');
    expect(res?.status()).toBeLessThan(400);
    await waitForAppReady(page);
  });

  test('/game/:matchId 使用伪 matchId 可打开', async ({ page }) => {
    const res = await page.goto('/game/test-match-id');
    expect(res?.status()).toBeLessThan(400);
    await waitForAppReady(page);
  });

  test('/replay/:matchId 使用伪 matchId 可打开', async ({ page }) => {
    const res = await page.goto('/replay/test-match-id');
    expect(res?.status()).toBeLessThan(400);
    await waitForAppReady(page);
  });
});
