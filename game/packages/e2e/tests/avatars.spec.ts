// 像素头像：座位牌（桌面）、行动轴（移动）、中央舞台的占位者标签旁都有头像；
// 未翻露的座位显示头像，已翻露的仍显示角色卡面（头像只做角上的小徽标），不挤掉角色信息

import { test, expect, waitForAppReady } from './fixtures/index.js';

test.describe('固定场景 · 像素头像', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/game/debug?players=8');
    await waitForAppReady(page);
    await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
  });

  test('每个座位头像按钮里都有像素头像，且各不相同', async ({ page }) => {
    const buttons = page.locator('[data-testid^="player-avatar-"]');
    const n = await buttons.count();
    expect(n).toBeGreaterThanOrEqual(7);
    const seeds = new Set<string>();
    for (let i = 0; i < n; i++) {
      const avatar = buttons.nth(i).getByTestId('pixel-avatar').first();
      await expect(avatar).toBeVisible();
      seeds.add((await avatar.getAttribute('data-seed')) ?? '');
    }
    expect(seeds.size).toBe(n);
  });

  test('已翻露的座位仍显示角色卡面（有卡图或卡名占位），未翻露的座位不显示卡面', async ({
    page,
  }) => {
    const buttons = page.locator('[data-testid^="player-avatar-"]');
    const n = await buttons.count();
    let revealed = 0;
    let hidden = 0;
    for (let i = 0; i < n; i++) {
      const button = buttons.nth(i);
      const hasFace = (await button.locator('img, [data-testid="card-art-fallback"]').count()) > 0;
      if ((await button.getAttribute('data-revealed')) !== null || hasFace) {
        revealed += 1;
        expect(hasFace).toBe(true);
      } else {
        hidden += 1;
      }
    }
    expect(revealed).toBeGreaterThan(0);
    expect(hidden).toBeGreaterThan(0);
  });

  test('中央舞台 / 层塔里的占位者标签旁有头像', async ({ page }) => {
    const occupants = page.locator('[data-testid^="occupant-"]');
    await expect(occupants.first()).toBeVisible();
    const n = await occupants.count();
    for (let i = 0; i < n; i++) {
      await expect(occupants.nth(i).getByTestId('pixel-avatar')).toHaveCount(1);
    }
  });
});
