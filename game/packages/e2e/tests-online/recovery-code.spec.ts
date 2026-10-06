// 恢复码端到端：建档展示 → 换浏览器凭码恢复 → 旧码作废 → 设置页重新生成
//
// 服务端是全内存的开发服务（见 playwright.online.config.ts），身份路由与真实服务端同一份实现。

import { test, expect, type Browser, type Page } from '@playwright/test';

const CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

async function openPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    try {
      localStorage.setItem('icgame-copyright-ack', '1');
    } catch {
      /* 存储不可用时忽略 */
    }
  });
  return context.newPage();
}

async function readCode(page: Page): Promise<string> {
  const text = (await page.getByTestId('recovery-code-value').textContent()) ?? '';
  expect(text.trim()).toMatch(CODE_PATTERN);
  return text.trim();
}

test('建档展示恢复码，换浏览器凭码恢复后旧码作废，设置页可重新生成', async ({ browser }) => {
  // 1. 建档：弹窗不能被 Esc 关掉，只能点「我已保存」
  const first = await openPage(browser);
  await first.goto('/lobby');
  await first.locator('#lobby-nickname').fill('恢复甲');
  await first.getByRole('button', { name: /继续|Continue/ }).click();
  const code1 = await readCode(first);
  await first.keyboard.press('Escape');
  await expect(first.getByTestId('recovery-code-dialog')).toBeVisible();
  await first.getByTestId('recovery-code-confirm').click();
  await expect(first.getByTestId('lobby-create')).toBeVisible();

  // 2. 另一个浏览器（没有任何本地身份）：小写、不带连字符的输入也能恢复
  const second = await openPage(browser);
  await second.goto('/lobby');
  await second.getByTestId('lobby-restore-toggle').click();
  const input = second.getByTestId('lobby-restore-input');
  await input.fill(code1.replace('-', '').toLowerCase());
  await expect(input).toHaveValue(code1);
  await second.getByTestId('lobby-restore-submit').click();
  const code2 = await readCode(second);
  expect(code2).not.toBe(code1);
  await expect(second.getByTestId('recovery-code-old-revoked')).toBeVisible();
  await second.getByTestId('recovery-code-confirm').click();
  await expect(second.getByTestId('lobby-create')).toBeVisible();

  // 3. 旧码已作废：第三个浏览器用它恢复失败，给出"无效或已使用"提示
  const third = await openPage(browser);
  await third.goto('/lobby');
  await third.getByTestId('lobby-restore-toggle').click();
  await third.getByTestId('lobby-restore-input').fill(code1);
  await third.getByTestId('lobby-restore-submit').click();
  await expect(third.getByTestId('lobby-restore-error')).toContainText(/无效|invalid/i);
  await expect(third.getByTestId('recovery-code-dialog')).toHaveCount(0);

  // 4. 设置页：显示昵称与恢复码状态；重新生成要先确认，成功后旧码（code2）作废
  await second.goto('/settings');
  await expect(second.getByTestId('settings-nickname')).toHaveText('恢复甲');
  await expect(second.getByTestId('settings-status')).not.toHaveText('…');
  await second.getByTestId('settings-rotate').click();
  await second.getByTestId('settings-rotate-confirm-yes').click();
  const code3 = await readCode(second);
  expect(code3).not.toBe(code2);
  await second.getByTestId('recovery-code-confirm').click();

  await third.getByTestId('lobby-restore-input').fill(code2);
  await third.getByTestId('lobby-restore-submit').click();
  await expect(third.getByTestId('lobby-restore-error')).toContainText(/无效|invalid/i);

  // 5. 新码可用
  await third.getByTestId('lobby-restore-input').fill(code3);
  await third.getByTestId('lobby-restore-submit').click();
  await readCode(third);
  await third.getByTestId('recovery-code-confirm').click();
  await expect(third.getByTestId('lobby-create')).toBeVisible();

  // 恢复码不得落进本地持久化
  for (const p of [first, second, third]) {
    const stored = await p.evaluate(
      () => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }),
    );
    for (const c of [code1, code2, code3]) {
      expect(stored).not.toContain(c);
      expect(stored).not.toContain(c.replace('-', ''));
    }
  }
  for (const p of [first, second, third]) await p.context().close();
});

test('未建档时设置页引导去大厅', async ({ browser }) => {
  const page = await openPage(browser);
  await page.goto('/settings');
  await expect(page.getByTestId('settings-account')).toContainText(/大厅|lobby/i);
  await expect(page.getByTestId('settings-rotate')).toHaveCount(0);
  await page.context().close();
});
