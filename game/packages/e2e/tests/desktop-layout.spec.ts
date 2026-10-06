// 桌面端对局布局（≥1024px）E2E：固定场景下的版面结构、响应窗口、不同人数与小视口下的几何约束
// 只在桌面视口运行；移动布局见 mobile-layout.spec.ts。

import type { Page } from '@playwright/test';
import {
  test,
  expect,
  isMobileProject,
  isNarrowViewport,
  waitForAppReady,
} from './fixtures/index.js';

type Box = { x: number; y: number; width: number; height: number };

test.beforeEach(({ page }, testInfo) => {
  test.skip(
    isMobileProject(testInfo.project.name) || isNarrowViewport(page),
    '桌面布局只在桌面视口下运行',
  );
});

async function openScene(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await waitForAppReady(page);
  await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
  // 中央舞台是按需加载的独立 chunk，等它出现再量版面
  await expect(page.getByTestId('center-stage').getByTestId('layer-tower')).toBeVisible({
    timeout: 10_000,
  });
}

/** 整页没有滚动条：内容高宽都不超过视口 */
async function expectNoScroll(page: Page): Promise<void> {
  const m = await page.evaluate(() => ({
    sh: document.documentElement.scrollHeight,
    ch: document.documentElement.clientHeight,
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(m.sh, '纵向无滚动条').toBeLessThanOrEqual(m.ch);
  expect(m.sw, '横向无滚动条').toBeLessThanOrEqual(m.cw);
}

async function seatBoxes(page: Page): Promise<Array<{ id: string; box: Box }>> {
  const seats = page.locator('[data-testid^="player-seat-"]');
  const count = await seats.count();
  const out: Array<{ id: string; box: Box }> = [];
  for (let i = 0; i < count; i++) {
    const seat = seats.nth(i);
    const id = ((await seat.getAttribute('data-testid')) ?? '').replace('player-seat-', '');
    const box = await seat.boundingBox();
    expect(box, `座位 ${id} 有包围盒`).not.toBeNull();
    out.push({ id, box: box! });
  }
  return out;
}

const overlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width - 0.5 &&
  b.x < a.x + a.width - 0.5 &&
  a.y < b.y + b.height - 0.5 &&
  b.y < a.y + a.height - 0.5;

/** 所有座位都在视口内、两两不重叠、也不压到中央舞台 */
async function expectSeatsClean(page: Page, expectedCount: number): Promise<void> {
  const viewport = page.viewportSize()!;
  const seats = await seatBoxes(page);
  expect(seats).toHaveLength(expectedCount);
  for (const { id, box } of seats) {
    expect(box.x, `${id} 左边界`).toBeGreaterThanOrEqual(0);
    expect(box.y, `${id} 上边界`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${id} 右边界`).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height, `${id} 下边界`).toBeLessThanOrEqual(viewport.height);
  }
  for (let i = 0; i < seats.length; i++) {
    for (let j = i + 1; j < seats.length; j++) {
      expect(
        overlap(seats[i]!.box, seats[j]!.box),
        `座位 ${seats[i]!.id} 与 ${seats[j]!.id} 不重叠`,
      ).toBe(false);
    }
  }
  const center = await page.getByTestId('center-stage').boundingBox();
  expect(center).not.toBeNull();
  for (const { id, box } of seats) {
    expect(overlap(box, center!), `座位 ${id} 不压中央舞台`).toBe(false);
  }
}

async function expectInViewport(page: Page, selector: string): Promise<void> {
  const viewport = page.viewportSize()!;
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${selector} 有包围盒`).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
}

test.describe('桌面布局 · 固定场景', () => {
  test('片头条、座位环、中央舞台、坞可见，整页无滚动条', async ({ page }) => {
    await openScene(page, '/game/debug');

    await expect(page.getByTestId('local-runtime')).toHaveAttribute('data-layout', 'desktop');
    await expect(page.getByTestId('desktop-topbar')).toBeVisible();
    await expect(page.getByTestId('turn-indicator')).toBeVisible();
    await expect(page.getByTestId('center-stage')).toBeVisible();
    await expect(page.getByTestId('hand-dock')).toBeVisible();
    await expect(page.getByTestId('human-hand')).toBeVisible();
    await expect(page.getByTestId('copyright-line')).toBeVisible();

    // 缺省 6 人局：本人在坞里，座位环上是其余 5 人
    await expectSeatsClean(page, 5);
    // 旧弹窗不再出现，旧的玩家明细 / 层级总览折叠区也不再有
    await expect(page.getByTestId('unlock-response-dialog')).toHaveCount(0);
    await expectNoScroll(page);
  });

  test('中央舞台：自上而下 L4 → L0 五行，金库缩略图点开详情且不能翻面', async ({ page }) => {
    await openScene(page, '/game/debug');
    const rows = page.getByTestId('center-stage').locator('[data-testid^="layer-row-"]');
    await expect(rows).toHaveCount(5);
    await expect(rows.first()).toHaveAttribute('data-testid', 'layer-row-4');
    await expect(rows.last()).toHaveAttribute('data-testid', 'layer-row-0');

    // 点另一层把它设为焦点层
    await page.getByTestId('layer-focus-4').click();
    await expect(page.getByTestId('layer-row-4')).toHaveAttribute('data-focus', 'true');

    // 金库详情：能打开，但没有翻面按钮
    await page.locator('[data-testid^="vault-thumb-"]').first().click();
    const detail = page.getByRole('dialog');
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('button', { name: /翻面|flip/i })).toHaveCount(0);
  });

  test('点一张牌后出现「打出」按钮，再点才进入出牌流程', async ({ page }) => {
    await openScene(page, '/game/debug');
    await expect(page.getByTestId('hand-commit-play')).toHaveCount(0);

    const shoot = page.locator('[data-testid^="card-"][title="SHOOT"]').first();
    await shoot.click();
    await expect(page.getByTestId('hand-commit-play')).toBeVisible();
    // 选中只是读牌，还没有弹出选目标弹窗
    await expect(page.getByTestId('target-player-picker-dialog')).toHaveCount(0);

    await page.getByTestId('hand-commit-play').click();
    await expect(page.getByTestId('target-player-picker-dialog')).toBeVisible();
  });

  test('座位只看不选：点未翻露座位的角色卡不会打开任何弹窗', async ({ page }) => {
    await openScene(page, '/game/debug');
    const hidden = page.locator('[data-testid^="player-avatar-"]:disabled').first();
    await expect(hidden).toBeVisible();
    await expect(page.getByTestId('target-player-picker-dialog')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('梦主视角：能看到各层梦魇，坞里是梦主身份，环上没有梦主座位', async ({ page }) => {
    await openScene(page, '/game/debug?as=master');
    await expect(page.getByTestId('nightmare-tag').first()).toBeVisible();
    await expect(page.locator('[data-testid^="player-seat-"][data-master]')).toHaveCount(0);
    await expectSeatsClean(page, 5);
    await expectNoScroll(page);
  });

  test('pending=1：响应窗口在舞台右上，两个按钮可见，没有弹窗', async ({ page }) => {
    await openScene(page, '/game/debug?pending=1');

    const win = page.getByTestId('unlock-response-window');
    await expect(win).toBeVisible();
    await expect(page.getByTestId('unlock-response-cancel')).toBeVisible();
    await expect(page.getByTestId('unlock-response-pass')).toBeVisible();
    await expect(page.getByTestId('unlock-response-dialog')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // 响应窗口在视口右半边的上方，座位不被它压住
    const viewport = page.viewportSize()!;
    const box = await win.boundingBox();
    expect(box!.x).toBeGreaterThan(viewport.width / 2);
    expect(box!.y).toBeLessThan(viewport.height / 3);
    await expectSeatsClean(page, 5);
    const seats = await seatBoxes(page);
    for (const { id, box: s } of seats) expect(overlap(s, box!), `${id} 不压响应窗口`).toBe(false);
    await expectNoScroll(page);
  });
});

test.describe('桌面布局 · 不同人数', () => {
  for (const players of [4, 6, 8, 10]) {
    test(`${players} 人：座位都在视口内、两两不重叠、整页无滚动条`, async ({ page }) => {
      await openScene(page, `/game/debug?players=${players}`);
      await expectSeatsClean(page, players - 1);
      await expectNoScroll(page);
    });
  }

  test('players 参数非法时回落缺省 6 人', async ({ page }) => {
    await openScene(page, '/game/debug?players=99');
    await expectSeatsClean(page, 5);
  });

  test('梦主视角下 10 人：环上是 9 个盗梦者', async ({ page }) => {
    await openScene(page, '/game/debug?as=master&players=10');
    await expectSeatsClean(page, 9);
    await expectNoScroll(page);
  });
});

test.describe('桌面布局 · 1024×768', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  for (const [name, url, seatsExpected] of [
    ['缺省', '/game/debug', 5],
    ['10 人', '/game/debug?players=10', 9],
    ['4 人', '/game/debug?players=4', 3],
    ['响应窗口 + 9 人', '/game/debug?pending=1&players=9', 8],
  ] as const) {
    test(`${name}：无滚动条、座位不重叠、主操作按钮在视口内`, async ({ page }) => {
      await openScene(page, url);
      await expectNoScroll(page);
      await expectSeatsClean(page, seatsExpected);
      // 主操作随阶段变化（抽牌 / 结束行动 / 等待…），按它们共同的 testid 前缀取
      await expectInViewport(page, '[data-testid^="action-"]');
      await expectInViewport(page, '[data-testid="dock-skill"]');
      await expectInViewport(page, '[data-testid="copyright-line"]');
    });
  }

  test('手牌很多时坞内横向滚动，不撑高坞', async ({ page }) => {
    await openScene(page, '/game/debug');
    const dock = page.getByTestId('hand-dock');
    const before = await dock.boundingBox();
    // 把手牌区压窄，模拟手牌超出可视宽度
    await page.getByTestId('human-hand').evaluate((el) => {
      (el as HTMLElement).style.maxWidth = '160px';
    });
    const after = await dock.boundingBox();
    expect(after!.height).toBe(before!.height);
    const scrollable = await page
      .getByTestId('human-hand')
      .evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(scrollable).toBe(true);
    await expectNoScroll(page);
  });
});
