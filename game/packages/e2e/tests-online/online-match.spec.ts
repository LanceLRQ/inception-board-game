// 联机对局端到端：两个浏览器上下文各自建档，同一房间里打完一局
//
// 服务端是全内存的开发服务（见 playwright.online.config.ts），无人操作的座位由服务端按短时长代发。
// 覆盖：房间到对局的跳转、手牌信息隔离、真人合法操作、刷新后回到同一局、两边胜方一致、
// 以及整个过程中收到的实时帧不含随机种子与随机状态。

import { test, expect, type BrowserContext, type Page } from '@playwright/test';

/** 一个浏览器里的玩家：页面 + 收集到的实时帧 */
interface Player {
  name: string;
  context: BrowserContext;
  page: Page;
  /** 页面收到的全部 websocket 文本帧原文 */
  frames: string[];
  /** 界面按钮被成功点击的次数 */
  clicks: number;
}

interface StateFrame {
  seat: string;
  view: {
    ctx: { gameover?: unknown };
    G: { players?: Record<string, { hand?: unknown; handCount?: number }> };
  };
}

async function newPlayer(
  browser: import('@playwright/test').Browser,
  name: string,
): Promise<Player> {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    try {
      localStorage.setItem('icgame-copyright-ack', '1');
    } catch {
      /* 存储不可用时忽略 */
    }
  });
  const page = await context.newPage();
  const player: Player = { name, context, page, frames: [], clicks: 0 };
  page.on('websocket', (ws) => {
    ws.on('framereceived', (frame) => {
      if (typeof frame.payload === 'string') player.frames.push(frame.payload);
    });
  });
  return player;
}

/** 解析 socket.io 事件帧（形如 42["事件名",{...}]）；其他帧返回 null */
function parseEvent(raw: string): { event: string; payload: unknown } | null {
  const m = /^42\d*(\[.*)$/s.exec(raw);
  if (!m) return null;
  try {
    const [event, payload] = JSON.parse(m[1]!) as [string, unknown];
    return { event, payload };
  } catch {
    return null;
  }
}

function stateFrames(player: Player): StateFrame[] {
  const out: StateFrame[] = [];
  for (const raw of player.frames) {
    const ev = parseEvent(raw);
    if (ev && (ev.event === 'icg:state' || ev.event === 'icg:step')) {
      out.push(ev.payload as StateFrame);
    }
  }
  return out;
}

/** 服务端回给该玩家的 icg:moveResult 里 ok 为 true 的条数：真人的 move 确实被接受 */
function acceptedMoves(player: Player): number {
  let n = 0;
  for (const raw of player.frames) {
    const ev = parseEvent(raw);
    if (ev?.event !== 'icg:moveResult') continue;
    if ((ev.payload as { ok?: boolean }).ok === true) n += 1;
  }
  return n;
}

/** 该玩家最近一帧视图里某座位的手牌张数 */
function latestHandCount(player: Player, seat: string): number | undefined {
  const frames = stateFrames(player);
  for (let i = frames.length - 1; i >= 0; i--) {
    const count = frames[i]!.view.G.players?.[seat]?.handCount;
    if (typeof count === 'number') return count;
  }
  return undefined;
}

async function createProfile(player: Player): Promise<void> {
  await player.page.goto('/lobby');
  await player.page.locator('#lobby-nickname').fill(player.name);
  await player.page.getByRole('button', { name: /继续|Continue/ }).click();
  // 建档后会弹出恢复码弹窗，必须确认才能继续；格式为 XXXX-XXXX
  await expect(player.page.getByTestId('recovery-code-value')).toHaveText(
    /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/,
  );
  await player.page.getByTestId('recovery-code-confirm').click();
  await expect(player.page.getByTestId('lobby-create')).toBeVisible();
}

async function currentTurn(page: Page): Promise<number> {
  const text =
    (await page
      .getByText(/回合\s*\d+/)
      .first()
      .textContent({ timeout: 2_000 })) ?? '';
  return Number(/回合\s*(\d+)/.exec(text)?.[1] ?? 0);
}

/** 轮到自己时做最简单的合法操作；返回本轮是否点击过。其余座位交给服务端超时代发 */
async function actOnce(page: Page): Promise<boolean> {
  const draw = page.getByTestId('action-draw');
  const end = page.getByTestId('action-end');
  const skip = page.getByTestId('action-skip-discard');
  const confirm = page.getByTestId('action-confirm-discard');
  // 轮到本人应答（被 SHOOT 时的响应、处女等）：能放弃就放弃；没有放弃选项的（天秤分牌等）留给服务端到时限代答
  const decline = page.locator('[data-testid^="awaited-action-"][data-decline="true"]').first();
  if (await decline.isVisible()) {
    await decline.click({ timeout: 1_500 });
    return true;
  }
  if (await draw.isVisible()) {
    await draw.click({ timeout: 1_500 });
    return true;
  }
  if (await end.isVisible()) {
    await end.click({ timeout: 1_500 });
    return true;
  }
  if (await skip.isVisible()) {
    await skip.click({ timeout: 1_500 });
    return true;
  }
  if (await confirm.isVisible()) {
    // 按钮文案形如「确认弃牌（0/N）」，N 为必须弃掉的张数；弃牌选择按手牌位置记录，同名牌也能同时选中
    const required = Number(/\/\s*(\d+)/.exec((await confirm.textContent()) ?? '')?.[1]);
    const cards = page.getByTestId('human-hand').locator('[data-testid^="card-"]');
    const count = await cards.count();
    let picked = 0;
    for (let i = 0; i < count && picked < required; i++) {
      await cards.nth(i).click({ timeout: 1_500 });
      picked += 1;
    }
    if (picked === required && (await confirm.isEnabled())) {
      await confirm.click({ timeout: 1_500 });
      return true;
    }
  }
  return false;
}

/** 持续操作直到出现结束画面；页面刷新、元素消失等瞬时错误忽略后重试 */
async function playUntilOver(player: Player, state: { over: boolean }): Promise<void> {
  const banner = player.page.getByTestId('winner-banner');
  while (!state.over) {
    try {
      if (await banner.isVisible()) return;
      if (await actOnce(player.page)) player.clicks += 1;
    } catch {
      /* 页面正在刷新或按钮刚好消失，下一轮重试 */
    }
    await player.page.waitForTimeout(250);
  }
}

test('两个浏览器在同一房间里打完一局', async ({ browser }) => {
  const a = await newPlayer(browser, '甲甲');
  const b = await newPlayer(browser, '乙乙');
  try {
    // 1. 各自建档；甲建房，乙凭房间码加入，甲补 Bot 并开始
    await createProfile(a);
    await createProfile(b);

    await a.page.locator('#lobby-maxPlayers').selectOption('4');
    await a.page.getByTestId('lobby-create').click();
    await expect(a.page).toHaveURL(/\/room\/[A-Z0-9]{6}/);
    const code = /\/room\/([A-Z0-9]{6})/.exec(a.page.url())![1]!;

    await b.page.locator('#lobby-joinCode').fill(code);
    await b.page.getByTestId('lobby-join').click();
    await expect(b.page).toHaveURL(new RegExp(`/room/${code}`));
    await expect(a.page.getByTestId('room-count')).toContainText('2');

    await a.page.getByTestId('room-fill-ai').click();
    await expect(a.page.getByTestId('room-start')).toBeEnabled();
    await a.page.getByTestId('room-start').click();

    // 2. 两边都进入对局界面
    for (const p of [a, b]) {
      await expect(p.page).toHaveURL(/\/game\//, { timeout: 15_000 });
      await expect(p.page.getByTestId('remote-runtime')).toBeVisible();
      await expect(p.page.getByTestId('turn-indicator')).toBeVisible({ timeout: 20_000 });
      await expect(p.page.getByTestId('remote-error')).toHaveCount(0);
    }

    // 每个浏览器只看到自己的手牌牌面，对方座位只有张数
    const seatOf = (p: Player): string => {
      const first = stateFrames(p)[0];
      expect(first, `${p.name} 应已收到对局状态`).toBeDefined();
      return first!.seat;
    };
    const seatA = seatOf(a);
    const seatB = seatOf(b);
    expect(seatA).not.toBe(seatB);
    for (const [me, other] of [
      [a, seatB],
      [b, seatA],
    ] as const) {
      await expect(me.page.getByTestId('human-hand')).toHaveCount(1);
      // 桌面布局里本人不占座位环（由底部坞承载），环上只有其他座位
      await expect(me.page.getByTestId(`player-seat-${seatOf(me)}`)).toHaveCount(0);
      await expect(me.page.getByTestId(`player-seat-${other}`)).toBeVisible();
      // 对方座位上没有任何手牌牌面，只显示张数
      await expect(
        me.page.getByTestId(`player-seat-${other}`).locator('[data-testid^="card-"]'),
      ).toHaveCount(0);
      // 页面上对方座位显示的数字里有该座位最新的手牌张数（手牌数随回合变化，所以轮询对齐）
      await expect
        .poll(
          async () => {
            const expected = latestHandCount(me, other);
            const shown = await me.page
              .getByTestId(`player-seat-${other}`)
              .locator('.tabular-nums')
              .allTextContents();
            return expected !== undefined && shown.some((t) => t.trim() === String(expected));
          },
          { timeout: 10_000 },
        )
        .toBe(true);
    }

    // 3. 轮到自己时做最简单的合法操作，直到出现结束画面
    const state = { over: false };
    const driving = Promise.all([playUntilOver(a, state), playUntilOver(b, state)]);

    // 4. 乙中途刷新页面，回到同一局且回合数不小于刷新前
    await expect.poll(() => currentTurn(b.page), { timeout: 120_000 }).toBeGreaterThanOrEqual(2);
    const urlBefore = b.page.url();
    const turnBefore = await currentTurn(b.page);
    await b.page.reload();
    await expect(b.page).toHaveURL(urlBefore);
    await expect(b.page.getByTestId('remote-runtime')).toBeVisible();
    await expect(b.page.getByTestId('turn-indicator')).toBeVisible({ timeout: 20_000 });
    await expect(b.page.getByTestId('remote-error')).toHaveCount(0);
    expect(await currentTurn(b.page)).toBeGreaterThanOrEqual(turnBefore);

    // 等到结束画面，两边显示同一个胜方
    await expect(a.page.getByTestId('winner-banner')).toBeVisible({ timeout: 4 * 60_000 });
    await expect(b.page.getByTestId('winner-banner')).toBeVisible({ timeout: 30_000 });
    state.over = true;
    await driving;
    const bannerA = (await a.page.getByTestId('winner-banner').locator('h2').textContent()) ?? '';
    const bannerB = (await b.page.getByTestId('winner-banner').locator('h2').textContent()) ?? '';
    expect(bannerA.trim().length).toBeGreaterThan(0);
    expect(bannerA.trim()).toBe(bannerB.trim());

    // 真人的操作确实被服务端接受（超时代发也能打完一局，所以单看胜负不能说明点击生效）
    for (const p of [a, b]) {
      expect(p.clicks, `${p.name} 应至少成功点击过一次操作按钮`).toBeGreaterThan(0);
      expect(acceptedMoves(p), `${p.name} 应至少收到一条 ok 的 moveResult`).toBeGreaterThan(0);
    }

    // 5. 信息隔离：两边收到的实时帧都不含随机种子与随机状态，且他人手牌从未以牌面出现
    for (const p of [a, b]) {
      const views = stateFrames(p);
      expect(views.length).toBeGreaterThan(5);
      expect(p.frames.length).toBeGreaterThan(5);
      for (const raw of p.frames) {
        expect(raw).not.toContain('rngSeed');
        expect(raw).not.toContain('rngState');
      }
      const mine = views[0]!.seat;
      let sawOwnHand = false;
      let checkedOthers = 0;
      for (const frame of views) {
        // 对局结束后全部公开手牌，只检查进行中的视图
        if (frame.view.ctx.gameover !== undefined) continue;
        for (const [seat, player] of Object.entries(frame.view.G.players ?? {})) {
          if (seat === mine) {
            if (Array.isArray(player.hand) && player.hand.length > 0) sawOwnHand = true;
          } else {
            checkedOthers += 1;
            expect(Array.isArray(player.hand), `座位 ${seat} 的手牌不应下发给 ${p.name}`).toBe(
              false,
            );
          }
        }
      }
      expect(sawOwnHand).toBe(true);
      expect(checkedOthers).toBeGreaterThan(10);
    }
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

test('真人一直不操作会被托管，提示条出现，取消托管后提示条消失', async ({ browser }) => {
  const a = await newPlayer(browser, '挂机甲');
  try {
    await createProfile(a);
    await a.page.locator('#lobby-maxPlayers').selectOption('4');
    await a.page.getByTestId('lobby-create').click();
    await expect(a.page).toHaveURL(/\/room\/[A-Z0-9]{6}/);
    await a.page.getByTestId('room-fill-ai').click();
    await expect(a.page.getByTestId('room-start')).toBeEnabled();
    await a.page.getByTestId('room-start').click();

    await expect(a.page).toHaveURL(/\/game\//, { timeout: 15_000 });
    await expect(a.page.getByTestId('turn-indicator')).toBeVisible({ timeout: 20_000 });
    const seat = stateFrames(a)[0]!.seat;

    // 从不点任何按钮：服务端把每一步等满时限（e2e 里约 2.5 秒）后代发，连续两次后转为托管
    const banner = a.page.getByTestId('self-takeover-banner');
    await expect(banner).toBeVisible({ timeout: 60_000 });
    await expect(banner).toContainText(/托管|auto-play/i);
    // 本人的身份块上标出了挂机托管，与别人看到的「这人挂机了」是同一种标识
    const marker = a.page.getByTestId(`seat-marker-idle_takeover-${seat}`);
    await expect(marker).toHaveCount(1);

    // 提示条的按钮点得到，且不挡住操作栏：点击后提示条消失
    await a.page.getByTestId('self-takeover-resume').click();
    await expect(banner).toBeHidden({ timeout: 5_000 });
    await expect(marker).toHaveCount(0);

    // 取消之后座位回到等待真人：继续不操作，再次被托管，说明计数是从 0 重新开始的
    await expect(banner).toBeVisible({ timeout: 60_000 });
  } finally {
    await a.context.close();
  }
});
