// 人机对局的本地存档：刷新后可以「继续上一局」，回合数与手牌与刷新前一致；存档损坏时开新局而不崩溃
//
// 存档在本机 IndexedDB 里（库 icgame-local，仓库 saves），引擎的完整状态只由 Worker 读写。

import type { Page } from '@playwright/test';
import { test, expect, waitForAppReady, waitVisibleAnswering } from './fixtures/index.js';
import { ENGINE_SCHEMA, readSavedMeta, seedSave, validMeta } from './fixtures/localSave.js';

/** 等存档落盘并稳定：已写入且连续两次读到的版本号一致 */
async function waitForSaveSettled(page: Page): Promise<{ turn: number; stateID: number }> {
  let last: { turn: number; stateID: number } | null = null;
  for (let i = 0; i < 40; i++) {
    const now = await readSavedMeta(page);
    if (now && last && now.stateID === last.stateID) return now;
    last = now;
    await page.waitForTimeout(250);
  }
  throw new Error('存档没有落盘或一直在变化');
}

async function turnOf(page: Page): Promise<number> {
  const text =
    (await page
      .getByText(/回合\s*\d+/)
      .first()
      .textContent()) ?? '';
  return Number(/回合\s*(\d+)/.exec(text)?.[1] ?? 0);
}

async function handOf(page: Page): Promise<Array<string | null>> {
  return page
    .getByTestId('human-hand')
    .locator('[data-testid^="card-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('title')));
}

/** 开一局 4 人局，抽一张牌后停在行动阶段（此时没有任何东西会自己往前走） */
async function startAndDraw(page: Page): Promise<void> {
  await page.goto('/local');
  await waitForAppReady(page);
  await page.getByRole('button', { name: /开始游戏|Start/ }).click();
  const draw = page.getByRole('button', { name: /抽牌|Draw/ });
  await waitVisibleAnswering(page, draw, 20_000);
  await draw.click({ timeout: 5_000 });
  await expect(page.getByRole('button', { name: /结束行动|End Action/ })).toBeVisible({
    timeout: 5_000,
  });
}

test.describe('人机对局本地存档', () => {
  test('开局走几步 → 刷新 → 继续上一局：回合数与手牌与刷新前一致', async ({ page }) => {
    await startAndDraw(page);
    const turnBefore = await turnOf(page);
    const handBefore = await handOf(page);
    expect(handBefore.length).toBeGreaterThan(0);
    const saved = await waitForSaveSettled(page);
    expect(saved.turn).toBe(turnBefore);

    await page.reload();
    await waitForAppReady(page);

    // 有未结束的存档：先问继续还是开新局
    await expect(page.getByTestId('local-resume-prompt')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('local-resume-summary')).toContainText(`${turnBefore}`);
    await page.getByTestId('local-resume-continue').click();

    // 回到刷新前的局面：仍在行动阶段，回合数与手牌都一样
    await expect(page.getByRole('button', { name: /结束行动|End Action/ })).toBeVisible({
      timeout: 15_000,
    });
    expect(await turnOf(page)).toBe(turnBefore);
    expect(await handOf(page)).toEqual(handBefore);

    // 恢复后的对局能继续往下走：结束行动后 Bot 接着走，不会被拒
    await page.getByRole('button', { name: /结束行动|End Action/ }).click();
    await expect(
      page.getByTestId('action-skip-discard').or(page.getByTestId('action-confirm-discard')),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('选「开新局」：存档被清除，之后重新选人数开局', async ({ page }) => {
    await startAndDraw(page);
    await waitForSaveSettled(page);

    await page.reload();
    await waitForAppReady(page);
    await expect(page.getByTestId('local-resume-prompt')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('local-resume-new').click();

    await expect(page.getByRole('button', { name: /开始游戏|Start/ })).toBeVisible();
    expect(await readSavedMeta(page)).toBeNull();

    // 再刷新也不会再提示
    await page.reload();
    await waitForAppReady(page);
    await expect(page.getByRole('button', { name: /开始游戏|Start/ })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('local-resume-prompt')).toHaveCount(0);
  });

  test('存档里的状态损坏：继续时丢弃并开新局，不崩溃', async ({ page }) => {
    const warnings: string[] = [];
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'warning') warnings.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/local');
    await waitForAppReady(page);
    // 摘要合法、状态是垃圾
    await seedSave(page, validMeta({ playerCount: 5, turn: 3, stateID: 7 }), { not: 'a match' });

    await page.reload();
    await waitForAppReady(page);
    await expect(page.getByTestId('local-resume-prompt')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('local-resume-continue').click();

    // 开了新局：能走到自己的回合
    await waitVisibleAnswering(page, page.getByRole('button', { name: /抽牌|Draw/ }), 20_000);
    expect(warnings.some((w) => w.includes('saved match could not be restored'))).toBe(true);
    expect(errors).toEqual([]);
    // 损坏的存档已被丢弃，随后被新局的进度覆盖
    await page.getByRole('button', { name: /抽牌|Draw/ }).click({ timeout: 5_000 });
    const saved = await waitForSaveSettled(page);
    expect(saved.stateID).not.toBe(7);
  });

  test('引擎状态版本对不上：不提示继续，直接显示人数选择', async ({ page }) => {
    await page.goto('/local');
    await waitForAppReady(page);
    await seedSave(
      page,
      validMeta({ engineSchema: ENGINE_SCHEMA + 1, playerCount: 4, turn: 1, stateID: 1 }),
    );

    await page.reload();
    await waitForAppReady(page);
    await expect(page.getByRole('button', { name: /开始游戏|Start/ })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('local-resume-prompt')).toHaveCount(0);
    expect(await readSavedMeta(page)).toBeNull();
  });
});
