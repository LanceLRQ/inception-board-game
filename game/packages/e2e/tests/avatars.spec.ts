import { test, expect, isNarrowViewport, waitForAppReady } from './fixtures/index.js';

test.describe('固定场景 · 对局角色头像', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/game/debug?players=8');
    await waitForAppReady(page);
    await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
  });

  test('同桌列表显示 8 名玩家，各有对应的角色头像', async ({ page }) => {
    let seats = page.getByTestId(/^player-avatar-\d+$/);
    if (isNarrowViewport(page)) {
      await page.getByRole('button', { name: '同桌与世界观' }).click();
      seats = page.getByTestId('mobile-table-info').getByRole('button', { name: /^查看.+角色$/ });
    }
    await expect(seats).toHaveCount(8);
    const characters = new Set<string>();
    for (const seat of await seats.all()) {
      const face = seat.locator('[data-character]');
      await expect(face).toHaveAttribute('data-character', /.+/);
      await expect(face.locator('img, [data-testid="card-art-fallback"]')).toBeVisible();
      characters.add((await face.getAttribute('data-character'))!);
    }
    expect(characters.size).toBe(8);
    await seats.first().click();
    await expect(page.getByTestId('card-detail-modal')).toBeVisible();
  });

  test('层条上的占位者各显示角色头像，点击可打开角色详情', async ({ page }) => {
    const occupants = page.getByTestId(/^occupant-\d+$/);
    await expect(occupants).toHaveCount(8);
    for (const occupant of await occupants.all()) {
      const face = occupant.locator('[data-character]');
      await expect(face).toHaveAttribute('data-character', /.+/);
      await expect(face.locator('img, [data-testid="card-art-fallback"]')).toBeVisible();
    }
    await occupants.first().click();
    await expect(page.getByTestId('card-detail-modal')).toBeVisible();
  });
});
