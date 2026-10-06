// 局后举报（固定场景 ?outcome=1：对局已结束，所有对手按真人对待；?outcome=duplicate|failed 让举报接口给对应结果）
//
// 联机真实接口另见 tests-online（整局打完后举报对手）。

import { test, expect, waitForAppReady } from './fixtures/index.js';

async function openOutcome(page: import('@playwright/test').Page, query: string): Promise<void> {
  await page.goto(`/game/debug?${query}`);
  await waitForAppReady(page);
  await expect(page.getByTestId('winner-banner')).toBeVisible({ timeout: 10_000 });
}

test.describe('固定场景 · 局后举报', () => {
  test('缺省场景（对局没结束）没有举报区', async ({ page }) => {
    await page.goto('/game/debug');
    await waitForAppReady(page);
    await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('outcome-report')).toHaveCount(0);
  });

  test('结算画面按真人对手各列一行，不含本人', async ({ page }) => {
    await openOutcome(page, 'outcome=1&players=5');
    const rows = page.locator('[data-testid^="report-row-"]');
    await expect(rows).toHaveCount(4);
    await expect(
      page.getByTestId('outcome-report').locator('[data-testid="pixel-avatar"]'),
    ).toHaveCount(4);
  });

  test('选理由、写说明、提交：成功后提示已收到，该对手的举报按钮变为已举报', async ({ page }) => {
    await openOutcome(page, 'outcome=1');
    await page.getByTestId('report-button-1').click();
    const dialog = page.getByTestId('report-dialog');
    await expect(dialog).toBeVisible();
    // 没选理由不能提交
    await expect(page.getByTestId('report-submit')).toBeDisabled();
    await page.getByTestId('report-reason-afk').check();
    await page.getByTestId('report-description').fill('一直没有操作');
    await page.getByTestId('report-submit').click();
    await expect(page.getByTestId('report-result')).toHaveAttribute('data-result', 'ok');
    await page.getByTestId('report-close').click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('report-button-1')).toBeDisabled();
    await expect(page.getByTestId('report-button-1')).toContainText('已举报');
    // 其他对手仍可举报
    await expect(page.getByTestId('report-button-2')).toBeEnabled();
  });

  test('服务端判为重复举报：提示已举报过，按钮同样锁定', async ({ page }) => {
    await openOutcome(page, 'outcome=duplicate');
    await page.getByTestId('report-button-1').click();
    await page.getByTestId('report-reason-cheating').check();
    await page.getByTestId('report-submit').click();
    await expect(page.getByTestId('report-result')).toHaveAttribute('data-result', 'duplicate');
    await page.getByTestId('report-close').click();
    await expect(page.getByTestId('report-button-1')).toBeDisabled();
  });

  test('网络失败：提示失败原因，保留已填内容可以重试，按钮不锁', async ({ page }) => {
    await openOutcome(page, 'outcome=failed');
    await page.getByTestId('report-button-1').click();
    await page.getByTestId('report-reason-abusive').check();
    await page.getByTestId('report-description').fill('言语不当');
    await page.getByTestId('report-submit').click();
    await expect(page.getByTestId('report-result')).toHaveAttribute('role', 'alert');
    await expect(page.getByTestId('report-result')).toContainText('网络');
    await expect(page.getByTestId('report-description')).toHaveValue('言语不当');
    await expect(page.getByTestId('report-submit')).toBeEnabled();
    await page.getByTestId('report-cancel').click();
    await expect(page.getByTestId('report-button-1')).toBeEnabled();
  });

  test('说明文字长度与服务端一致，最多 500 字', async ({ page }) => {
    await openOutcome(page, 'outcome=1');
    await page.getByTestId('report-button-1').click();
    await expect(page.getByTestId('report-description')).toHaveAttribute('maxlength', '500');
  });
});
