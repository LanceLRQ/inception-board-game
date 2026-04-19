// 人机局"再来一局"流程 E2E
// 对照：plans/tasks.md P2 B18

import { test, expect, waitForAppReady } from './fixtures/index.js';

test.describe('LocalMatch 重开局', () => {
  test('首次进入显示选人数界面', async ({ page }) => {
    await page.goto('/local');
    await waitForAppReady(page);

    await expect(page.getByRole('button', { name: /开始游戏|Start/ })).toBeVisible();
  });

  test('开始后刷新页面仍能回到初始选择（Worker 不残留）', async ({ page }) => {
    await page.goto('/local');
    await waitForAppReady(page);
    await page.getByRole('button', { name: /开始游戏|Start/ }).click();

    // 等入局
    await expect(page.getByText(/回合\s*\d+/)).toBeVisible({ timeout: 10_000 });

    // 刷新
    await page.reload();
    await waitForAppReady(page);

    // 刷新后应回到选择界面
    await expect(page.getByRole('button', { name: /开始游戏|Start/ })).toBeVisible({
      timeout: 5_000,
    });
  });
});
