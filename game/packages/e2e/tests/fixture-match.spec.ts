// 固定场景对局 E2E：调试路由（/game/:matchId 不带 online / friend）渲染的是真实对局界面，
// 状态来自确定的固定场景。三个调试入口各打开一次。

import { test, expect, waitForAppReady } from './fixtures/index.js';

const SCENES: Array<{ name: string; url: string }> = [
  { name: '缺省（盗梦者视角）', url: '/game/debug' },
  { name: '梦主视角', url: '/game/debug?as=master' },
  { name: '带待应答的解封响应窗口', url: '/game/debug?pending=1' },
];

for (const scene of SCENES) {
  test(`固定场景 ${scene.name} 渲染对局舞台且无页面错误`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(scene.url);
    await waitForAppReady(page);

    await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('turn-indicator')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
}

test('固定场景 pending=1 弹出解封响应窗口，缺省场景没有', async ({ page }) => {
  await page.goto('/game/debug');
  await waitForAppReady(page);
  await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('unlock-response-dialog')).toHaveCount(0);

  await page.goto('/game/debug?pending=1');
  await waitForAppReady(page);
  await expect(page.getByTestId('unlock-response-dialog')).toBeVisible({ timeout: 10_000 });
});
