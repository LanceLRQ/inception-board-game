// 人机局"再来一局"流程 E2E

import {
  LOCAL_MATCH_URL,
  test,
  expect,
  isNarrowViewport,
  waitForAppReady,
  waitVisibleAnswering,
} from './fixtures/index.js';
import { readSavedMeta } from './fixtures/localSave.js';

test.describe('LocalMatch 重开局', () => {
  test('首次进入显示选人数界面', async ({ page }) => {
    await page.goto('/local');
    await waitForAppReady(page);

    await expect(page.getByRole('button', { name: /开始游戏|Start/ })).toBeVisible();
  });

  test('已保存的对局刷新后可以放弃，并用不同人数开新局', async ({ page }) => {
    await page.goto(LOCAL_MATCH_URL);
    await waitForAppReady(page);
    await page.getByRole('button', { name: /开始游戏|Start/ }).click();

    await waitVisibleAnswering(page, page.getByTestId('action-end'), 15_000);
    await expect.poll(() => readSavedMeta(page)).not.toBeNull();

    await page.reload();
    await waitForAppReady(page);
    await expect(page.getByTestId('local-resume-prompt')).toBeVisible();
    await page.getByTestId('local-resume-new').click();

    await page.getByRole('button', { name: '5', exact: true }).click();
    await page.getByRole('button', { name: /开始游戏|Start/ }).click();
    await expect(page.getByText(/回合\s*\d+/)).toBeVisible({ timeout: 10_000 });
    const prefix = isNarrowViewport(page) ? 'occupant-' : 'player-seat-';
    await expect(page.getByTestId(`${prefix}4`)).toBeVisible();
  });
});
