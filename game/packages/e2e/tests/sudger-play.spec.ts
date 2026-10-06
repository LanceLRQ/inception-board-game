// 意念判官的发动入口：判官打出 SHOOT 类牌时一律改走【定罪】（playShootSudger），而不是普通的 playShoot
// 固定场景 ?character=sudger：本人是意念判官，行动阶段轮到自己，手里有 SHOOT。
// 固定场景里发出的 move 只记日志（频道 game/fixture），所以读控制台日志断言发出了什么。
// 选骰的应答界面见 awaited-response.spec.ts（?pending=sudger）。

import type { Page } from '@playwright/test';
import { test, expect, selectAndPlayCard, waitForAppReady } from './fixtures/index.js';

interface SentMove {
  move: string;
  args: unknown[];
}

function recordMoves(page: Page): SentMove[] {
  const sent: SentMove[] = [];
  page.on('console', (msg) => {
    if (!msg.text().includes('move dispatched')) return;
    void msg
      .args()[1]
      ?.jsonValue()
      .then((ctx: { move: string; args: unknown[] }) => {
        sent.push({ move: ctx.move, args: ctx.args });
      });
  });
  return sent;
}

/** 打开场景，选中 SHOOT、打出，在选目标弹窗里点第一个可选目标；返回收集到的 move 日志 */
async function playShootFrom(page: Page, url: string): Promise<SentMove[]> {
  const sent = recordMoves(page);
  await page.goto(url);
  await waitForAppReady(page);
  await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
  const shoot = page
    .getByTestId('human-hand')
    .locator('[data-testid^="card-"][title="SHOOT"]')
    .first();
  const index = Number((await shoot.getAttribute('data-testid'))?.replace('card-', ''));
  expect(Number.isInteger(index)).toBe(true);
  await selectAndPlayCard(page, index);
  await expect(page.getByTestId('target-player-picker-dialog')).toBeVisible({ timeout: 5_000 });
  // 选第一个可选目标（同层限制由卡牌决定，置灰的目标点不了）
  await page
    .getByTestId(/^target-player-\d+$/)
    .and(page.locator(':enabled'))
    .first()
    .click();
  return sent;
}

test.describe('意念判官 · 定罪', () => {
  test('判官打出 SHOOT 并选目标：发出 playShootSudger（目标在前、牌在后）', async ({ page }) => {
    const sent = await playShootFrom(page, '/game/debug?character=sudger');
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]!.move).toBe('playShootSudger');
    expect(sent[0]!.args).toHaveLength(2);
    expect(sent[0]!.args[1]).toBe('action_shoot');
    expect(typeof sent[0]!.args[0]).toBe('string');
  });

  test('别的角色打出 SHOOT 仍是普通的 playShoot', async ({ page }) => {
    const sent = await playShootFrom(page, '/game/debug');
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]!.move).toBe('playShoot');
  });
});
