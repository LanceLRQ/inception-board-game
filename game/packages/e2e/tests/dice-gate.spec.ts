// 掷骰闸门 E2E：引擎在掷骰前停下等被点名的人报到；被点名的人看到「掷骰」按钮，其他人看到等待进度。
// 固定场景 ?pending=dice（对方对本人打出 SHOOT）与 ?pending=dice-wait（港口·海啸，本人已掷、等其他人）；
// 掷完的点数由动画层播放（固定场景 ?fx=1 的示例事件里有一次掷骰）。

import { test, expect, waitForAppReady } from './fixtures/index.js';

test.describe('掷骰闸门', () => {
  test('被点名：显示用途、对阵双方与「掷骰」按钮；点下后按钮不再可点', async ({ page }) => {
    await page.goto('/game/debug?pending=dice');
    await waitForAppReady(page);
    const gate = page.getByTestId('dice-gate');
    await expect(gate).toBeVisible({ timeout: 10_000 });
    await expect(gate).toHaveAttribute('data-can-roll', 'true');
    await expect(gate).toContainText(/SHOOT/);
    const roll = page.getByTestId('dice-roll-button');
    await expect(roll).toBeEnabled();
    // 命中区不小于 44×44（触控设备）或视觉上至少 40 像素高
    const box = (await roll.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(40);
    await roll.click();
    // 固定场景不推进状态：已发出就不能重复点
    await expect(roll).toBeDisabled();
  });

  test('多人掷骰：本人已掷，显示「正在等待其他玩家 x/n」与名单，已掷的打勾，没有掷骰按钮', async ({
    page,
  }) => {
    await page.goto('/game/debug?pending=dice-wait');
    await waitForAppReady(page);
    const gate = page.getByTestId('dice-gate');
    await expect(gate).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('dice-roll-button')).toHaveCount(0);
    await expect(page.getByTestId('dice-gate-waiting')).toContainText(/1\/\d|1 ?\/ ?\d/);
    const rollers = page.getByTestId('dice-gate-rollers').locator('li');
    expect(await rollers.count()).toBeGreaterThan(1);
    await expect(rollers.and(page.locator('[data-rolled]'))).toHaveCount(1);
  });

  test('掷骰结果：示例事件里的掷骰播出立体骰子与点数说明', async ({ page }) => {
    await page.goto('/game/debug?fx=1');
    await waitForAppReady(page);
    await expect(page.locator('[data-testid="match-fx"][data-cue="dice"]')).toBeAttached({
      timeout: 30_000,
    });
    await expect(page.getByTestId('fx-dice')).toBeVisible();
    await expect(page.getByTestId('fx-caption')).toContainText(/4/);
  });
});
