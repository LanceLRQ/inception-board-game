// 人机本地模式 E2E
// 守护：BGIO 回合机制（ctx.currentPlayer ↔ G.currentPlayerID 对齐）与 Bot 自动推进

import type { Page } from '@playwright/test';
import {
  LOCAL_MATCH_URL,
  test,
  expect,
  disableAutoDraw,
  getDiscardPrompt,
  isNarrowViewport,
  pickCardsToDiscard,
  waitForAppReady,
  waitVisibleAnswering,
} from './fixtures/index.js';

/** 宽屏同桌列表和窄屏梦境层条均显示本人和 Bot。 */
async function expectPlayersVisible(page: Page, count: number): Promise<void> {
  const prefix = isNarrowViewport(page) ? 'occupant-' : 'player-seat-';
  for (let id = 0; id < count; id++) {
    await expect(page.getByTestId(`${prefix}${id}`)).toBeVisible();
  }
  await expect(page.locator(`[data-testid^="${prefix}"]`)).toHaveCount(count);
}

test.describe('人机对战 LocalMatch', () => {
  test('打开 /local 显示玩家人数选择与开始按钮', async ({ page }) => {
    await page.goto('/local');
    await waitForAppReady(page);

    await expect(page.getByRole('heading', { name: /人机对战|Local Match/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /4|5|6/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /开始游戏|Start/ })).toBeVisible();
  });

  test('4 人局：开始游戏后进入回合阶段，轮次信息与玩家列表可见', async ({ page }) => {
    await page.goto(LOCAL_MATCH_URL);
    await waitForAppReady(page);

    await page.getByRole('button', { name: /开始游戏|Start/ }).click();

    // 等待 BGIO 从 setup 走到 playing（turnPhase 进入 draw）
    await expect(page.getByText(/回合\s*[1-9]/)).toBeVisible({ timeout: 15_000 });
    await expectPlayersVisible(page, 4);
  });

  test('人类玩家手牌随抽牌增加，流程推进到 action 阶段', async ({ page }) => {
    await disableAutoDraw(page);
    await page.goto(LOCAL_MATCH_URL);
    await waitForAppReady(page);
    await page.getByRole('button', { name: /开始游戏|Start/ }).click();

    // 等待轮到自己
    const drawBtn = page.getByTestId('action-draw');
    await waitVisibleAnswering(page, drawBtn, 15_000);
    const hand = page.getByTestId('human-hand').locator('[data-testid^="card-"]');
    const before = await hand.count();
    await drawBtn.click();

    // 抽牌后进入 action 阶段
    await expect(page.getByRole('button', { name: /结束行动|End Action/ })).toBeVisible({
      timeout: 5_000,
    });
    expect(await hand.count()).toBeGreaterThan(before);
  });

  test('完整走完一回合（抽牌 → 结束行动 → 结算弃牌）流程稳定，无 console error', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const consoleWarnings: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('favicon.ico')) return;
      // Worker 在自动循环连续被拒到上限时记 error，真人 move 被拒与前两次被拒记 warning
      if (msg.type() === 'error') consoleErrors.push(text);
      else if (msg.type() === 'warning') consoleWarnings.push(text);
    });

    await disableAutoDraw(page);
    await page.goto(LOCAL_MATCH_URL);
    await waitForAppReady(page);
    await page.getByRole('button', { name: /开始游戏|Start/ }).click();

    // 轮到自己抽牌（等待期间若 Bot 的行动让真人要应答，就给出最简单的答复）
    const draw = page.getByTestId('action-draw');
    await waitVisibleAnswering(page, draw, 15_000);
    await draw.click({ timeout: 5_000 });
    // 结束行动
    await page.getByRole('button', { name: /结束行动|End Action/ }).click({ timeout: 5_000 });
    // 弃牌：手牌未超限时点「跳过弃牌」；超限（真人是梦主时常见）则先选够张数再确认
    const skipDiscard = page.getByTestId('action-skip-discard');
    const discardPrompt = getDiscardPrompt(page);
    const confirmDiscard = page.getByTestId('action-confirm-discard');
    await expect(skipDiscard.or(discardPrompt)).toBeVisible({ timeout: 5_000 });
    if (await skipDiscard.isVisible()) {
      await skipDiscard.click();
    } else {
      const label = (await discardPrompt.textContent()) ?? '';
      const required = Number(/选择\s*(\d+)\s*张弃牌/.exec(label)?.[1]);
      expect(required).toBeGreaterThan(0);

      // 弃牌选择按手牌位置记录，同名牌也能同时选中
      const picked = await pickCardsToDiscard(page, required);
      expect(picked).toBe(required);
      await expect(confirmDiscard).toBeEnabled();
      await confirmDiscard.click();
    }

    // Bot 自动推进后再次回到自己回合
    await waitVisibleAnswering(page, page.getByTestId('action-draw'), 15_000);

    expect(consoleErrors).toEqual([]);
    // 关键断言：整个流程无 move 被拒（Worker 记录被拒时的文字为 'move rejected'，error 与 warning 级都要查）
    const rejected = [...consoleErrors, ...consoleWarnings].filter((e) =>
      e.includes('move rejected'),
    );
    expect(rejected).toEqual([]);
  });

  test('不同人数（5 人局）可正常开局', async ({ page }) => {
    await page.goto(LOCAL_MATCH_URL);
    await waitForAppReady(page);

    await page.getByRole('button', { name: /^5$/ }).click();
    await page.getByRole('button', { name: /开始游戏|Start/ }).click();

    await expect(page.getByText(/回合\s*\d+/)).toBeVisible({ timeout: 10_000 });
    await expectPlayersVisible(page, 5);
  });
});
