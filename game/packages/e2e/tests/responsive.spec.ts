// 响应式冒烟：平板竖屏 / 平板横屏 / 手机横屏 / 360×640 小手机 / 1920×1080 与 2560×1440 大屏
// 固定场景（/game/debug）下：关键区域可见、整页无滚动条、关键元素互不重叠、能选牌并看到「打出」，
// 长按卡牌弹出详情（阈值取自客户端交互配置）、金库详情没有翻面按钮，五个主题在三种窄屏形态下都成立。
// 视口由用例自己指定，只在 desktop-chrome 项目里跑一遍（移动项目的设备视口会被覆盖，重复无意义）。

import type { Page } from '@playwright/test';
import { test, expect, waitForAppReady, waitForAssetsReady } from './fixtures/index.js';
import {
  boxesOverlap,
  expectNoPageScroll,
  readLongPressMs,
  type Box,
} from './fixtures/responsive.js';

interface ViewportCase {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** 期望的布局：宽 ≥1024 桌面，否则移动 */
  readonly layout: 'desktop' | 'mobile';
  /** 移动布局的形态（见客户端 viewportMode） */
  readonly mode?: 'phone' | 'tablet' | 'compact-landscape';
}

const VIEWPORTS: readonly ViewportCase[] = [
  { name: '平板竖屏 768×1024', width: 768, height: 1024, layout: 'mobile', mode: 'tablet' },
  { name: '平板竖屏 820×1180', width: 820, height: 1180, layout: 'mobile', mode: 'tablet' },
  { name: '平板横屏 1024×768', width: 1024, height: 768, layout: 'desktop' },
  { name: '平板横屏 1180×820', width: 1180, height: 820, layout: 'desktop' },
  {
    name: '手机横屏 844×390',
    width: 844,
    height: 390,
    layout: 'mobile',
    mode: 'compact-landscape',
  },
  {
    name: '手机横屏 667×375',
    width: 667,
    height: 375,
    layout: 'mobile',
    mode: 'compact-landscape',
  },
  { name: '小手机 360×640', width: 360, height: 640, layout: 'mobile', mode: 'phone' },
  { name: '大屏 1920×1080', width: 1920, height: 1080, layout: 'desktop' },
  { name: '大屏 2560×1440', width: 2560, height: 1440, layout: 'desktop' },
];

const SCENES = [
  { name: '缺省', url: '/game/debug', players: 6 },
  { name: '响应窗口', url: '/game/debug?pending=1', players: 6 },
  { name: '10 人', url: '/game/debug?players=10', players: 10 },
  { name: '弃牌阶段', url: '/game/debug?discard=1', players: 6 },
  { name: '本人在迷失层（复活入口）', url: '/game/debug?dead=1', players: 6 },
  { name: '同伴在迷失层（复活同伴入口）', url: '/game/debug?dead=mate', players: 6 },
  { name: '梦主（移动入口）', url: '/game/debug?as=master', players: 6 },
  { name: '梦主 + 同伴在迷失层（两个入口）', url: '/game/debug?as=master&dead=mate', players: 6 },
] as const;

/** 有操作入口的场景：入口都在视口内、在手牌坞之内、彼此不重叠，也不压住同一操作区里的其他按钮 */
const ENTRY_SCENE = /dead=|as=master/;

// eslint-disable-next-line no-empty-pattern -- Playwright 要求第一个参数是解构形式，这里只需要 testInfo
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome', '视口由用例指定，只在 desktop-chrome 跑');
});

async function openScene(page: Page, url: string, layout: 'desktop' | 'mobile'): Promise<void> {
  await page.goto(url);
  await waitForAppReady(page);
  await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('hand-dock')).toBeVisible();
  await expect(page.getByTestId('local-runtime')).toHaveAttribute('data-layout', layout);
  await waitForAssetsReady(page);
  if (layout === 'desktop') {
    // 中央舞台是按需加载的独立 chunk，等它出现再量版面
    await expect(page.getByTestId('center-stage').getByTestId('layer-tower')).toBeVisible({
      timeout: 10_000,
    });
  }
}

async function boxOf(page: Page, testId: string): Promise<Box> {
  const box = await page.getByTestId(testId).first().boundingBox();
  expect(box, `${testId} 应有布局盒`).not.toBeNull();
  return box!;
}

/** 元素完整落在视口内（允许 1px 的亚像素误差） */
async function expectInViewport(page: Page, locatorBox: Box, what: string): Promise<void> {
  const v = page.viewportSize()!;
  expect(locatorBox.x, `${what} 左边界`).toBeGreaterThanOrEqual(-1);
  expect(locatorBox.y, `${what} 上边界`).toBeGreaterThanOrEqual(-1);
  expect(locatorBox.x + locatorBox.width, `${what} 右边界`).toBeLessThanOrEqual(v.width + 1);
  expect(locatorBox.y + locatorBox.height, `${what} 下边界`).toBeLessThanOrEqual(v.height + 1);
}

/** 当前布局下共有的关键区域：可见、在视口内、互不重叠 */
async function expectKeyAreasClean(page: Page, vp: ViewportCase): Promise<void> {
  await expect(page.getByTestId('turn-indicator')).toBeVisible();
  await expect(page.getByTestId('hand-dock')).toBeVisible();
  await expect(page.getByTestId('dock-ops')).toBeVisible();
  await expect(page.getByTestId('copyright-line')).toBeVisible();

  const stage = await boxOf(page, 'runtime-stage');
  const dock = await boxOf(page, 'hand-dock');
  const ops = await boxOf(page, 'dock-ops');
  await expectInViewport(page, dock, '手牌坞');
  await expectInViewport(page, ops, '操作区');
  expect(boxesOverlap(stage, dock), '舞台区与手牌坞不重叠').toBe(false);
  expect(boxesOverlap(dock, ops) && !contains(dock, ops), '操作区在手牌坞之内').toBe(false);

  if (vp.layout === 'mobile') {
    await expect(page.getByTestId('turn-order-rail')).toBeVisible();
    await expect(page.getByTestId('layer-tower')).toBeVisible();
    await expect(page.getByTestId('local-runtime')).toHaveAttribute('data-mode', vp.mode!);
    const rail = await boxOf(page, 'turn-order-rail');
    const tower = await boxOf(page, 'layer-tower');
    expect(boxesOverlap(rail, tower), '行动轴与层塔不重叠').toBe(false);
    if (vp.mode === 'compact-landscape') {
      // 左右分栏：舞台区在左、坞在右
      expect(stage.x + stage.width, '舞台区在坞的左侧').toBeLessThanOrEqual(dock.x + 1);
    }
  } else {
    await expect(page.getByTestId('center-stage')).toBeVisible();
    const seats = page.locator('[data-testid^="player-seat-"]');
    const count = await seats.count();
    const boxes: Array<{ id: string; box: Box }> = [];
    for (let i = 0; i < count; i++) {
      const seat = seats.nth(i);
      const id = ((await seat.getAttribute('data-testid')) ?? '').replace('player-seat-', '');
      const box = (await seat.boundingBox())!;
      await expectInViewport(page, box, `座位 ${id}`);
      boxes.push({ id, box });
    }
    const center = await boxOf(page, 'center-stage');
    for (let i = 0; i < boxes.length; i++) {
      expect(boxesOverlap(boxes[i]!.box, center), `座位 ${boxes[i]!.id} 不压中央舞台`).toBe(false);
      expect(boxesOverlap(boxes[i]!.box, dock), `座位 ${boxes[i]!.id} 不压手牌坞`).toBe(false);
      for (let j = i + 1; j < boxes.length; j++) {
        expect(
          boxesOverlap(boxes[i]!.box, boxes[j]!.box),
          `座位 ${boxes[i]!.id} 与 ${boxes[j]!.id} 不重叠`,
        ).toBe(false);
      }
    }
  }
}

/** 操作入口：可见、完整在视口与手牌坞内、彼此不重叠、不压操作区里别的按钮 */
async function expectEntriesClean(page: Page): Promise<void> {
  const group = page.getByTestId('dock-entries');
  await expect(group).toBeVisible();
  // 收起的手机坞有过渡动画，等位置稳定
  await page.waitForTimeout(450);
  const dock = await boxOf(page, 'hand-dock');
  const entryBoxes: Array<{ id: string; box: Box }> = [];
  const entries = group.locator('button');
  const count = await entries.count();
  expect(count).toBeGreaterThanOrEqual(1);
  for (let i = 0; i < count; i++) {
    const b = entries.nth(i);
    const id = (await b.getAttribute('data-testid')) ?? `entry-${i}`;
    const box = (await b.boundingBox())!;
    await expectInViewport(page, box, `入口 ${id}`);
    expect(contains(dock, box), `入口 ${id} 在手牌坞之内`).toBe(true);
    entryBoxes.push({ id, box });
  }
  for (let i = 0; i < entryBoxes.length; i++) {
    for (let j = i + 1; j < entryBoxes.length; j++) {
      expect(
        boxesOverlap(entryBoxes[i]!.box, entryBoxes[j]!.box),
        `入口 ${entryBoxes[i]!.id} 与 ${entryBoxes[j]!.id} 不重叠`,
      ).toBe(false);
    }
  }
  // 同一操作区里的其他按钮：技能与主操作
  for (const other of ['dock-skill']) {
    const loc = page.getByTestId(other).first();
    if (!(await loc.isVisible())) continue;
    const box = (await loc.boundingBox())!;
    for (const e of entryBoxes) {
      expect(boxesOverlap(e.box, box), `入口 ${e.id} 不压 ${other}`).toBe(false);
    }
  }
  const main = page
    .locator('[data-testid^="action-"]:not([data-testid^="action-confirm"])')
    .first();
  if (await main.isVisible()) {
    const box = (await main.boundingBox())!;
    for (const e of entryBoxes) {
      expect(boxesOverlap(e.box, box), `入口 ${e.id} 不压主操作`).toBe(false);
    }
  }
}

const contains = (outer: Box, inner: Box): boolean =>
  inner.x >= outer.x - 1 &&
  inner.y >= outer.y - 1 &&
  inner.x + inner.width <= outer.x + outer.width + 1 &&
  inner.y + inner.height <= outer.y + outer.height + 1;

for (const vp of VIEWPORTS) {
  test.describe(`响应式 · ${vp.name}`, () => {
    const narrow = vp.layout === 'mobile';
    test.use({
      viewport: { width: vp.width, height: vp.height },
      isMobile: narrow,
      hasTouch: narrow,
    });

    for (const scene of SCENES) {
      test(`${scene.name}：关键区域可见、无整页滚动条、元素互不重叠`, async ({ page }) => {
        await openScene(page, scene.url, vp.layout);
        await expectKeyAreasClean(page, vp);
        if (vp.layout === 'desktop') {
          await expect(page.locator('[data-testid^="player-seat-"]')).toHaveCount(
            scene.players - 1,
          );
        } else {
          await expect(page.locator('[data-testid^="rail-slot-"]')).toHaveCount(scene.players);
        }
        await expectNoPageScroll(page);

        if (ENTRY_SCENE.test(scene.url) && !scene.url.includes('pending=1')) {
          await expectEntriesClean(page);
        }

        if (scene.url.includes('pending=1')) {
          const cancel = await boxOf(page, 'unlock-response-cancel');
          const pass = await boxOf(page, 'unlock-response-pass');
          await expectInViewport(page, cancel, '响应：打出解封');
          await expectInViewport(page, pass, '响应：放弃');
          expect(boxesOverlap(cancel, pass), '两个响应按钮不重叠').toBe(false);
          await expect(page.getByRole('dialog')).toHaveCount(0);
        }
        if (scene.url.includes('discard=1')) {
          // 手牌超出上限：选够要弃的两张后，「确认弃牌」可用且在视口内
          const confirm = page.getByTestId('action-confirm-discard');
          await expect(confirm).toBeVisible();
          await expect(confirm).toBeDisabled();
          await page.getByTestId('card-0').click();
          await page.getByTestId('card-1').click();
          await expect(confirm).toBeEnabled();
          await expectInViewport(page, (await confirm.boundingBox())!, '确认弃牌');
          await expectNoPageScroll(page);
        }
      });
    }

    test('选中一张牌后出现「打出」按钮，视口内可点，整页仍无滚动条', async ({ page }) => {
      await openScene(page, '/game/debug', vp.layout);
      await expect(page.getByTestId('hand-commit-play')).toHaveCount(0);
      await page.locator('[data-testid^="card-"][title="SHOOT"]').first().click();
      const commit = page.getByTestId('hand-commit-play');
      await expect(commit).toBeVisible();
      // 手机竖屏点牌会展开手牌坞（有过渡动画），等按钮位置稳定再量
      await expect
        .poll(async () => {
          const b = await commit.boundingBox();
          return b ? Math.round(b.y) : -1;
        })
        .toBeGreaterThanOrEqual(0);
      await page.waitForTimeout(450);
      await expectInViewport(page, (await commit.boundingBox())!, '「打出」按钮');
      await expectNoPageScroll(page);
    });

    test('长按卡牌达到阈值后弹出详情', async ({ page }) => {
      await openScene(page, '/game/debug', vp.layout);
      const card = page.locator('[data-testid^="card-"]').first();
      await card.scrollIntoViewIfNeeded();
      const box = (await card.boundingBox())!;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const hold = readLongPressMs();
      await page.mouse.move(x, y);
      await page.mouse.down();
      // 未到阈值不弹
      await page.waitForTimeout(Math.floor(hold / 2));
      await expect(page.getByTestId('card-detail-modal')).toHaveCount(0);
      await page.waitForTimeout(Math.ceil(hold / 2) + 400);
      await page.mouse.up();
      await expect(page.getByTestId('card-detail-modal')).toBeVisible();
    });

    test('金库详情没有翻面按钮', async ({ page }) => {
      await openScene(page, '/game/debug', vp.layout);
      await page.locator('[data-testid^="vault-thumb-"]').first().click();
      const detail = page.getByTestId('card-detail-modal');
      await expect(detail).toBeVisible();
      await expect(page.getByTestId('card-detail-flip')).toHaveCount(0);
      await expect(detail.getByRole('button', { name: /翻面|flip/i })).toHaveCount(0);
    });
  });
}

// 五个主题在三种窄屏形态下的缺省场景：无整页滚动条、关键区域不重叠
const THEME_IDS = ['noir', 'blueprint', 'totem', 'matrix', 'butterfly'] as const;
const THEME_VIEWPORTS = VIEWPORTS.filter((v) =>
  ['平板竖屏 768×1024', '手机横屏 844×390', '小手机 360×640'].includes(v.name),
);

for (const themeId of THEME_IDS) {
  for (const vp of THEME_VIEWPORTS) {
    test.describe(`主题 ${themeId} · ${vp.name}`, () => {
      test.use({
        viewport: { width: vp.width, height: vp.height },
        isMobile: true,
        hasTouch: true,
      });

      test('缺省场景无整页滚动条、关键区域不重叠', async ({ page }) => {
        await page.addInitScript((id) => {
          try {
            localStorage.setItem('icgame-theme', id);
          } catch {
            /* 无存储时按缺省主题 */
          }
        }, themeId);
        await openScene(page, '/game/debug', vp.layout);
        await expect(page.locator('html')).toHaveAttribute('data-theme', themeId);
        await expectKeyAreasClean(page, vp);
        await expectNoPageScroll(page);
      });
    });
  }
}
