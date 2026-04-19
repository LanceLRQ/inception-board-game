// 版权声明四重展示 E2E
// 对照：plans/tasks.md P2 B8.4 · 首屏/关于/教学前/结算 四处版权

import { test, expect, waitForAppReady } from './fixtures/index.js';

test.describe('版权展示 Copyright', () => {
  test('未 ack 时首次访问首屏弹出版权确认弹窗', async ({ browser }) => {
    // 开一个独立 context，绕过 fixture 预设的 ack
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');
    await waitForAppReady(page);

    // 弹窗应可见
    const ackBtn = page.getByRole('button', { name: /我已阅读并同意|I agree/ });
    await expect(ackBtn).toBeVisible({ timeout: 5_000 });

    // 点击后 localStorage 置为 1
    await ackBtn.click();
    const ack = await page.evaluate(() => localStorage.getItem('icgame-copyright-ack'));
    expect(ack).toBe('1');

    await context.close();
  });

  test('已 ack 时首屏不弹窗', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    const ackBtn = page.getByRole('button', { name: /我已阅读并同意|I agree/ });
    await expect(ackBtn).toBeHidden({ timeout: 2_000 });
  });

  test('/about 页显示完整版权声明', async ({ page }) => {
    await page.goto('/about');
    await waitForAppReady(page);

    await expect(page.getByRole('heading', { name: /关于|About/ })).toBeVisible();
    // full variant 版权必须包含"版权"或"Copyright"相关文案
    await expect(page.getByText(/版权|Copyright|版权声明/i).first()).toBeVisible();
  });

  test('/settings 页底部常驻版权 footer', async ({ page }) => {
    await page.goto('/settings');
    await waitForAppReady(page);
    await expect(page.getByText(/版权|Copyright|©|爱好者/i).first()).toBeVisible();
  });
});
