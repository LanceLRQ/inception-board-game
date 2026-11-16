import { test, expect } from './fixtures/index.js';
import { API_BASE, mockRoomSession } from './fixtures/roomSession.js';

test('手机首屏可用房间码加入，键盘回车也能提交', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockRoomSession(page);
  await page.route(`${API_BASE}/matchmake`, (route) => route.fulfill({ json: { status: 'idle' } }));
  await page.goto('/lobby');
  const code = page.locator('#lobby-joinCode');
  await expect(code).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId('lobby-join')).toBeInViewport({ ratio: 1 });
  await code.fill('abc234');
  await code.press('Enter');
  await expect(page.getByTestId('room-leave')).toBeVisible();
});

test('匹配排队时禁用加入和建房，取消后恢复', async ({ page }) => {
  await mockRoomSession(page);
  await page.route(`${API_BASE}/matchmake*`, (route) =>
    route.fulfill({
      json:
        route.request().method() === 'DELETE'
          ? { status: 'idle' }
          : { status: 'queued', playerCount: 4, ticketId: 1 },
    }),
  );
  await page.goto('/lobby');
  await page.locator('#lobby-joinCode').fill('ABC234');
  const cancel = page.getByRole('button', { name: /取消匹配|Cancel Search/ });
  await expect(cancel).toBeVisible();
  await expect(page.getByTestId('lobby-join')).toBeDisabled();
  await expect(page.getByTestId('lobby-create')).toBeDisabled();
  await cancel.click();
  await expect(page.getByTestId('lobby-join')).toBeEnabled();
  await expect(page.getByTestId('lobby-create')).toBeEnabled();
});
