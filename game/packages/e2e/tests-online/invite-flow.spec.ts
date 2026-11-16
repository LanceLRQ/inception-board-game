import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';

const SERVER = 'http://localhost:13101';
async function createRoom(request: APIRequestContext) {
  const identity = await (
    await request.post(`${SERVER}/identity/init`, { data: { nickname: '邀请房主' } })
  ).json();
  const headers = { Authorization: `Bearer ${identity.token}` };
  const response = await request.post(`${SERVER}/rooms`, { headers, data: { maxPlayers: 4 } });
  expect(response.ok()).toBe(true);
  const room = await response.json();
  return { code: room.code as string, headers };
}
async function visitor(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => localStorage.setItem('icgame-copyright-ack', '1'));
  return context;
}

async function expectRecoveryConfirmationAfterReload(page: Page, code: string) {
  const value = page.getByTestId('recovery-code-value');
  await expect(value).not.toBeEmpty();
  const issuedCode = (await value.innerText()).trim();
  await page.reload();
  await expect(page.getByTestId('recovery-code-dialog')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/lobby\\?invite=${code}$`));
  await expect(value).toHaveText(issuedCode);
}

test('服务端邀请 302 保留分享卡片，新建身份后刷新仍须确认原恢复码', async ({
  browser,
  request,
}) => {
  const { code, headers } = await createRoom(request);
  const preview = await request.get(`${SERVER}/invite/${code}`, {
    headers: { 'User-Agent': 'TelegramBot' },
  });
  expect(await preview.text()).toContain(`邀请你加入房间 ${code}`);
  const context = await visitor(browser);
  const page = await context.newPage();
  await page.goto(`${SERVER}/invite/${code.toLowerCase()}`);
  await expect(page).toHaveURL(new RegExp(`/lobby\\?invite=${code}$`));
  await page.reload();
  await page.locator('#lobby-nickname').fill('受邀新玩家');
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect(page.getByTestId('recovery-code-dialog')).toBeVisible();
  const before = await (await request.get(`${SERVER}/rooms/code/${code}`, { headers })).json();
  expect(before.players).toHaveLength(1);
  await expectRecoveryConfirmationAfterReload(page, code);
  const reloaded = await (await request.get(`${SERVER}/rooms/code/${code}`, { headers })).json();
  expect(reloaded.players).toHaveLength(1);
  await page.getByTestId('recovery-code-confirm').click();
  await expect(page).toHaveURL(new RegExp(`/room/${code}$`));
  await expect(page.getByTestId('room-players')).toContainText('受邀新玩家');
  const after = await (await request.get(`${SERVER}/rooms/code/${code}`, { headers })).json();
  expect(after.players).toHaveLength(2);
  await page.reload();
  await expect(page.getByTestId('room-count')).toContainText('2');
  await page.goto(`/lobby?invite=${code}`);
  await expect(page).toHaveURL(new RegExp(`/room/${code}$`));
  await expect(page.getByTestId('recovery-code-dialog')).toHaveCount(0);
  await context.close();
});

test('恢复账号后刷新仍须确认刚签发的恢复码，旧码作废', async ({ browser, request }) => {
  const { code, headers } = await createRoom(request);
  const account = await (
    await request.post(`${SERVER}/identity/init`, { data: { nickname: '恢复受邀玩家' } })
  ).json();
  const context = await visitor(browser);
  const page = await context.newPage();
  await page.goto(`/invite/${code}`);
  await page.getByTestId('lobby-restore-toggle').click();
  await page.getByTestId('lobby-restore-input').fill(account.recoveryCode);
  await page.getByTestId('lobby-restore-submit').click();
  await expect(page.getByTestId('recovery-code-dialog')).toBeVisible();
  await expect(page.getByTestId('recovery-code-value')).not.toHaveText(account.recoveryCode);
  expect(
    (await (await request.get(`${SERVER}/rooms/code/${code}`, { headers })).json()).players,
  ).toHaveLength(1);
  await expectRecoveryConfirmationAfterReload(page, code);
  await expect(page.getByTestId('recovery-code-old-revoked')).toBeVisible();
  expect(
    (await (await request.get(`${SERVER}/rooms/code/${code}`, { headers })).json()).players,
  ).toHaveLength(1);
  await page.getByTestId('recovery-code-confirm').click();
  await expect(page).toHaveURL(new RegExp(`/room/${code}$`));
  await expect(page.getByTestId('room-players')).toContainText('恢复受邀玩家');
  expect(
    (await (await request.get(`${SERVER}/rooms/code/${code}`, { headers })).json()).players,
  ).toHaveLength(2);
  const oldCode = await request.post(`${SERVER}/identity/recover`, {
    data: { code: account.recoveryCode },
  });
  expect(oldCode.ok()).toBe(false);
  await context.close();
});

test('真实房间已满与服务端非法邀请都有明确出口', async ({ browser, request }) => {
  const { code, headers } = await createRoom(request);
  expect((await request.post(`${SERVER}/rooms/${code}/fill-ai`, { headers })).ok()).toBe(true);
  const account = await (
    await request.post(`${SERVER}/identity/init`, { data: { nickname: '候补玩家' } })
  ).json();
  const context = await visitor(browser);
  await context.addInitScript((account) => {
    localStorage.setItem('icgame-token', account.token);
    localStorage.setItem(
      'icgame-identity',
      JSON.stringify({
        version: 1,
        state: {
          playerId: account.playerId,
          token: account.token,
          nickname: account.nickname,
          avatarSeed: '',
        },
      }),
    );
  }, account);
  const page = await context.newPage();
  await page.goto(`${SERVER}/invite/${code}`);
  await expect(page.getByRole('alert')).toContainText('房间已满');
  await page.getByRole('link', { name: '返回大厅', exact: true }).click();
  await expect(page.getByTestId('lobby-create')).toBeVisible();
  await page.goto(`${SERVER}/invite/bad`);
  await expect(page.getByRole('alert')).toContainText('房间码');
  await page.getByRole('link', { name: '返回大厅', exact: true }).click();
  await expect(page).toHaveURL(/\/lobby$/);
  await context.close();
});
