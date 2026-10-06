// 主题机制 E2E：主题 id 与明暗属性、主题单选组、旧存储值回落

import type { Page } from '@playwright/test';
import {
  test,
  expect,
  isMobileProject,
  isNarrowViewport,
  waitForAppReady,
} from './fixtures/index.js';

/** 在页面加载前写入主题，模拟用户上次选择的主题 */
async function preselectTheme(page: Page, id: string): Promise<void> {
  await page.addInitScript((themeId) => {
    try {
      localStorage.setItem('icgame-theme', themeId);
    } catch {
      /* ignore */
    }
  }, id);
}

/** 除默认主题外、带专属中央舞台的主题；对局界面的用例对每个主题各跑一遍 */
const SWITCHABLE_THEMES = [
  {
    id: 'blueprint',
    label: '筑梦蓝图',
    name: /筑梦蓝图|Architect's Blueprint/,
    stage: 'blueprint-stage',
    desc: '轴测楼板剖面',
  },
  {
    id: 'totem',
    label: '陀螺未停',
    name: /陀螺未停|The Top Still Spins/,
    stage: 'totem-stage',
    desc: '陀螺仪加梦层塔',
  },
] as const;

/** 所有带专属舞台的主题的舞台 testid（含默认主题），用来断言别的主题的舞台没有渲染 */
const ALL_STAGE_IDS = ['noir-stage', ...SWITCHABLE_THEMES.map((th) => th.stage)];

test.describe('主题 Theme', () => {
  test('默认主题为深眠影院，根元素带主题与明暗属性', async ({ page }) => {
    await page.goto('/settings');
    await waitForAppReady(page);

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'noir');
    await expect(html).toHaveAttribute('data-scheme', 'dark');
  });

  test('设置页主题单选组可见且深眠影院为选中态', async ({ page }) => {
    await page.goto('/settings');
    await waitForAppReady(page);

    await expect(page.getByRole('radiogroup', { name: /选择主题|Choose theme/ })).toBeVisible();
    const noir = page.getByRole('radio', { name: /深眠影院|Cinematic Noir/ });
    await expect(noir).toBeVisible();
    await expect(noir).toHaveAttribute('aria-checked', 'true');
  });

  test('localStorage 里的无效旧值刷新后回落到 noir', async ({ page }) => {
    await page.goto('/settings');
    await waitForAppReady(page);

    await page.evaluate(() => localStorage.setItem('icgame-theme', 'light'));
    await page.reload();
    await waitForAppReady(page);

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'noir');
    await expect(html).toHaveAttribute('data-scheme', 'dark');
  });

  for (const theme of SWITCHABLE_THEMES) {
    test(`设置页可切换到${theme.label}：根元素属性随之改变，刷新后保持`, async ({ page }) => {
      await page.goto('/settings');
      await waitForAppReady(page);

      const radio = page.getByRole('radio', { name: theme.name });
      await expect(radio).toBeVisible();
      await expect(radio).toHaveAttribute('aria-checked', 'false');
      await radio.click();
      await expect(radio).toHaveAttribute('aria-checked', 'true');

      const html = page.locator('html');
      await expect(html).toHaveAttribute('data-theme', theme.id);
      await expect(html).toHaveAttribute('data-scheme', 'dark');

      await page.reload();
      await waitForAppReady(page);
      await expect(html).toHaveAttribute('data-theme', theme.id);
      await expect(page.getByRole('radio', { name: theme.name })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });
  }

  for (const theme of SWITCHABLE_THEMES) {
    test(`首屏内联脚本不依赖应用代码：外部脚本全被拦下时，已存的${theme.label}也已写到根元素上`, async ({
      page,
    }) => {
      await preselectTheme(page, theme.id);
      // 拦掉所有外部脚本：应用不会挂载，属性只可能来自 <head> 里的内联脚本
      await page.route('**/*', (route) =>
        route.request().resourceType() === 'script' ? route.abort() : route.continue(),
      );
      await page.goto('/settings');
      const html = page.locator('html');
      await expect(html).toHaveAttribute('data-theme', theme.id);
      await expect(html).toHaveAttribute('data-scheme', 'dark');
      await expect(page.locator('#root > *')).toHaveCount(0);
    });
  }
});

for (const theme of SWITCHABLE_THEMES) {
  test.describe(`主题 Theme · ${theme.label}的对局界面`, () => {
    test(`桌面：中央舞台是${theme.desc}，五层俱全，整页无滚动条`, async ({ page }, testInfo) => {
      test.skip(
        isMobileProject(testInfo.project.name) || isNarrowViewport(page),
        '中央舞台只在桌面视口出现；移动布局只换令牌与皮肤样式',
      );
      await preselectTheme(page, theme.id);
      await page.goto('/game/debug');
      await waitForAppReady(page);
      await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });

      // 中央舞台是按需加载的独立 chunk，等它出现
      const stage = page.getByTestId('center-stage').getByTestId(theme.stage);
      await expect(stage).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('center-stage').getByTestId('layer-tower')).toBeVisible();
      await expect(page.getByTestId('deck-meter')).toBeVisible();
      for (const other of ALL_STAGE_IDS.filter((id) => id !== theme.stage)) {
        await expect(page.getByTestId(other)).toHaveCount(0);
      }

      // 自上而下 L4 → L0，焦点层只有一层
      const rows = page.getByTestId('center-stage').locator('[data-testid^="layer-row-"]');
      await expect(rows).toHaveCount(5);
      await expect(rows.first()).toHaveAttribute('data-testid', 'layer-row-4');
      await expect(rows.last()).toHaveAttribute('data-testid', 'layer-row-0');
      await expect(page.locator('[data-testid^="layer-row-"][data-focus]')).toHaveCount(1);

      // 点另一层把它设为焦点层
      await page.getByTestId('layer-focus-4').click();
      await expect(page.getByTestId('layer-row-4')).toHaveAttribute('data-focus', 'true');
      // 布局根容器带上焦点层的层号（只有层级调色的主题会用它）
      await expect(page.getByTestId('local-runtime')).toHaveAttribute('data-tint-layer', '4');

      // 楼板都画在中央舞台之内，整页没有滚动条
      const center = (await page.getByTestId('center-stage').boundingBox())!;
      for (let i = 0; i < 5; i++) {
        const box = (await rows.nth(i).boundingBox())!;
        expect(box.x, `第 ${i} 行左边界`).toBeGreaterThanOrEqual(center.x - 1);
        expect(box.x + box.width, `第 ${i} 行右边界`).toBeLessThanOrEqual(
          center.x + center.width + 1,
        );
        expect(box.y + box.height, `第 ${i} 行下边界`).toBeLessThanOrEqual(
          center.y + center.height + 1,
        );
      }
      const m = await page.evaluate(() => ({
        sh: document.documentElement.scrollHeight,
        ch: document.documentElement.clientHeight,
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
      }));
      expect(m.sh).toBeLessThanOrEqual(m.ch);
      expect(m.sw).toBeLessThanOrEqual(m.cw);
    });

    test('桌面 1024×768、10 人：座位不压中央舞台，整页无滚动条', async ({ page }, testInfo) => {
      test.skip(isMobileProject(testInfo.project.name), '只在桌面项目运行');
      await page.setViewportSize({ width: 1024, height: 768 });
      await preselectTheme(page, theme.id);
      await page.goto('/game/debug?players=10');
      await waitForAppReady(page);
      await expect(page.getByTestId(theme.stage)).toBeVisible({ timeout: 10_000 });

      const center = (await page.getByTestId('center-stage').boundingBox())!;
      const seats = page.locator('[data-testid^="player-seat-"]');
      await expect(seats).toHaveCount(9);
      for (let i = 0; i < 9; i++) {
        const b = (await seats.nth(i).boundingBox())!;
        const overlaps =
          b.x < center.x + center.width - 0.5 &&
          center.x < b.x + b.width - 0.5 &&
          b.y < center.y + center.height - 0.5 &&
          center.y < b.y + b.height - 0.5;
        expect(overlaps, `座位 ${i} 不压中央舞台`).toBe(false);
      }
      const m = await page.evaluate(() => ({
        sh: document.documentElement.scrollHeight,
        ch: document.documentElement.clientHeight,
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
      }));
      expect(m.sh).toBeLessThanOrEqual(m.ch);
      expect(m.sw).toBeLessThanOrEqual(m.cw);
    });

    test(`移动：${theme.label}下对局界面照常显示，没有横向滚动`, async ({ page }, testInfo) => {
      test.skip(
        !(isMobileProject(testInfo.project.name) || isNarrowViewport(page)),
        '只在移动布局下运行',
      );
      await preselectTheme(page, theme.id);
      await page.goto('/game/debug');
      await waitForAppReady(page);
      await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id);
      await expect(page.getByTestId('local-runtime')).toHaveAttribute('data-layout', 'mobile');
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
      }));
      expect(m.sw).toBeLessThanOrEqual(m.cw);
    });
  });
}

/** 层级调色：焦点层决定强调色，各层取值与 src/theme/layerTints.ts 一致 */
const TOTEM_TINTS: ReadonlyArray<readonly [number, string]> = [
  [1, '#8FB0C8'],
  [2, '#E0BC7E'],
  [3, '#BFD4E6'],
  [4, '#9AA098'],
];

test.describe('主题 Theme · 陀螺未停的层级调色', () => {
  test('点哪一层，布局根容器的强调色就换成那一层的调色；迷失层沿用缺省强调色', async ({ page }) => {
    await preselectTheme(page, 'totem');
    await page.goto('/game/debug');
    await waitForAppReady(page);
    await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });

    const runtime = page.getByTestId('local-runtime');
    const mobile = (await runtime.getAttribute('data-layout')) === 'mobile';
    const focus = (layer: number) =>
      page.getByTestId(mobile ? `layer-chip-${layer}` : `layer-focus-${layer}`).click();
    const accent = () =>
      runtime.evaluate((el) =>
        getComputedStyle(el).getPropertyValue('--ms-acc').trim().toUpperCase(),
      );

    for (const [layer, color] of TOTEM_TINTS) {
      await focus(layer);
      await expect(runtime).toHaveAttribute('data-tint-layer', String(layer));
      expect(await accent(), `第 ${layer} 层的强调色`).toBe(color);
    }
    await focus(0);
    await expect(runtime).toHaveAttribute('data-tint-layer', '0');
    expect(await accent(), '迷失层沿用缺省强调色').toBe('#C9A35F');
  });

  test('data-fx-off="tint" 关掉层级调色：强调色回到缺省', async ({ page }) => {
    await preselectTheme(page, 'totem');
    await page.goto('/game/debug');
    await waitForAppReady(page);
    await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });

    const runtime = page.getByTestId('local-runtime');
    const mobile = (await runtime.getAttribute('data-layout')) === 'mobile';
    await page.getByTestId(mobile ? 'layer-chip-4' : 'layer-focus-4').click();
    await expect(runtime).toHaveAttribute('data-tint-layer', '4');
    await page.evaluate(() => document.documentElement.setAttribute('data-fx-off', 'tint'));
    await expect
      .poll(() =>
        runtime.evaluate((el) =>
          getComputedStyle(el).getPropertyValue('--ms-acc').trim().toUpperCase(),
        ),
      )
      .toBe('#C9A35F');
  });
});
