// 移动端对局布局 E2E（窄屏 <1024px 才运行）：行动轴 + 层塔 + 一体式手牌坞 + 解封响应条
// 场景用调试路由的固定场景，状态确定、操作不推进状态。

import type { Page } from '@playwright/test';
import { test, expect, isNarrowViewport, waitForAppReady } from './fixtures/index.js';

test.beforeEach(({ page }) => {
  test.skip(!isNarrowViewport(page), '移动布局只在窄屏下运行');
});

async function openScene(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await waitForAppReady(page);
  await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('hand-dock')).toBeVisible();
}

/** 页面没有横向滚动 */
async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const [scrollWidth, clientWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

/** 等元素的位置稳定下来（手牌坞的展开 / 收起有过渡动画）后再取盒模型 */
async function settledBox(page: Page, testId: string) {
  const target = page.getByTestId(testId);
  let prev = await target.boundingBox();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(100);
    const next = await target.boundingBox();
    if (prev && next && prev.x === next.x && prev.y === next.y) return next;
    prev = next;
  }
  return prev;
}

/** 元素完整落在视口内 */
async function expectInViewport(page: Page, testId: string): Promise<void> {
  const box = await page.getByTestId(testId).boundingBox();
  const size = page.viewportSize()!;
  expect(box, `${testId} 应有布局盒`).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
}

test.describe('移动布局 · 盗梦者固定场景', () => {
  test('行动轴、层塔、手牌坞可见，页面不横向滚动', async ({ page }) => {
    await openScene(page, '/game/debug');
    await expect(page.getByTestId('turn-order-rail')).toBeVisible();
    await expect(page.getByTestId('layer-tower')).toBeVisible();
    await expect(page.getByTestId('turn-indicator')).toBeVisible();
    await expect(page.getByTestId('copyright-line')).toBeVisible();
    // 对局内不弹解封响应弹窗，也不渲染桌面布局
    await expect(page.getByTestId('unlock-response-dialog')).toHaveCount(0);
    await expect(page.getByTestId('local-runtime')).toHaveAttribute('data-layout', 'mobile');
    await expectNoHorizontalScroll(page);
  });

  test('层塔从第 4 层到迷失层，点层级标签切换焦点层', async ({ page }) => {
    await openScene(page, '/game/debug');
    const rows = page.locator('[data-testid^="layer-row-"]');
    await expect(rows).toHaveCount(5);
    await expect(rows.first()).toHaveAttribute('data-testid', 'layer-row-4');
    await expect(rows.last()).toHaveAttribute('data-testid', 'layer-row-0');

    await page.getByTestId('layer-chip-4').click();
    await expect(page.getByTestId('layer-row-4')).toHaveAttribute('data-focus', 'true');
    await expect(page.getByTestId('layer-chip-4')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('layer-chip-1').click();
    await expect(page.getByTestId('layer-row-1')).toHaveAttribute('data-focus', 'true');
    await expect(page.getByTestId('layer-row-4')).not.toHaveAttribute('data-focus', 'true');
  });

  test('点一张牌：手牌坞展开并在信息条里显示卡名；再点把手收起', async ({ page }) => {
    await openScene(page, '/game/debug');
    const dock = page.getByTestId('hand-dock');
    await expect(dock).toHaveAttribute('data-open', 'false');

    const card = page.getByTestId('card-0');
    const title = await card.getAttribute('title');
    await card.click();

    await expect(dock).toHaveAttribute('data-open', 'true');
    await expect(page.getByTestId('hand-info-name')).toHaveText(title!);
    // 展开后层塔只保留焦点层
    await expect(page.locator('[data-testid^="layer-row-"]')).toHaveCount(1);

    await page.getByTestId('dock-grip').click();
    await expect(dock).toHaveAttribute('data-open', 'false');
    await expect(page.locator('[data-testid^="layer-row-"]')).toHaveCount(5);
    await expectNoHorizontalScroll(page);
  });

  test('在把手上向上拖展开，向下拖收起', async ({ page }) => {
    await openScene(page, '/game/debug');
    const dock = page.getByTestId('hand-dock');
    const grip = await settledBox(page, 'dock-grip');
    const x = grip!.x + grip!.width / 2;
    const y = grip!.y + grip!.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 30, { steps: 4 });
    await page.mouse.move(x, y - 90, { steps: 6 });
    await page.mouse.up();
    await expect(dock).toHaveAttribute('data-open', 'true');

    const grip2 = await settledBox(page, 'dock-grip');
    const x2 = grip2!.x + grip2!.width / 2;
    const y2 = grip2!.y + grip2!.height / 2;
    await page.mouse.move(x2, y2);
    await page.mouse.down();
    await page.mouse.move(x2, y2 + 30, { steps: 4 });
    await page.mouse.move(x2, y2 + 90, { steps: 6 });
    await page.mouse.up();
    await expect(dock).toHaveAttribute('data-open', 'false');
  });

  test('两步出牌：选中 SHOOT 后点「打出」才弹出选目标弹窗', async ({ page }) => {
    await openScene(page, '/game/debug');
    const shoot = page.locator('[data-testid^="card-"][title="SHOOT"]').first();
    await shoot.click();
    // 只是选中，还没进入出牌流程
    await expect(page.getByTestId('target-player-picker-dialog')).toHaveCount(0);
    await expect(page.getByTestId('hand-commit-play')).toBeVisible();

    await page.getByTestId('hand-commit-play').click();
    await expect(page.getByTestId('target-player-picker-dialog')).toBeVisible();
  });

  test('触控目标尺寸：行动轴头像 ≥44px，主操作按钮高度 ≥42px', async ({ page }) => {
    await openScene(page, '/game/debug');
    const avatar = await page.locator('[data-testid^="player-avatar-"]').first().boundingBox();
    expect(avatar!.width).toBeGreaterThanOrEqual(44);
    expect(avatar!.height).toBeGreaterThanOrEqual(44);
    const main = await page.getByTestId('action-end').boundingBox();
    expect(main!.height).toBeGreaterThanOrEqual(42);
  });
});

test.describe('移动布局 · 梦主固定场景', () => {
  test('梦主视角能看到未翻开的梦魇与金库内容，页面可用', async ({ page }) => {
    await openScene(page, '/game/debug?as=master');
    await expect(page.getByTestId('nightmare-tag').first()).toBeVisible();
    await expect(page.getByTestId('turn-indicator')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe('移动布局 · 解封响应条', () => {
  test('pending=1：响应条与两个按钮可见，且没有弹出解封弹窗', async ({ page }) => {
    await openScene(page, '/game/debug?pending=1');
    await expect(page.getByTestId('unlock-response-bar')).toBeVisible();
    await expect(page.getByTestId('unlock-response-cancel')).toBeVisible();
    await expect(page.getByTestId('unlock-response-pass')).toBeVisible();
    await expect(page.getByTestId('unlock-response-dialog')).toHaveCount(0);

    for (const id of ['unlock-response-cancel', 'unlock-response-pass']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(42);
    }
    // 不是本人回合：主操作显示「等待」且禁用
    await expect(page.getByTestId('action-wait')).toBeDisabled();
    await expectNoHorizontalScroll(page);
  });
});

test.describe('移动布局 · 小屏 320×568', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  for (const url of ['/game/debug', '/game/debug?pending=1', '/game/debug?as=master']) {
    test(`${url} 无横向溢出，主操作按钮在视口内且可点`, async ({ page }) => {
      await openScene(page, url);
      await expectNoHorizontalScroll(page);
      const main = page.locator('[data-testid^="action-"]').first();
      await expect(main).toBeVisible();
      const box = await main.boundingBox();
      const size = page.viewportSize()!;
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);

      // 展开手牌坞后主操作仍在视口内
      await page.getByTestId('dock-grip').click();
      await expect(page.getByTestId('hand-dock')).toHaveAttribute('data-open', 'true');
      await expectNoHorizontalScroll(page);
      await expect(main).toBeVisible();
      const open = await main.boundingBox();
      expect(open!.y + open!.height).toBeLessThanOrEqual(size.height);
    });
  }

  test('响应条的两个按钮完整落在视口内', async ({ page }) => {
    await openScene(page, '/game/debug?pending=1');
    await expectInViewport(page, 'unlock-response-cancel');
    await expectInViewport(page, 'unlock-response-pass');
  });
});
