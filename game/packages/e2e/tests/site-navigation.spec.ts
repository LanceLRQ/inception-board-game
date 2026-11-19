import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/index.js';
import { API_BASE, ME, mockRoomSession, ROOM_CODE } from './fixtures/roomSession.js';

async function openNavigation(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await page.getByRole('button', { name: '菜单', exact: true }).click();
  }
  return page.getByRole('navigation', { name: '站点导航' });
}

test('首页进入设置，刷新并跨辅助页后仍可返回首页', async ({ page }) => {
  await page.goto('/');
  await (await openNavigation(page)).getByRole('link', { name: '设置', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: '设置', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: '返回首页', exact: true })).toBeVisible();
  await (await openNavigation(page)).getByRole('link', { name: '关于', exact: true }).click();
  await expect(page.getByRole('heading', { name: '关于', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '返回首页', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('未登录大厅可以访问辅助页并返回大厅', async ({ page }) => {
  await page.goto('/lobby');
  await (await openNavigation(page)).getByRole('link', { name: '关于', exact: true }).click();
  await (await openNavigation(page)).getByRole('link', { name: '设置', exact: true }).click();
  await page.getByRole('link', { name: '返回大厅', exact: true }).click();
  await expect(page).toHaveURL(/\/lobby$/);
  await expect(page.getByLabel('先给自己起个名字')).toBeVisible();
});

for (const path of ['/settings', '/about', '/players/missing']) {
  test(`直接访问 ${path} 有确定的返回大厅入口`, async ({ page }) => {
    await page.route(`${API_BASE}/players/missing/stats`, (route) =>
      route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: '不存在' } } }),
    );
    await page.goto(path);
    await page.getByRole('link', { name: '返回大厅', exact: true }).click();
    await expect(page).toHaveURL(/\/lobby$/);
  });
}

test('首页教程入口可发现，大厅进入教程关闭后回到大厅', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '新手教程', exact: true }).last().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/lobby');
  await (await openNavigation(page)).getByRole('link', { name: '新手教程', exact: true }).click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page).toHaveURL(/\/lobby$/);
});

test('手机菜单支持键盘、焦点约束、关闭返回焦点和当前页标识', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings');
  const trigger = page.getByRole('button', { name: '菜单', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '导航菜单' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: '设置', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    await expect
      .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)))
      .toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.press('Enter');
  await dialog.getByRole('link', { name: '关于', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/about$/);
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

test('已登录大厅导航可到自己的资料页', async ({ page }) => {
  await mockRoomSession(page);
  await page.route(`${API_BASE}/matchmake`, (r) => r.fulfill({ json: { status: 'idle' } }));
  await page.route(`${API_BASE}/identity/fingerprint`, (r) =>
    r.fulfill({ json: { registered: true } }),
  );
  await page.route(`${API_BASE}/rooms/public?*`, (r) =>
    r.fulfill({ json: { data: [], nextCursor: null } }),
  );
  await page.route(`${API_BASE}/players/${ME.playerId}/stats`, (r) =>
    r.fulfill({
      json: {
        player: { id: ME.playerId, nickname: ME.nickname, avatarSeed: '123' },
        stats: { total: 0, wins: 0, losses: 0, abandoned: 0, mvps: 0, winRate: 0 },
      },
    }),
  );
  await page.route(`${API_BASE}/players/me/matches`, (r) =>
    r.fulfill({ json: { data: [], nextCursor: null } }),
  );
  await page.goto('/lobby');
  await expect(page.getByTestId('lobby-nickname')).toHaveText(ME.nickname);
  await (await openNavigation(page)).getByRole('link', { name: '玩家资料', exact: true }).click();
  await expect(page.getByRole('heading', { name: ME.nickname })).toBeVisible();
  await page.getByRole('link', { name: '返回大厅', exact: true }).click();
  await expect(page).toHaveURL(/\/lobby$/);
});

test('房间、对局、单机和回放不挂公共导航', async ({ page }) => {
  await mockRoomSession(page);
  await page.goto(`/room/${ROOM_CODE}`);
  await expect(page.getByTestId('room-leave')).toBeVisible();
  await expect(page.getByRole('navigation', { name: '站点导航' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '菜单', exact: true })).toHaveCount(0);
  await page.goto('/game/debug');
  await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('navigation', { name: '站点导航' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '菜单', exact: true })).toHaveCount(0);
  await page.goto('/local');
  await expect(page.getByRole('heading', { name: '人机对战', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '站点导航' })).toHaveCount(0);
  await page.route(`${API_BASE}/replays/missing/download`, (r) =>
    r.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: '不存在' } } }),
  );
  await page.goto('/replay/missing');
  await expect(page.getByRole('heading', { name: '对局回放', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '站点导航' })).toHaveCount(0);
});
