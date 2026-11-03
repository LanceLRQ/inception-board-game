import { test, expect, waitForAppReady, waitForAssetsReady } from './fixtures/index.js';

test.describe('手机牌桌 · iPhone 12/13 基线', () => {
  test.use({ viewport: { width: 390, height: 664 } });
  test('完整层条、教程与手牌同屏，选牌后才显示操作', async ({ page }) => {
    await page.goto('/game/debug?tabletop=normal');
    await waitForAppReady(page);
    await waitForAssetsReady(page);
    await expect(page.getByTestId('local-runtime')).toHaveAttribute('data-layout', 'mobile');
    await expect(page.getByTestId('turn-order-rail')).toHaveCount(0);
    await expect(page.getByTestId('dock-grip')).toHaveCount(0);
    await expect(page.locator('.tabletop-layer')).toHaveCount(4);
    await expect(page.locator('.tabletop-layer').first()).toHaveAttribute('data-layer', '1');
    await expect(page.getByRole('button', { name: '游戏教程说明书' })).toBeVisible();
    await expect(page.getByTestId('hand-commit-play')).toHaveCount(0);
    await page.getByTestId('card-0').click();
    await expect(page.getByTestId('hand-commit-play')).toBeVisible();
    await page.getByTestId('card-0').click();
    await expect(page.getByTestId('hand-commit-play')).toHaveCount(0);
    for (const selector of [
      '.tabletop-occupant',
      '.tabletop-layer-info',
      '.tabletop-layer-status button',
    ]) {
      const box = (await page.locator(selector).first().boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });
  test('七张弃牌独立选择，操作留在视口内', async ({ page }) => {
    await page.goto('/game/debug?tabletop=discard');
    await waitForAssetsReady(page);
    await page.getByTestId('card-0').click();
    await expect(page.getByTestId('action-confirm-discard')).toBeDisabled();
    await page.getByTestId('card-5').click();
    await expect(page.getByTestId('action-confirm-discard')).toBeEnabled();
    const box = (await page.getByTestId('action-confirm-discard').boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(664);
  });
  test('层数说明、未知金库与迷失层保持可读', async ({ page }) => {
    await page.goto('/game/debug?tabletop=normal');
    await waitForAssetsReady(page);
    await page.getByRole('button', { name: '第 1 层说明', exact: true }).click();
    await expect(page.getByTestId('card-detail-modal')).toBeVisible();
    await page.getByTestId('card-detail-close').click();
    await page.getByTestId('layer-focus-1').click();
    await expect(page.getByTestId('card-detail-flip')).toHaveCount(0);
    await page.goto('/game/debug?dead=1');
    await waitForAssetsReady(page);
    await expect(page.getByTestId('layer-row-0')).toBeVisible();
    await expect(page.getByRole('button', { name: '复活', exact: true })).toBeVisible();
  });
  test('应答条保留操作，终局按需查看结算', async ({ page }) => {
    await page.goto('/game/debug?pending=1');
    await waitForAssetsReady(page);
    await expect(page.getByTestId('unlock-response-bar')).toBeVisible();
    await expect(page.getByTestId('unlock-response-cancel')).toBeVisible();
    await expect(page.getByTestId('unlock-response-pass')).toBeVisible();
    await page.goto('/game/debug?tabletop=outcome');
    await waitForAssetsReady(page);
    await expect(page.getByTestId('winner-banner')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: '查看结算' }).click();
    await expect(page.getByTestId('restart-button')).toBeVisible();
  });
});
