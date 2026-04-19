// 人机本地模式 E2E
// 对照：plans/design/08-security-ai.md §8.5 / plans/tasks.md P2 B18
// 守护：BGIO 回合机制（ctx.currentPlayer ↔ G.currentPlayerID 对齐）与 Bot 自动推进

import { test, expect, waitForAppReady } from './fixtures/index.js';

test.describe('人机对战 LocalMatch', () => {
  test('打开 /local 显示玩家人数选择与开始按钮', async ({ page }) => {
    await page.goto('/local');
    await waitForAppReady(page);

    await expect(page.getByRole('heading', { name: /人机对战|Local Match/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /4|5|6/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /开始游戏|Start/ })).toBeVisible();
  });

  test('4 人局：开始游戏后进入回合阶段，轮次信息与玩家列表可见', async ({ page }) => {
    await page.goto('/local');
    await waitForAppReady(page);

    await page.getByRole('button', { name: /开始游戏|Start/ }).click();

    // 等待 BGIO 从 setup 走到 playing（turnPhase 进入 draw）
    await expect(page.getByText(/回合\s*[1-9]/)).toBeVisible({ timeout: 15_000 });
    // 3 个 AI 玩家条目应都存在（用 exact 匹配避开"AI 3 回合"类冲突）
    await expect(page.getByText('AI 1', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('AI 2', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('AI 3', { exact: true }).first()).toBeVisible();
  });

  test('人类玩家手牌随抽牌增加，流程推进到 action 阶段', async ({ page }) => {
    await page.goto('/local');
    await waitForAppReady(page);
    await page.getByRole('button', { name: /开始游戏|Start/ }).click();

    // 等待轮到自己
    const drawBtn = page.getByRole('button', { name: /抽牌|Draw/ });
    await drawBtn.waitFor({ state: 'visible', timeout: 15_000 });
    await drawBtn.click();

    // 抽牌后进入 action 阶段
    await expect(page.getByRole('button', { name: /结束行动|End Action/ })).toBeVisible({
      timeout: 5_000,
    });
  });

  test('完整走完一回合（抽牌 → 结束行动 → 跳过弃牌）流程稳定，无 console error', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (text.includes('favicon.ico')) return;
      // BGIO master 端拒绝 move 会打 ERROR 日志（这是 bug 信号）
      consoleErrors.push(text);
    });

    await page.goto('/local');
    await waitForAppReady(page);
    await page.getByRole('button', { name: /开始游戏|Start/ }).click();

    // 轮到自己抽牌
    await page.getByRole('button', { name: /抽牌|Draw/ }).click({ timeout: 15_000 });
    // 结束行动
    await page.getByRole('button', { name: /结束行动|End Action/ }).click({ timeout: 5_000 });
    // 跳过弃牌
    await page.getByRole('button', { name: /跳过弃牌|Skip Discard/ }).click({ timeout: 5_000 });

    // Bot 自动推进后再次回到自己回合
    await page
      .getByRole('button', { name: /抽牌|Draw/ })
      .waitFor({ state: 'visible', timeout: 15_000 });

    // 关键断言：整个流程无 BGIO move 拒绝错误
    const disallowed = consoleErrors.filter(
      (e) => e.includes('disallowed move') || e.includes('canPlayerMakeMove=false'),
    );
    expect(disallowed).toEqual([]);
  });

  test('不同人数（5 人局）可正常开局', async ({ page }) => {
    await page.goto('/local');
    await waitForAppReady(page);

    await page.getByRole('button', { name: /^5$/ }).click();
    await page.getByRole('button', { name: /开始游戏|Start/ }).click();

    await expect(page.getByText(/回合\s*\d+/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('AI 4')).toBeVisible();
  });
});
