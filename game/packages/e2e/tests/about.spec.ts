// About 页 E2E
import { test, expect, waitForAppReady } from './fixtures/index.js';

test.describe('关于 About', () => {
  test('显示"关于"标题与项目介绍', async ({ page }) => {
    await page.goto('/about');
    await waitForAppReady(page);

    await expect(page.getByRole('heading', { name: /关于|About/ })).toBeVisible();
    await expect(page.getByText(/盗梦都市|Inception City/).first()).toBeVisible();
  });

  test('完整版权声明（variant=full）包含版权关键信息', async ({ page }) => {
    await page.goto('/about');
    await waitForAppReady(page);
    // 先等 Suspense 加载完、heading 可见，再读 content
    await expect(page.getByRole('heading', { name: /关于|About/ })).toBeVisible({
      timeout: 8_000,
    });

    const content = await page.content();
    const hasCopyright = /版权|Copyright|©|千骐动漫|Fan[- ]?made|爱好者/i.test(content);
    expect(hasCopyright).toBe(true);
  });
});
