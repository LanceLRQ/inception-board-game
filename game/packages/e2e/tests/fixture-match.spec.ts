// 固定场景对局 E2E：调试路由（/game/:matchId 不带 online / friend）渲染的是真实对局界面，
// 状态来自确定的固定场景。三个调试入口各打开一次。

import {
  test,
  expect,
  isNarrowViewport,
  selectAndPlayCard,
  waitForAppReady,
} from './fixtures/index.js';

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

test('固定场景 pending=1 出现解封响应入口，缺省场景没有（宽屏响应窗口，窄屏响应条，都不弹窗）', async ({
  page,
}) => {
  // 宽屏用舞台右上角的响应窗口承载，窄屏用手牌坞上方的响应条；两种布局都不再弹窗
  const narrow = isNarrowViewport(page);
  const dialog = page.getByTestId('unlock-response-dialog');
  const inline = page.getByTestId(narrow ? 'unlock-response-bar' : 'unlock-response-window');

  await page.goto('/game/debug');
  await waitForAppReady(page);
  await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
  await expect(dialog).toHaveCount(0);
  await expect(inline).toHaveCount(0);

  await page.goto('/game/debug?pending=1');
  await waitForAppReady(page);
  await expect(inline).toBeVisible({ timeout: 10_000 });
  await expect(dialog).toHaveCount(0);
});

test('固定场景：选一张需要目标的牌并打出（两步出牌），两种布局都会弹出选目标弹窗', async ({
  page,
}) => {
  await page.goto('/game/debug');
  await waitForAppReady(page);
  await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });

  // SHOOT 需要选目标玩家；按牌名找到它在手牌里的位置
  const shoot = page
    .getByTestId('human-hand')
    .locator('[data-testid^="card-"][title="SHOOT"]')
    .first();
  const testId = await shoot.getAttribute('data-testid');
  const index = Number(testId?.replace('card-', ''));
  expect(Number.isInteger(index)).toBe(true);

  await selectAndPlayCard(page, index);
  await expect(page.getByTestId('target-player-picker-dialog')).toBeVisible({ timeout: 5_000 });
});
