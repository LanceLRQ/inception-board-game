// 教学剧本 E2E
// 对照：plans/tasks.md P2 B16 · 新手教学关卡
// 验证 8 步基础教学能启动、能前进、能跳过

import { test, expect, waitForAppReady } from './fixtures/index.js';

test.describe('教学 Tutorial', () => {
  test('/tutorial 打开显示步骤与下一步按钮', async ({ page }) => {
    // 清除教学进度以保证从头开始
    await page.addInitScript(() => {
      try {
        localStorage.removeItem('icgame-tutorial-progress');
      } catch {
        /* ignore */
      }
    });

    await page.goto('/tutorial');
    await waitForAppReady(page);

    await expect(page.getByRole('button', { name: /下一步|继续|Next|Continue/ })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByRole('button', { name: /跳过教学|Skip/ })).toBeVisible();
  });

  test('点击下一步按钮能推进到下一步', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.removeItem('icgame-tutorial-progress');
      } catch {
        /* ignore */
      }
    });

    await page.goto('/tutorial');
    await waitForAppReady(page);

    // 记录第一步的文本指纹
    const bubble = page.locator('[role="dialog"], [aria-live], .tutorial-step, main').first();
    const firstText = await bubble.innerText().catch(() => '');

    await page.getByRole('button', { name: /下一步|继续|Next|Continue/ }).click();
    await page.waitForTimeout(200);

    const secondText = await bubble.innerText().catch(() => '');
    expect(secondText).not.toBe(firstText);
  });

  test('跳过教学按钮将状态标记为完成并跳转或显示完成界面', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.removeItem('icgame-tutorial-progress');
      } catch {
        /* ignore */
      }
    });

    await page.goto('/tutorial');
    await waitForAppReady(page);

    await page.getByRole('button', { name: /跳过教学|Skip/ }).click();
    await page.waitForTimeout(300);

    // 要么跳到首页，要么显示完成界面
    const isHome = page.url().endsWith('/') || page.url().includes('/?');
    const hasCompleted = await page
      .getByText(/教学完成|Tutorial Complete/)
      .isVisible()
      .catch(() => false);

    expect(isHome || hasCompleted).toBe(true);
  });
});
