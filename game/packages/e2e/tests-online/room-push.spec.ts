// 房间等待页的实时推送与邀请链接：全内存服务端 + 两个浏览器上下文
//
// 房间成员变化（加入、补 Bot、开始）由服务端推送，不靠轮询；推送只发给房间成员；
// 邀请链接对预览抓取器返回分享卡片，对浏览器跳转到房间页。

import { test, expect, type Browser, type Page } from '@playwright/test';

const SERVER_URL = 'http://localhost:3101';

interface Tab {
  page: Page;
  /** 页面发出的 GET /rooms/code/:code 次数（轮询） */
  polls: () => number;
  /** 页面发出过的 /rooms 命名空间连接帧 */
  roomSocketFrames: string[];
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
  let polls = 0;
  const roomSocketFrames: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'GET' && /\/rooms\/code\//.test(req.url())) polls += 1;
  });
  page.on('websocket', (ws) => {
    ws.on('framesent', (frame) => {
      if (typeof frame.payload === 'string' && frame.payload.startsWith('40/rooms')) {
        roomSocketFrames.push(frame.payload);
      }
    });
  });
  await page.goto('/lobby');
  await page.locator('#lobby-nickname').fill(name);
  await page.getByRole('button', { name: /继续|Continue/ }).click();
  await expect(page.getByTestId('recovery-code-value')).toBeVisible();
  await page.getByTestId('recovery-code-confirm').click();
  await expect(page.getByTestId('lobby-create')).toBeVisible();
  return { page, polls: () => polls, roomSocketFrames };
}

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

    // 房主页面的推送连接建立后才不再轮询
    await expect.poll(() => a.roomSocketFrames.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(a.roomSocketFrames[0]).toContain(`"code":"${code}"`);
    const pollsBefore = a.polls();

    await b.page.locator('#lobby-joinCode').fill(code);
    await b.page.getByTestId('lobby-join').click();
    await expect(b.page).toHaveURL(new RegExp(`/room/${code}`));

    // 轮询兜底是 15 秒一次；这里 5 秒内就看到了，只能是推送
    await expect(a.page.getByTestId('room-count')).toContainText('2 / 4', { timeout: 5_000 });
    await expect(b.page.getByTestId('room-count')).toContainText('2 / 4', { timeout: 5_000 });

    await a.page.getByTestId('room-fill-ai').click();
    await expect(b.page.getByTestId('room-count')).toContainText('4 / 4', { timeout: 5_000 });
    // 乙不是房主：看不到开始按钮
    await expect(b.page.getByTestId('room-start')).toHaveCount(0);

    // 房主开始游戏：乙的页面被推送带进对局，没有轮询也没有刷新
    await a.page.getByTestId('room-start').click();
    await expect(b.page).toHaveURL(/\/game\//, { timeout: 10_000 });
    expect(a.polls() - pollsBefore).toBe(0);
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
    expect(redirect.headers()['location']).toBe(`/room/${code}`);
  } finally {
    await a.page.context().close();
    await b.page.context().close();
  }
});
