import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/index.js';
import { API_BASE, ME, ROOM_CODE, makeRoom, mockRoomSession } from './fixtures/roomSession.js';

const identity = {
  ...ME,
  token: 'real-jwt',
  expiresAt: 9999999999999,
  recoveryCode: 'ABCD-2345-EFGH',
  recoveryCodeWarning: '请保存恢复码',
};
async function newVisitor(page: Page) {
  await page.route(`${API_BASE}/identity/init`, (r) => r.fulfill({ json: identity }));
  await page.route(`${API_BASE}/identity/recover`, (r) => r.fulfill({ json: identity }));
  await page.route(`${API_BASE}/identity/me`, (r) =>
    r.fulfill({ json: { ...ME, avatarSeed: '123', locale: 'zh-CN' } }),
  );
  await page.route(`${API_BASE}/identity/fingerprint`, (r) =>
    r.fulfill({ json: { registered: true } }),
  );
  await page.route(`${API_BASE}/rooms/code/${ROOM_CODE}`, (r) => r.fulfill({ json: makeRoom() }));
  let joins = 0;
  await page.route(`${API_BASE}/rooms/${ROOM_CODE}/join`, (r) => {
    joins++;
    return r.fulfill({ json: { room: makeRoom() } });
  });
  return () => joins;
}

for (const entry of ['/invite/abc234', '/room/ABC234']) {
  test(`新访客 ${entry} 刷新仍保留邀请，确认恢复码后只入房一次`, async ({ page }) => {
    const joins = await newVisitor(page);
    await page.goto(entry);
    await expect(page).toHaveURL(/\/lobby\?invite=ABC234$/);
    await page.reload();
    await expect(page.getByRole('heading', { name: '加入房间 ABC234' })).toBeVisible();
    await page.locator('#lobby-nickname').fill('新访客');
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await expect(page.getByTestId('recovery-code-dialog')).toBeVisible();
    expect(joins()).toBe(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('recovery-code-dialog')).toBeVisible();
    await page.getByTestId('recovery-code-confirm').click();
    await expect(page.getByTestId('room-leave')).toBeVisible();
    await expect(page).toHaveURL(/\/room\/ABC234$/);
    expect(joins()).toBe(1);
  });
}

test('恢复失败保留输入与邀请，恢复成功确认新码后回原房间', async ({ page }) => {
  const joins = await newVisitor(page);
  let attempts = 0;
  await page.route(`${API_BASE}/identity/recover`, (r) =>
    r.fulfill(
      ++attempts === 1
        ? { status: 400, json: { error: { code: 'INVALID_RECOVERY_CODE', message: '无效恢复码' } } }
        : { json: identity },
    ),
  );
  await page.goto('/invite/ABC234');
  await page.getByTestId('lobby-restore-toggle').click();
  await page.getByTestId('lobby-restore-input').fill('2345-6789-ABCD');
  await page.getByTestId('lobby-restore-submit').click();
  await expect(page.getByTestId('lobby-restore-error')).toBeVisible();
  await expect(page.getByTestId('lobby-restore-input')).toHaveValue('2345-6789-ABCD');
  await expect(page).toHaveURL(/invite=ABC234$/);
  await page.getByTestId('lobby-restore-submit').click();
  await expect(page.getByTestId('recovery-code-dialog')).toBeVisible();
  expect(joins()).toBe(0);
  await page.getByTestId('recovery-code-confirm').click();
  await expect(page.getByTestId('room-leave')).toBeVisible();
  expect(joins()).toBe(1);
});

test('邀请建档网络失败保持昵称，不切换为模拟账号，恢复网络可继续', async ({ page }) => {
  await newVisitor(page);
  let down = true;
  await page.route(`${API_BASE}/identity/init`, (r) =>
    down ? r.abort() : r.fulfill({ json: identity }),
  );
  await page.goto('/invite/ABC234');
  await page.locator('#lobby-nickname').fill('保留昵称');
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('#lobby-nickname')).toHaveValue('保留昵称');
  expect(await page.evaluate(() => localStorage.getItem('icgame-mock-identity'))).toBeNull();
  down = false;
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect(page.getByTestId('recovery-code-dialog')).toBeVisible();
});

test('取消邀请后正常登录不再自动加入旧房间', async ({ page }) => {
  const joins = await newVisitor(page);
  await page.goto('/invite/ABC234');
  await page.getByRole('link', { name: '取消邀请', exact: true }).click();
  await expect(page).toHaveURL(/\/lobby$/);
  await page.locator('#lobby-nickname').fill('普通访客');
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByTestId('recovery-code-confirm').click();
  await expect(page.getByTestId('lobby-create')).toBeVisible();
  expect(joins()).toBe(0);
});

for (const [status, code, message] of [
  [404, 'NOT_FOUND', '房间不存在或已过期'],
  [409, 'ROOM_FULL', '房间已满'],
  [409, 'ROOM_STARTED', '游戏已开始'],
  [403, 'FORBIDDEN', '无法加入该房间'],
] as const) {
  test(`${code} 显示独立错误状态并能返回大厅`, async ({ page }) => {
    await mockRoomSession(page, () => makeRoom({ players: [] }));
    await page.route(`${API_BASE}/rooms/${ROOM_CODE}/join`, (r) =>
      r.fulfill({ status, json: { error: { code, message } } }),
    );
    await page.goto('/invite/ABC234');
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(page.getByText('加载中…', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('room-players')).toHaveCount(0);
    await page.getByRole('link', { name: '返回大厅', exact: true }).click();
    await expect(page).toHaveURL(/\/lobby$/);
  });
}

test('首次入房网络中断可重试，不接受同码本地模拟房间', async ({ page }) => {
  await mockRoomSession(page);
  await page.addInitScript(
    (room) => localStorage.setItem('icgame-mock-rooms', JSON.stringify({ ABC234: room })),
    makeRoom(),
  );
  let down = true;
  await page.route(`${API_BASE}/rooms/${ROOM_CODE}/join`, (r) =>
    down ? r.abort() : r.fulfill({ json: { room: makeRoom() } }),
  );
  await page.route(`${API_BASE}/rooms/code/${ROOM_CODE}`, (r) =>
    down ? r.abort() : r.fulfill({ json: makeRoom() }),
  );
  await page.goto('/invite/ABC234');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('room-players')).toHaveCount(0);
  down = false;
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByTestId('room-leave')).toBeVisible();
});

test('已登录身份验证网络失败可重试，不清除账号或邀请', async ({ page }) => {
  await mockRoomSession(page);
  let down = true;
  await page.route(`${API_BASE}/identity/me`, (r) =>
    down ? r.abort() : r.fulfill({ json: { ...ME, avatarSeed: '123', locale: 'zh-CN' } }),
  );
  await page.goto('/invite/ABC234');
  await expect(page.getByRole('alert')).toBeVisible();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('icgame-identity')!).state.playerId),
  ).toBe(ME.playerId);
  down = false;
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByTestId('room-leave')).toBeVisible();
});

test('非法邀请说明原因，可返回大厅重新输入', async ({ page }) => {
  await page.goto('/invite/bad');
  await expect(page.getByRole('alert')).toContainText('房间码');
  await page.getByRole('link', { name: '返回大厅', exact: true }).click();
  await expect(page).toHaveURL(/\/lobby$/);
});

test('邀请中的旧令牌被撤销后仍保留目标房间', async ({ page }) => {
  await mockRoomSession(page);
  await page.route(`${API_BASE}/identity/me`, (r) =>
    r.fulfill({
      status: 401,
      json: { error: { code: 'TOKEN_REVOKED', message: '账号已在别处恢复' } },
    }),
  );
  await page.goto('/invite/ABC234');
  await expect(page).toHaveURL(/\/lobby\?invite=ABC234$/);
  await expect(page.getByRole('heading', { name: '加入房间 ABC234' })).toBeVisible();
  await expect(page.locator('#lobby-nickname')).toBeVisible();
});

test('已加入房间刷新失败时保留成员列表，重试后移除错误', async ({ page }) => {
  await mockRoomSession(page);
  let down = true;
  await page.route(`${API_BASE}/rooms/code/${ROOM_CODE}`, (r) =>
    down
      ? r.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: '同步失败' } } })
      : r.fulfill({ json: makeRoom() }),
  );
  await page.goto('/room/ABC234');
  await expect(page.getByTestId('room-players')).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15000 });
  down = false;
  await page.getByRole('button', { name: '重试', exact: true }).click({ timeout: 1000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('room-leave')).toBeVisible();
});

test('身份页刷新时令牌已撤销仍保留邀请', async ({ page }) => {
  await mockRoomSession(page);
  await page.route(`${API_BASE}/identity/me`, (r) =>
    r.fulfill({
      status: 401,
      json: { error: { code: 'TOKEN_REVOKED', message: '账号已在别处恢复' } },
    }),
  );
  await page.goto('/lobby?invite=ABC234');
  await expect(page).toHaveURL(/\/lobby\?invite=ABC234$/);
  await expect(page.getByRole('heading', { name: '加入房间 ABC234' })).toBeVisible();
  await expect(page.locator('#lobby-nickname')).toBeVisible();
});
