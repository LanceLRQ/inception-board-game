import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/index.js';
import { readSavedMeta, seedSave, validMeta } from './fixtures/localSave.js';

async function readTutorial(page: Page) {
  await page.goto('/tutorial');
  for (let step = 1; step < 8; step++) {
    await expect(page.getByText(`第 ${step} / 8 步`, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '继续', exact: true }).click();
  }
  await expect(page.getByRole('button', { name: /角色图鉴/ })).toHaveCount(0);
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.getByRole('heading', { name: '已读完基础介绍' })).toBeVisible();
}

test('前进、回看、刷新和关闭保留正确的阅读位置', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '新手教程', exact: true }).last().click();
  await expect(page.getByRole('button', { name: '上一步', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect(page.getByRole('heading', { name: '两大阵营' })).toBeVisible();
  await page.getByRole('button', { name: '上一步', exact: true }).click();
  await expect(page.getByRole('heading', { name: '欢迎来到盗梦都市' })).toBeVisible();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.reload();
  await expect(page.getByText('第 2 / 8 步', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('link', { name: '新手教程', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: '两大阵营' })).toBeVisible();
});

for (const fromHome of [true, false]) {
  test(`跳过返回${fromHome ? '首页' : '大厅'}，不显示完成且可以继续阅读`, async ({ page }) => {
    await page.goto(fromHome ? '/' : '/lobby');
    if (!fromHome) {
      if ((page.viewportSize()?.width ?? 1280) < 768)
        await page.getByRole('button', { name: '菜单', exact: true }).click();
      await page
        .getByRole('navigation', { name: '站点导航' })
        .getByRole('link', { name: '新手教程', exact: true })
        .click();
    }
    if (fromHome) await page.getByRole('link', { name: '新手教程', exact: true }).last().click();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('button', { name: '跳过教学', exact: true }).click();
    await expect(page).toHaveURL(fromHome ? /\/$/ : /\/lobby$/);
    const progress = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('ico:tutorial:progress')!),
    );
    expect(progress.completedAt).toBeNull();
    expect(progress.currentStepIndex).toBe(1);
    await page.goto('/tutorial');
    await expect(page.getByRole('heading', { name: '两大阵营' })).toBeVisible();
    for (let step = 2; step < 8; step++)
      await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('heading', { name: '已读完基础介绍' })).toBeVisible();
  });
}

test('完成后可返回、重新阅读，进入大厅不会自动加入房间', async ({ page }) => {
  await readTutorial(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: '已读完基础介绍' })).toBeVisible();
  await page.getByRole('link', { name: '进入大厅', exact: true }).click();
  await expect(page).toHaveURL(/\/lobby$/);
  await page.goto('/tutorial');
  await page.getByRole('button', { name: '重新阅读', exact: true }).click();
  await expect(page.getByText('第 1 / 8 步', { exact: true })).toBeVisible();
  await readTutorial(page);
  await page.getByRole('link', { name: '进入大厅', exact: true }).click();
  await expect(page).toHaveURL(/\/lobby$/);
  await expect(page.getByLabel('先给自己起个名字')).toBeVisible();
});

test('单机练习进入人数选择，不自动开局', async ({ page }) => {
  await readTutorial(page);
  await page.getByRole('link', { name: '单机练习', exact: true }).click();
  await expect(page).toHaveURL(/\/local$/);
  await expect(page.getByRole('button', { name: '开始游戏', exact: true })).toBeVisible();
  await expect(page.getByTestId('local-runtime')).toHaveCount(0);
});

test('单机练习保留原存档和继续／新局选择', async ({ page }) => {
  await readTutorial(page);
  const meta = validMeta({ turn: 3, stateID: 7 });
  await seedSave(page, meta);
  await page.getByRole('link', { name: '单机练习', exact: true }).click();
  await expect(page.getByTestId('local-resume-prompt')).toBeVisible();
  await expect(page.getByTestId('local-resume-continue')).toBeVisible();
  await expect(page.getByTestId('local-resume-new')).toBeVisible();
  expect(await readSavedMeta(page)).toEqual({ turn: 3, stateID: 7 });
});

test('旧版跳过产生的完成记录不再误报已读完', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'ico:tutorial:progress',
      JSON.stringify({
        scenarioId: 'basics',
        currentStepIndex: 8,
        completedStepIds: ['welcome'],
        completedAt: 100,
        skippedCount: 1,
        startedAt: 1,
      }),
    ),
  );
  await page.goto('/tutorial');
  await expect(page.getByRole('heading', { name: '欢迎来到盗梦都市' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '已读完基础介绍' })).toHaveCount(0);
});

test('窄屏长内容可滚动，操作保持可见且键盘可用', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 360 });
  await page.goto('/tutorial');
  for (let step = 1; step < 4; step++)
    await page.getByRole('button', { name: '继续', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const region = page.getByRole('region', { name: '回合结构' });
  await region.focus();
  await page.keyboard.press('End');
  await expect.poll(() => region.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const next = page.getByRole('button', { name: '继续', exact: true });
  const box = await next.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(360);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '行动牌' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('首页进入并完成后仍可返回首页', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '新手教程', exact: true }).last().click();
  for (let step = 1; step < 8; step++)
    await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.getByRole('link', { name: '返回首页', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});
