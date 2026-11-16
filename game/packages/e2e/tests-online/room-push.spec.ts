// 房间等待页的实时推送与邀请链接：全内存服务端 + 两个浏览器上下文
//
// 房间成员变化（加入、补 Bot、开始）由服务端推送，不靠轮询；推送只发给房间成员；
// 邀请链接对预览抓取器返回分享卡片，对浏览器跳转到房间页。

import { test, expect, type Browser, type Page } from '@playwright/test';

const SERVER_URL = 'http://localhost:13101';

interface Tab {
  page: Page;
  /** 页面发出过的 /rooms 命名空间连接帧 */
  roomSocketFrames: string[];
  roomPushes: { code: string; status: string; players: unknown[] }[];
}

async function openTab(browser: Browser, name: string): Promise<Tab> {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    try {
      localStorage.setItem('icgame-copyright-ack', '1');
    } catch {
      /* 存储不可用时忽略 */
    }
  });
  const page = await context.newPage();
  const roomSocketFrames: string[] = [];
  const roomPushes: Tab['roomPushes'] = [];
  page.on('websocket', (ws) => {
    ws.on('framesent', (frame) => {
      if (typeof frame.payload === 'string' && frame.payload.startsWith('40/rooms')) {
        roomSocketFrames.push(frame.payload);
      }
    });
    ws.on('framereceived', ({ payload }) => {
      const prefix = '42/rooms,';
      if (typeof payload !== 'string' || !payload.startsWith(prefix)) return;
      const [event, message] = JSON.parse(payload.slice(prefix.length)) as [
        string,
        { room: Tab['roomPushes'][number] },
      ];
      if (event === 'icg:room') roomPushes.push(message.room);
    });
  });
  await page.goto('/lobby');
  await page.locator('#lobby-nickname').fill(name);
  await page.getByRole('button', { name: /继续|Continue/ }).click();
  await expect(page.getByTestId('recovery-code-value')).toBeVisible();
  await page.getByTestId('recovery-code-confirm').click();
  await expect(page.getByTestId('lobby-create')).toBeVisible();
  return { page, roomSocketFrames, roomPushes };
}

test('大厅可筛选公开房间并直接加入，默认建房保持私密', async ({ browser }) => {
  const host = await openTab(browser, '公开房主');
  const guest = await openTab(browser, '公开访客');
  try {
    const create = host.page.getByTestId('lobby-create');
    await create.click();
    await expect(host.page).toHaveURL(/\/room\/[A-Z0-9]{6}$/);
    const privateCode = host.page.url().split('/').at(-1)!;
    await host.page.goto('/lobby');
    await host.page.locator('#lobby-maxPlayers').selectOption('4');
    const options = host.page.getByText(/^(房间选项|Room Options)$/);
    await options.click();
    await host.page
      .getByRole('checkbox', { name: /在公开房间列表显示|Show in public rooms/ })
      .check();
    await host.page.locator('#lobby-series').selectOption('5');
    await options.click();
    await expect(host.page.locator('summary')).toContainText(/公开|Public/);
    await expect(host.page.locator('summary')).toContainText('BO5');
    await create.click();
    await expect(host.page).toHaveURL(/\/room\/[A-Z0-9]{6}$/);
    const publicCode = host.page.url().split('/').at(-1)!;
    await expect(host.page.getByText(/0 \/ 5/)).toBeVisible();

    const section = guest.page.getByRole('region', { name: /公开房间|Public Rooms/ });
    await section.getByRole('button', { name: /刷新公开房间|Refresh public rooms/ }).click();
    const joinPublic = section.getByRole('button', { name: new RegExp(publicCode) });
    await expect(joinPublic).toBeVisible();
    await expect(section.getByText(privateCode)).toHaveCount(0);
    await section.getByRole('combobox').selectOption('5');
    await expect(section.getByText(/暂无可加入|No public rooms/)).toBeVisible();
    await section.getByRole('combobox').selectOption('4');
    await joinPublic.click();
    await expect(guest.page).toHaveURL(new RegExp(`/room/${publicCode}$`));
    await expect(host.page.getByTestId('room-count')).toContainText('2 / 4');
  } finally {
    await host.page.context().close();
    await guest.page.context().close();
  }
});

test('成员加入与补 Bot 即时出现在房主页面上，不靠轮询；推送带房间码与令牌握手', async ({
  browser,
}) => {
  const a = await openTab(browser, '推送甲');
  const b = await openTab(browser, '推送乙');
  try {
    await a.page.locator('#lobby-maxPlayers').selectOption('4');
    await a.page.getByTestId('lobby-create').click();
    await expect(a.page).toHaveURL(/\/room\/[A-Z0-9]{6}/);
    const code = /\/room\/([A-Z0-9]{6})/.exec(a.page.url())![1]!;
    await expect(a.page.getByTestId('room-count')).toContainText('1 / 4');

    await expect
      .poll(() => a.roomPushes.some((room) => room.code === code && room.players.length === 1))
      .toBe(true);
    expect(a.roomSocketFrames[0]).toContain(`"code":"${code}"`);
    expect(a.roomSocketFrames[0]?.includes('"token":"')).toBe(true);

    await b.page.locator('#lobby-joinCode').fill(code);
    await b.page.getByTestId('lobby-join').click();
    await expect(b.page).toHaveURL(new RegExp(`/room/${code}`));

    await expect
      .poll(() => a.roomPushes.some((room) => room.code === code && room.players.length === 2))
      .toBe(true);
    await expect(a.page.getByTestId('room-count')).toContainText('2 / 4', { timeout: 5_000 });
    await expect(b.page.getByTestId('room-count')).toContainText('2 / 4', { timeout: 5_000 });

    await a.page.getByTestId('room-fill-ai').click();
    await expect
      .poll(() => b.roomPushes.some((room) => room.code === code && room.players.length === 4))
      .toBe(true);
    await expect(b.page.getByTestId('room-count')).toContainText('4 / 4', { timeout: 5_000 });
    // 乙不是房主：看不到开始按钮
    await expect(b.page.getByTestId('room-start')).toHaveCount(0);

    // 房主开始游戏：乙的页面被推送带进对局，没有轮询也没有刷新
    await a.page.getByTestId('room-start').click();
    await expect
      .poll(() => b.roomPushes.some((room) => room.code === code && room.status === 'playing'))
      .toBe(true);
    await expect(b.page).toHaveURL(/\/game\//, { timeout: 10_000 });
  } finally {
    await a.page.context().close();
    await b.page.context().close();
  }
});

test('邀请链接：浏览器落到房间页；预览抓取器拿到不含成员昵称的分享卡片', async ({
  browser,
  request,
}) => {
  const a = await openTab(browser, '邀请甲');
  const b = await openTab(browser, '邀请乙');
  try {
    await a.page.getByTestId('lobby-create').click();
    await expect(a.page).toHaveURL(/\/room\/[A-Z0-9]{6}/);
    const code = /\/room\/([A-Z0-9]{6})/.exec(a.page.url())![1]!;

    // 房间页显示的邀请链接就是 /invite/房间码
    const link = await a.page.getByTestId('room-share-link').inputValue();
    expect(link.endsWith(`/invite/${code}`)).toBe(true);

    // 乙点开邀请链接 → 落到房间页并加入
    await b.page.goto(`/invite/${code.toLowerCase()}`);
    await expect(b.page).toHaveURL(new RegExp(`/room/${code}$`));
    await expect(b.page.getByTestId('room-count')).toContainText('2 /');

    // 服务端对抓取器返回分享卡片
    const card = await request.get(`${SERVER_URL}/invite/${code}`, {
      headers: { 'user-agent': 'facebookexternalhit/1.1' },
    });
    expect(card.status()).toBe(200);
    const html = await card.text();
    expect(html).toContain('og:title');
    expect(html).toContain(code);
    expect(html).not.toContain('邀请甲');
    expect(html).not.toContain('邀请乙');

    // 服务端对浏览器重定向到房间页
    const redirect = await request.get(`${SERVER_URL}/invite/${code}`, {
      maxRedirects: 0,
      headers: { 'user-agent': 'Mozilla/5.0 Chrome/126' },
    });
    expect(redirect.status()).toBe(302);
    expect(redirect.headers()['location']).toBe(new URL(`/room/${code}`, link).href);
  } finally {
    await a.page.context().close();
    await b.page.context().close();
  }
});
