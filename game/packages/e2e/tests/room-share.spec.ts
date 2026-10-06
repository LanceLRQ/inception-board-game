// 房间码分享：复制房间码与邀请链接、剪贴板被拒时回落到选中、系统分享、二维码
//
// 用拦截后端接口的方式驱动房间页（见 fixtures/roomSession.ts），不依赖真实后端。

import { test, expect, waitForAppReady } from './fixtures/index.js';
import { ROOM_CODE, mockRoomSession } from './fixtures/roomSession.js';

test.describe('房间码分享', () => {
  test.beforeEach(async ({ page }) => {
    await mockRoomSession(page);
  });

  test('显示房间码与邀请链接；邀请链接指向站点的 /invite/房间码', async ({ page, baseURL }) => {
    await page.goto(`/room/${ROOM_CODE}`);
    await waitForAppReady(page);
    await expect(page.getByTestId('room-share')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('room-copy')).toContainText(ROOM_CODE);
    await expect(page.getByTestId('room-share-link')).toHaveValue(`${baseURL}/invite/${ROOM_CODE}`);
  });

  test('一键复制：房间码与链接都进剪贴板，并给出提示', async ({ page, context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`/room/${ROOM_CODE}`);
    await waitForAppReady(page);
    await expect(page.getByTestId('room-share')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('room-copy').click();
    await expect(page.getByTestId('room-share-feedback')).toHaveText('已复制');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(ROOM_CODE);

    await page.getByTestId('room-copy-link').click();
    await expect(page.getByTestId('room-share-feedback')).toHaveText('链接已复制');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `${baseURL}/invite/${ROOM_CODE}`,
    );
  });

  test('剪贴板被拒绝：链接被选中，提示手动复制', async ({ page, baseURL }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.reject(new Error('denied')) },
        configurable: true,
      });
      // 回落路径里的 execCommand 也不可用，只留下选中状态
      document.execCommand = () => false;
    });
    await page.goto(`/room/${ROOM_CODE}`);
    await waitForAppReady(page);
    await expect(page.getByTestId('room-share')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('room-copy-link').click();
    await expect(page.getByTestId('room-share-feedback')).toContainText('已选中');
    const selected = await page.evaluate(() => {
      const el = document.querySelector<HTMLInputElement>('[data-testid="room-share-link"]')!;
      return el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0);
    });
    expect(selected).toBe(`${baseURL}/invite/${ROOM_CODE}`);
  });

  test('支持系统分享时显示「分享」按钮并带上链接；取消分享不报错', async ({ page, baseURL }) => {
    await page.addInitScript(() => {
      (window as unknown as { __shares: unknown[] }).__shares = [];
      Object.defineProperty(navigator, 'share', {
        value: (data: unknown) => {
          (window as unknown as { __shares: unknown[] }).__shares.push(data);
          return (window as unknown as { __shares: unknown[] }).__shares.length === 1
            ? Promise.resolve()
            : Promise.reject(new DOMException('cancelled', 'AbortError'));
        },
        configurable: true,
      });
    });
    await page.goto(`/room/${ROOM_CODE}`);
    await waitForAppReady(page);
    await expect(page.getByTestId('room-native-share')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('room-native-share').click();
    await page.getByTestId('room-native-share').click();
    const shares = await page.evaluate(
      () => (window as unknown as { __shares: Array<{ url: string; text: string }> }).__shares,
    );
    expect(shares).toHaveLength(2);
    expect(shares[0]!.url).toBe(`${baseURL}/invite/${ROOM_CODE}`);
    expect(shares[0]!.text).toContain(ROOM_CODE);
    // 取消后没有退回复制，也没有错误提示
    await expect(page.getByTestId('room-share-feedback')).toHaveText('');
  });

  test('不支持系统分享时不显示「分享」按钮', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    });
    await page.goto(`/room/${ROOM_CODE}`);
    await waitForAppReady(page);
    await expect(page.getByTestId('room-share')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('room-native-share')).toHaveCount(0);
  });

  test('二维码：展开后是深色码点 + 浅色底的 SVG，再点收起', async ({ page }) => {
    await page.goto(`/room/${ROOM_CODE}`);
    await waitForAppReady(page);
    const toggle = page.getByTestId('room-qr-toggle');
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('room-qr')).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const qr = page.getByTestId('room-qr');
    await expect(qr).toBeVisible();
    await expect(qr.locator('svg[role="img"]')).toHaveAttribute('aria-label', /ABC234/);
    const colors = await qr.evaluate((el) => ({
      bg: getComputedStyle(el).backgroundColor,
      fg: getComputedStyle(el).color,
    }));
    expect(colors.bg).toBe('rgb(255, 255, 255)');
    expect(colors.fg).toBe('rgb(17, 17, 17)');
    const box = await qr.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(150);
    expect(Math.abs(box!.width - box!.height)).toBeLessThan(1);

    await toggle.click();
    await expect(page.getByTestId('room-qr')).toHaveCount(0);
  });

  test('推送连不上时退回轮询（间隔拉长，不再每 3 秒一次）', async ({ page }) => {
    const { polls } = await mockRoomSession(page);
    await page.goto(`/room/${ROOM_CODE}`);
    await waitForAppReady(page);
    await expect(page.getByTestId('room-count')).toContainText('1 / 6', { timeout: 10_000 });
    const before = polls();
    await page.waitForTimeout(4_000);
    // 原先 3 秒一次，4 秒内至少 1 次；现在 15 秒一次，4 秒内不会再取
    expect(polls() - before).toBe(0);
  });
});
