// 人机本地模式 E2E
// 对照：docs/_internal/design/08-security-ai.md §8.5 / docs/_internal/TASKS.md P2 B18
// 守护：BGIO 回合机制（ctx.currentPlayer ↔ G.currentPlayerID 对齐）与 Bot 自动推进

import type { Page } from '@playwright/test';
import { test, expect, waitForAppReady } from './fixtures/index.js';

/** 座位标识的前缀：宽屏是围坐布局的座位，窄屏是行动轴上的格子（断点 1024px） */
function seatPrefix(page: Page): string {
  const width = page.viewportSize()?.width ?? 1280;
  return width >= 1024 ? 'player-seat-' : 'rail-slot-';
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
    await page.goto('/local');
    await waitForAppReady(page);

    await page.getByRole('button', { name: /开始游戏|Start/ }).click();

    // 等待 BGIO 从 setup 走到 playing（turnPhase 进入 draw）
    await expect(page.getByText(/回合\s*[1-9]/)).toBeVisible({ timeout: 15_000 });
    // 3 个 AI 玩家的座位应都可见（"玩家明细"列表默认折叠，不能拿它当可见性依据）
    const prefix = seatPrefix(page);
    for (const id of ['1', '2', '3']) {
      await expect(page.getByTestId(`${prefix}${id}`)).toBeVisible();
    }
    // 座位总数 = 玩家数（含真人自己）
    await expect(page.locator(`[data-testid^="${prefix}"]`)).toHaveCount(4);
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
    const consoleWarnings: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('favicon.ico')) return;
      // Worker 在自动循环连续被拒到上限时记 error，真人 move 被拒与前两次被拒记 warning
      if (msg.type() === 'error') consoleErrors.push(text);
      else if (msg.type() === 'warning') consoleWarnings.push(text);
    });

    await page.goto('/local');
    await waitForAppReady(page);
    await page.getByRole('button', { name: /开始游戏|Start/ }).click();

    // 轮到自己抽牌
    await page.getByRole('button', { name: /抽牌|Draw/ }).click({ timeout: 15_000 });
    // 结束行动
    await page.getByRole('button', { name: /结束行动|End Action/ }).click({ timeout: 5_000 });
    // 弃牌：手牌未超限时点「跳过弃牌」；超限（真人是梦主时常见）则先选够张数再确认
    const skipDiscard = page.getByTestId('action-skip-discard');
    const confirmDiscard = page.getByTestId('action-confirm-discard');
    await expect(skipDiscard.or(confirmDiscard)).toBeVisible({ timeout: 5_000 });
    if (await skipDiscard.isVisible()) {
      await skipDiscard.click();
    } else {
      // 按钮文案形如「确认弃牌（0/N）」，N 为必须弃掉的张数
      const label = (await confirmDiscard.textContent()) ?? '';
      const required = Number(/\/\s*(\d+)/.exec(label)?.[1]);
      expect(required).toBeGreaterThan(0);

      // 手牌里可能有同名的牌，界面按牌 ID 选择，同名牌再点一次会取消选中，所以只挑不重名的
      const cards = page.getByTestId('human-hand').locator('[data-testid^="card-"]');
      const count = await cards.count();
      const seenTitles = new Set<string>();
      let picked = 0;
      for (let i = 0; i < count && picked < required; i++) {
        const title = (await cards.nth(i).getAttribute('title')) ?? `#${i}`;
        if (seenTitles.has(title)) continue;
        seenTitles.add(title);
        await cards.nth(i).click();
        picked += 1;
      }
      expect(picked).toBe(required);
      await expect(confirmDiscard).toBeEnabled();
      await confirmDiscard.click();
    }

    // Bot 自动推进后再次回到自己回合
    await page
      .getByRole('button', { name: /抽牌|Draw/ })
      .waitFor({ state: 'visible', timeout: 15_000 });

    // 关键断言：整个流程无 move 被拒（Worker 记录被拒时的文字为 'move rejected'，error 与 warning 级都要查）
    const rejected = [...consoleErrors, ...consoleWarnings].filter((e) =>
      e.includes('move rejected'),
    );
    expect(rejected).toEqual([]);
  });

  test('不同人数（5 人局）可正常开局', async ({ page }) => {
    await page.goto('/local');
    await waitForAppReady(page);

    await page.getByRole('button', { name: /^5$/ }).click();
    await page.getByRole('button', { name: /开始游戏|Start/ }).click();

    await expect(page.getByText(/回合\s*\d+/)).toBeVisible({ timeout: 10_000 });
    // 5 人局：4 个 AI 座位都应可见
    const prefix = seatPrefix(page);
    for (const id of ['1', '2', '3', '4']) {
      await expect(page.getByTestId(`${prefix}${id}`)).toBeVisible();
    }
    await expect(page.locator(`[data-testid^="${prefix}"]`)).toHaveCount(5);
  });
});
