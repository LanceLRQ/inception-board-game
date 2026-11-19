// 对局内预设短语（固定场景 ?chat=1 注入示例消息）：入口、面板、座位气泡、冷却
//
// 固定场景没有连接：发出的短语只在本机回显。联机的收发另见 tests-online。
// 桌面从片头条打开短语浮层，手机从手牌区打开短语抽屉；两端都可查看最近消息。

import { test, expect, chatToggle, isNarrowViewport, waitForAppReady } from './fixtures/index.js';

async function openScene(page: import('@playwright/test').Page, url: string): Promise<void> {
  await page.goto(url);
  await waitForAppReady(page);
  await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
}

test.describe('固定场景 · 预设短语', () => {
  test('缺省场景（没有连接）没有短语入口', async ({ page }) => {
    await openScene(page, '/game/debug');
    await expect(chatToggle(page)).toHaveCount(0);
    await expect(page.locator('[data-testid^="chat-bubble-"]')).toHaveCount(0);
  });

  test('chat=1：可以在短语界面读到示例消息，桌面座位旁同时显示气泡', async ({ page }) => {
    await openScene(page, '/game/debug?chat=1');
    if (!isNarrowViewport(page)) {
      await expect(
        page.locator('[data-testid^="chat-bubble-"][data-phrase="greet_hi"]'),
      ).toHaveText('大家好！');
    }
    await chatToggle(page).click();
    await page.getByTestId('chat-recent-toggle').click();
    const recent = page.getByTestId('chat-recent');
    await expect(recent.getByRole('listitem')).toHaveCount(4);
    await expect(recent.getByText('大家好！', { exact: true })).toBeVisible();
  });

  test('面板：分类标签、最近消息可展开；发送后可看到本人消息，并进入冷却', async ({ page }) => {
    await openScene(page, '/game/debug?chat=1');
    await chatToggle(page).click();
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
    if (!isNarrowViewport(page)) {
      await expect(
        page.locator('[data-testid^="chat-bubble-"][data-phrase="emotion_laugh"]'),
      ).toBeVisible();
    }

    // 冷却：再打开面板，短语按钮不可点并显示剩余秒数；冷却结束后恢复
    await chatToggle(page).click();
    await page.getByTestId('chat-recent-toggle').click();
    await expect(page.getByTestId('chat-recent').getByRole('listitem').last()).toHaveText(
      /我.*哈哈哈/,
    );
    await page.getByTestId('chat-tab-emotion').click();
    await expect(page.getByTestId('chat-phrase-emotion_wow')).toBeDisabled();
    await expect(page.getByTestId('chat-cooldown')).toContainText(/冷却/);
    await expect(page.getByTestId('chat-phrase-emotion_wow')).toBeEnabled({ timeout: 6_000 });
  });

  test('梦主视角没有盗梦者专用的战术短语', async ({ page }) => {
    await openScene(page, '/game/debug?as=master&chat=1');
    await chatToggle(page).click();
    await page.getByTestId('chat-tab-tactic').click();
    await expect(page.getByTestId('chat-phrase-tactic_wait')).toBeVisible();
    await expect(page.getByTestId('chat-phrase-tactic_push')).toHaveCount(0);
  });

  test('桌面气泡几秒后消失，最近消息里仍保留', async ({ page }) => {
    test.skip(isNarrowViewport(page), '座位旁气泡目前仅出现在桌面布局');
    await openScene(page, '/game/debug?chat=1');
    await expect(page.locator('[data-testid^="chat-bubble-"]').first()).toBeVisible();
    await expect(page.locator('[data-testid^="chat-bubble-"]')).toHaveCount(0, { timeout: 9_000 });
    await chatToggle(page).click();
    await page.getByTestId('chat-recent-toggle').click();
    await expect(page.getByTestId('chat-recent').locator('li')).toHaveCount(4);
  });
});
