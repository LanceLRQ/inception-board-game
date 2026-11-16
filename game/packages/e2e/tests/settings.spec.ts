// Settings 页 E2E
// 主题 + 音效

import { test, expect, waitForAppReady } from './fixtures/index.js';

test.describe('设置 Settings', () => {
  test('页面包含外观、音效、版权三个区块', async ({ page }) => {
    await page.goto('/settings');
    await waitForAppReady(page);

    await expect(page.getByRole('heading', { name: /设置|Settings/ })).toBeVisible();
    await expect(page.getByText(/外观|Appearance/).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /音效|Audio/ })).toBeVisible();
  });

  test('手机首屏可切换音效，静音时不能调整音量', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/settings');
    const sound = page.getByRole('switch', { name: /^(音效|Sound)$/ });
    const slider = page.getByRole('slider');
    await expect(sound).toBeInViewport({ ratio: 1 });
    await expect(slider).toBeInViewport({ ratio: 1 });
    await expect(sound).toBeChecked();
    await sound.press('Space');
    await expect(sound).not.toBeChecked();
    await expect(slider).toBeDisabled();
    await sound.press('Space');
    await expect(slider).toBeEnabled();
    await slider.press('Home');
    await slider.press('ArrowRight');
    await expect(slider).toHaveValue('0.05');
  });

  test('主题可用方向键切换，刷新后保留选择', async ({ page }) => {
    await page.goto('/settings');
    const themes = page.getByRole('radiogroup', { name: /选择主题|Choose theme/ });
    const first = themes.getByRole('radio').first();
    const second = themes.getByRole('radio').nth(1);
    await first.press('ArrowRight');
    await expect(second).toBeChecked();
    await page.reload();
    await expect(second).toBeChecked();
  });
});
