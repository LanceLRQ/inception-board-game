// 联机对局：页面切到后台再回到前台时，客户端向服务端要一份最新状态（手机切走时页面可能被冻结、漏掉推送）
//
// 服务端是全内存的开发服务（见 playwright.online.config.ts）。一名真人加 3 个 Bot，进了对局就验证。

import { test, expect } from '@playwright/test';

test('页面从后台回到前台：发出一次 icg:sync，界面照常', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    try {
      localStorage.setItem('icgame-copyright-ack', '1');
    } catch {
      /* 存储不可用时忽略 */
    }
  });
  const page = await context.newPage();
  const sent: string[] = [];
  page.on('websocket', (ws) => {
    ws.on('framesent', (frame) => {
      if (typeof frame.payload === 'string') sent.push(frame.payload);
    });
  });
  try {
    await page.goto('/lobby');
    await page.locator('#lobby-nickname').fill('后台');
    await page.getByRole('button', { name: /继续|Continue/ }).click();
    await page.getByTestId('recovery-code-confirm').click();
    await page.locator('#lobby-maxPlayers').selectOption('4');
    await page.getByTestId('lobby-create').click();
    await expect(page).toHaveURL(/\/room\/[A-Z0-9]{6}/);
    await page.getByTestId('room-fill-ai').click();
    await page.getByTestId('room-start').click();
    await expect(page).toHaveURL(/\/game\//, { timeout: 15_000 });
    await expect(page.getByTestId('turn-indicator')).toBeVisible({ timeout: 20_000 });

    const syncs = () => sent.filter((f) => f.includes('"icg:sync"')).length;
    const before = syncs();
    const setVisibility = (state: 'hidden' | 'visible') =>
      page.evaluate((s) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
        document.dispatchEvent(new Event('visibilitychange'));
      }, state);
    await setVisibility('hidden');
    await page.waitForTimeout(50);
    await setVisibility('visible');

    await expect.poll(syncs, { timeout: 5_000 }).toBe(before + 1);
    await expect(page.getByTestId('turn-indicator')).toBeVisible();
  } finally {
    await context.close();
  }
});
