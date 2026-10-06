// 对局内预设短语（固定场景 ?chat=1 注入示例消息）：入口、面板、座位气泡、冷却
//
// 固定场景没有连接：发出的短语只在本机回显。联机的收发另见 tests-online。
// 宽屏的入口在片头条（chat-toggle，浮层），窄屏的入口在手牌坞的操作区（dock-chat，底部抽屉）。

import { test, expect, isNarrowViewport, waitForAppReady } from './fixtures/index.js';

async function openScene(page: import('@playwright/test').Page, url: string): Promise<void> {
  await page.goto(url);
  await waitForAppReady(page);
  await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
}

const toggleOf = (page: import('@playwright/test').Page) =>
  page.getByTestId(isNarrowViewport(page) ? 'dock-chat' : 'chat-toggle');

test.describe('固定场景 · 预设短语', () => {
  test('缺省场景（没有连接）没有短语入口', async ({ page }) => {
    await openScene(page, '/game/debug');
    await expect(page.getByTestId('chat-toggle')).toHaveCount(0);
    await expect(page.getByTestId('dock-chat')).toHaveCount(0);
    await expect(page.locator('[data-testid^="chat-bubble-"]')).toHaveCount(0);
  });

  test('chat=1：示例消息显示为座位旁气泡，文字是预设短语', async ({ page }) => {
    await openScene(page, '/game/debug?chat=1');
    const bubbles = page.locator('[data-testid^="chat-bubble-"]');
    await expect(bubbles.first()).toBeVisible({ timeout: 10_000 });
    expect(await bubbles.count()).toBeGreaterThanOrEqual(3);
    await expect(page.locator('[data-testid^="chat-bubble-"][data-phrase="greet_hi"]')).toHaveText(
      '大家好！',
    );
  });

  test('面板：分类标签、最近消息可展开；发一条后本人座位旁出现气泡并进入冷却', async ({ page }) => {
    await openScene(page, '/game/debug?chat=1');
    await toggleOf(page).click();
    const panel = page.getByTestId('chat-panel');
    await expect(panel).toBeVisible();

    // 最近消息默认收起，展开后列出 4 条示例消息，带发送者昵称
    await expect(page.getByTestId('chat-recent')).toHaveCount(0);
    await page.getByTestId('chat-recent-toggle').click();
    await expect(page.getByTestId('chat-recent').locator('li')).toHaveCount(4);

    // 切到「情绪」发一条本机没有的短语
    await page.getByTestId('chat-tab-emotion').click();
    await page.getByTestId('chat-phrase-emotion_laugh').click();
    await expect(panel).toHaveCount(0);
    await expect(
      page.locator('[data-testid^="chat-bubble-"][data-phrase="emotion_laugh"]'),
    ).toBeVisible({ timeout: 5_000 });

    // 冷却：再打开面板，短语按钮不可点并显示剩余秒数；冷却结束后恢复
    await toggleOf(page).click();
    await page.getByTestId('chat-tab-emotion').click();
    await expect(page.getByTestId('chat-phrase-emotion_wow')).toBeDisabled();
    await expect(page.getByTestId('chat-cooldown')).toContainText(/冷却/);
    await expect(page.getByTestId('chat-phrase-emotion_wow')).toBeEnabled({ timeout: 6_000 });
  });

  test('梦主视角没有盗梦者专用的战术短语', async ({ page }) => {
    await openScene(page, '/game/debug?as=master&chat=1');
    await toggleOf(page).click();
    await page.getByTestId('chat-tab-tactic').click();
    await expect(page.getByTestId('chat-phrase-tactic_wait')).toBeVisible();
    await expect(page.getByTestId('chat-phrase-tactic_push')).toHaveCount(0);
  });

  test('气泡几秒后消失，最近消息里仍保留', async ({ page }) => {
    await openScene(page, '/game/debug?chat=1');
    await expect(page.locator('[data-testid^="chat-bubble-"]').first()).toBeVisible();
    await expect(page.locator('[data-testid^="chat-bubble-"]')).toHaveCount(0, { timeout: 9_000 });
    await toggleOf(page).click();
    await page.getByTestId('chat-recent-toggle').click();
    await expect(page.getByTestId('chat-recent').locator('li')).toHaveCount(4);
  });
});
