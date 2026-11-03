import { test, expect, waitForAssetsReady } from './fixtures/index.js';

test.describe('桌面牌桌 · demo 布局', () => {
  for (const [width, height] of [
    [1024, 768],
    [1440, 900],
    [1920, 1080],
  ]) {
    test(`${width}×${height} 中央牌桌与手牌上下排列、侧栏贯穿`, async ({ page }) => {
      await page.setViewportSize({ width: width!, height: height! });
      await page.goto('/game/debug?tabletop=normal');
      await waitForAssetsReady(page);
      await expect(page.getByTestId('local-runtime')).toHaveAttribute('data-layout', 'desktop');
      const board = (await page.getByTestId('center-stage').boundingBox())!;
      const hand = (await page.getByTestId('hand-dock').boundingBox())!;
      expect(hand.x).toBe(board.x);
      expect(hand.width).toBe(board.width);
      expect(hand.y).toBeGreaterThanOrEqual(board.y + board.height);
      await expect(page.locator('.tabletop-player')).toHaveCount(6);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width!,
      );
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
        height!,
      );
    });
  }
  test('选牌、明确确认与取消保留选择', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/game/debug?tabletop=normal');
    await waitForAssetsReady(page);
    await expect(page.getByTestId('hand-commit-play')).toHaveCount(0);
    await page.getByTestId('card-0').click();
    await page.getByTestId('hand-commit-play').click();
    const confirm = page.getByTestId('target-player-confirm');
    await expect(confirm).toBeDisabled();
    await page.locator('.tabletop-target-option:enabled').first().click();
    await expect(confirm).toBeEnabled();
    await expect(page.locator('.tabletop-hand-card')).toHaveCount(5);
    await page.getByTestId('target-player-cancel').click();
    await expect(page.getByTestId('card-0')).toHaveAttribute('data-reading', 'true');
  });
  test('未知金库只翻到卡背，原卡全文可读', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/game/debug?tabletop=normal');
    await waitForAssetsReady(page);
    await page.getByTestId('layer-focus-1').click();
    await expect(page.getByTestId('layer-row-1')).toHaveAttribute('data-flipped', 'true');
    await page.getByRole('button', { name: '第 1 层说明', exact: true }).click();
    await expect(page.getByTestId('card-detail-flip')).toHaveCount(0);
    await page.getByTestId('card-detail-close').click();
    await page.getByTestId('card-0').click();
    await page.getByRole('button', { name: '查看解析', exact: true }).click();
    await expect(page.locator('.tabletop-detail-copy')).toContainText('使用目标');
    await expect(page.locator('.tabletop-detail-copy')).toContainText(
      '移动到相邻的另一层梦境的效果不会让玩家进入迷失层',
    );
  });
  test('十人玩家列表可以内部滚动，梦主与本人均列出', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/game/debug?players=10&as=master');
    await waitForAssetsReady(page);
    await expect(page.locator('.tabletop-player')).toHaveCount(10);
    await expect(page.locator('.tabletop-player[data-self=true]')).toHaveCount(1);
    const list = page.locator('.tabletop-player-list');
    expect(await list.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
    await page.locator('.tabletop-player').last().scrollIntoViewIfNeeded();
    await expect(page.locator('.tabletop-player').last()).toBeInViewport();
  });
});
