// 联机对局里的社交功能：像素头像经服务端到达每个人的界面、预设短语在两个浏览器之间收发
//
// 服务端是全内存的开发服务（见 playwright.online.config.ts）。这里不打完整局，进了对局就验证。

import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

interface Player {
  name: string;
  context: BrowserContext;
  page: Page;
  /** 页面收到的全部 websocket 文本帧原文 */
  frames: string[];
}

async function newPlayer(browser: Browser, name: string): Promise<Player> {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    try {
      localStorage.setItem('icgame-copyright-ack', '1');
    } catch {
      /* 存储不可用时忽略 */
    }
  });
  const page = await context.newPage();
  const player: Player = { name, context, page, frames: [] };
  page.on('websocket', (ws) => {
    ws.on('framereceived', (frame) => {
      if (typeof frame.payload === 'string') player.frames.push(frame.payload);
    });
  });
  return player;
}

async function createProfile(player: Player): Promise<void> {
  await player.page.goto('/lobby');
  await player.page.locator('#lobby-nickname').fill(player.name);
  await player.page.getByRole('button', { name: /继续|Continue/ }).click();
  await player.page.getByTestId('recovery-code-confirm').click();
  await expect(player.page.getByTestId('lobby-create')).toBeVisible();
}

/** 该玩家收到的第一帧对局状态里的座位号 */
function seatOf(player: Player): string {
  for (const raw of player.frames) {
    const m = /^42\d*(\[.*)$/s.exec(raw);
    if (!m) continue;
    const [event, payload] = JSON.parse(m[1]!) as [string, { seat?: string }];
    if (event === 'icg:state' && payload.seat) return payload.seat;
  }
  throw new Error(`${player.name} 还没收到对局状态`);
}

test('头像：换一个后保存到账号，房间成员列表与对局座位上别人看到的是同一个头像', async ({
  browser,
}) => {
  const a = await newPlayer(browser, '甲甲');
  const b = await newPlayer(browser, '乙乙');
  try {
    await createProfile(a);
    await createProfile(b);

    // 甲在大厅摇一个新头像：保存成功后换图，刷新页面后仍是它（账号上存着）
    const avatarA = a.page.getByTestId('lobby-avatar').getByTestId('pixel-avatar');
    const before = await avatarA.getAttribute('data-seed');
    await a.page.getByTestId('lobby-avatar-roll').click();
    await expect.poll(() => avatarA.getAttribute('data-seed')).not.toBe(before);
    const rolled = (await avatarA.getAttribute('data-seed'))!;
    await a.page.reload();
    await expect(a.page.getByTestId('lobby-avatar').getByTestId('pixel-avatar')).toHaveAttribute(
      'data-seed',
      rolled,
    );

    // 甲建房、乙加入：乙的房间成员列表里，甲的头像就是甲刚摇出的那个
    await a.page.locator('#lobby-maxPlayers').selectOption('4');
    await a.page.getByTestId('lobby-create').click();
    await expect(a.page).toHaveURL(/\/room\/[A-Z0-9]{6}/);
    const code = /\/room\/([A-Z0-9]{6})/.exec(a.page.url())![1]!;
    await b.page.locator('#lobby-joinCode').fill(code);
    await b.page.getByTestId('lobby-join').click();
    await expect(b.page).toHaveURL(new RegExp(`/room/${code}`));
    const seeds = async (p: Player): Promise<string[]> =>
      p.page
        .getByTestId('room-players')
        .locator('[data-testid="pixel-avatar"]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-seed') ?? ''));
    await expect.poll(async () => (await seeds(b)).length).toBe(2);
    expect(await seeds(b)).toContain(rolled);
    expect(new Set(await seeds(b)).size).toBe(2);

    await a.page.getByTestId('room-fill-ai').click();
    await a.page.getByTestId('room-start').click();
    for (const p of [a, b]) {
      await expect(p.page).toHaveURL(/\/game\//, { timeout: 15_000 });
      await expect(p.page.getByTestId('turn-indicator')).toBeVisible({ timeout: 20_000 });
    }

    // 对局里：乙的界面上甲的座位（未翻露时是头像，翻露后是角色卡面 + 角标）带着同一个头像种子
    const seatA = seatOf(a);
    await expect(
      b.page.getByTestId(`player-seat-${seatA}`).locator('[data-testid="pixel-avatar"]').first(),
    ).toHaveAttribute('data-seed', rolled);
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

test('预设短语：一方发送，另一方在其座位旁看到气泡；冷却内再发被拦下；Bot 座位不会说话', async ({
  browser,
}) => {
  const a = await newPlayer(browser, '甲话');
  const b = await newPlayer(browser, '乙听');
  try {
    await createProfile(a);
    await createProfile(b);
    await a.page.locator('#lobby-maxPlayers').selectOption('4');
    await a.page.getByTestId('lobby-create').click();
    await expect(a.page).toHaveURL(/\/room\/[A-Z0-9]{6}/);
    const code = /\/room\/([A-Z0-9]{6})/.exec(a.page.url())![1]!;
    await b.page.locator('#lobby-joinCode').fill(code);
    await b.page.getByTestId('lobby-join').click();
    await expect(b.page).toHaveURL(new RegExp(`/room/${code}`));
    await a.page.getByTestId('room-fill-ai').click();
    await a.page.getByTestId('room-start').click();
    for (const p of [a, b]) {
      await expect(p.page).toHaveURL(/\/game\//, { timeout: 15_000 });
      await expect(p.page.getByTestId('turn-indicator')).toBeVisible({ timeout: 20_000 });
    }
    const seatA = seatOf(a);

    // 甲打开短语面板发一条「大家好！」
    await a.page.getByTestId('chat-toggle').click();
    await a.page.getByTestId('chat-phrase-greet_hi').click();

    // 乙在甲的座位旁看到气泡，文字按乙本机的语言渲染；甲自己的座位旁也有
    const bubbleOnB = b.page.getByTestId(`chat-bubble-${seatA}`);
    await expect(bubbleOnB).toBeVisible({ timeout: 10_000 });
    await expect(bubbleOnB).toHaveText('大家好！');
    await expect(bubbleOnB).toHaveAttribute('data-phrase', 'greet_hi');
    await expect(a.page.getByTestId(`chat-bubble-${seatA}`)).toBeVisible();

    // 乙的最近消息里有这一条，署名是甲的座位昵称
    await b.page.getByTestId('chat-toggle').click();
    await b.page.getByTestId('chat-recent-toggle').click();
    await expect(b.page.getByTestId('chat-recent')).toContainText('大家好！');
    await expect(b.page.getByTestId('chat-recent')).toContainText('甲话');

    // 网络上流动的只有短语 id，没有文案；冷却内（3 秒）甲的按钮不可点
    const chatFrames = b.frames.filter((f) => f.includes('icg:chatMessage'));
    expect(chatFrames.length).toBeGreaterThanOrEqual(1);
    expect(chatFrames.every((f) => f.includes('greet_hi'))).toBe(true);
    await a.page.getByTestId('chat-toggle').click();
    await expect(a.page.getByTestId('chat-phrase-greet_gl')).toBeDisabled();

    // 气泡几秒后消失
    await expect(bubbleOnB).toHaveCount(0, { timeout: 10_000 });

    // Bot 座位从不发言：整个过程里只有甲这一个发送者
    const senders = new Set(
      b.frames
        .filter((f) => f.includes('icg:chatMessage'))
        .map((f) => /"sender":"(\d+)"/.exec(f)?.[1]),
    );
    expect([...senders]).toEqual([seatA]);
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
