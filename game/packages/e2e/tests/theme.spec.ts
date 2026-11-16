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
    scheme: 'dark',
  },
  {
    id: 'totem',
    label: '陀螺未停',
    name: /陀螺未停|The Top Still Spins/,
    stage: 'totem-stage',
    scheme: 'dark',
  },
  {
    id: 'matrix',
    label: '梦境矩阵',
    name: /梦境矩阵|DreamMatrix/,
    stage: 'matrix-stage',
    scheme: 'dark',
  },
  {
    id: 'butterfly',
    label: '庄周梦蝶',
    name: /庄周梦蝶|The Butterfly Dream/,
    stage: 'butterfly-stage',
    scheme: 'light',
  },
] as const;

// 新牌桌与弹层共用暗色样式；主题偏好仍应用在对局外。
const LEGACY_STAGE = ['noir-stage', ...SWITCHABLE_THEMES.map((th) => th.stage)]
  .map((id) => `[data-testid="${id}"]`)
  .join(', ');
const TABLETOP_ACCENT = '#D5B276';

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
    await expect(noir).toBeChecked();
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
      await expect(radio).not.toBeChecked();
      await radio.click();
      await expect(radio).toBeChecked();

      const html = page.locator('html');
      await expect(html).toHaveAttribute('data-theme', theme.id);
      await expect(html).toHaveAttribute('data-scheme', theme.scheme);

      await page.reload();
      await waitForAppReady(page);
      await expect(html).toHaveAttribute('data-theme', theme.id);
      await expect(page.getByRole('radio', { name: theme.name })).toBeChecked();
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
      await expect(html).toHaveAttribute('data-scheme', theme.scheme);
      await expect(page.locator('#root > *')).toHaveCount(0);
    });
  }
});

for (const theme of SWITCHABLE_THEMES) {
  test.describe(`主题 Theme · ${theme.label}的对局界面`, () => {
    test('桌面：使用统一暗色牌桌，四层俱全，整页无滚动条', async ({ page }, testInfo) => {
      test.skip(
        isMobileProject(testInfo.project.name) || isNarrowViewport(page),
        '中央牌桌区域只在桌面布局出现',
      );
      await preselectTheme(page, theme.id);
      await page.goto('/game/debug');
      await waitForAppReady(page);
      await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });

      const runtime = page.getByTestId('local-runtime');
      const stage = page.getByTestId('center-stage');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id);
      await expect(runtime).toHaveCSS('color-scheme', 'dark');
      await expect(stage.getByTestId('layer-tower')).toBeVisible();
      await expect(stage.getByTestId('deck-meter')).toBeVisible();
      await expect(page.locator(LEGACY_STAGE)).toHaveCount(0);

      const rows = stage.locator('[data-testid^="layer-row-"]');
      await expect(rows).toHaveCount(4);
      for (const [index, layer] of [1, 2, 3, 4].entries()) {
        await expect(rows.nth(index)).toHaveAttribute('data-testid', `layer-row-${layer}`);
      }
      await expect(rows.and(page.locator('[data-focus="true"]'))).toHaveCount(1);

      await stage.getByTestId('layer-focus-4').click();
      await expect(stage.getByTestId('layer-row-4')).toHaveAttribute('data-focus', 'true');
      await expect(stage.getByTestId('layer-row-4')).toHaveAttribute('data-flipped', 'true');
      await expect(rows.and(page.locator('[data-focus="true"]'))).toHaveCount(1);

      // 各层卡片都留在中央牌桌内，整页没有滚动条
      const center = (await stage.boundingBox())!;
      for (let i = 0; i < 4; i++) {
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
      await expect(page.getByTestId('center-stage').getByTestId('layer-tower')).toBeVisible({
        timeout: 10_000,
      });

      const center = (await page.getByTestId('center-stage').boundingBox())!;
      const seats = page.locator('[data-testid^="player-seat-"]');
      await expect(seats).toHaveCount(10);
      for (let i = 0; i < 10; i++) {
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

    test(`移动：${theme.label}下对局界面照常显示，没有横向滚动`, async ({ page }) => {
      // 布局只按视口宽度分派：iPad Pro 竖屏宽 1024，走的是桌面布局
      test.skip(!isNarrowViewport(page), '只在移动布局（视口宽度 < 1024）下运行');
      await preselectTheme(page, theme.id);
      await page.goto('/game/debug');
      await waitForAppReady(page);
      await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id);
      const runtime = page.getByTestId('local-runtime');
      await expect(runtime).toHaveAttribute('data-layout', 'mobile');
      await expect(runtime).toHaveCSS('color-scheme', 'dark');
      await expect(runtime.getByTestId('layer-tower')).toBeVisible();
      await expect(page.locator(LEGACY_STAGE)).toHaveCount(0);
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
      }));
      expect(m.sw).toBeLessThanOrEqual(m.cw);
    });
  });
}

test.describe('主题 Theme · 旧主题样式与当前牌桌隔离', () => {
  test('陀螺未停：可以逐层切换焦点，牌桌始终保留统一强调色', async ({ page }) => {
    await preselectTheme(page, 'totem');
    await page.goto('/game/debug?dead=mate');
    await waitForAppReady(page);

    const runtime = page.getByTestId('local-runtime');
    const tower = runtime.getByTestId('layer-tower');
    const rows = tower.locator('[data-testid^="layer-row-"]');
    await expect(rows).toHaveCount(5);
    await expect(rows.last()).toHaveAttribute('data-testid', 'layer-row-0');
    for (const layer of [1, 2, 3, 4, 0]) {
      await tower.getByTestId(`layer-focus-${layer}`).click();
      await expect(tower.getByTestId(`layer-row-${layer}`)).toHaveAttribute('data-focus', 'true');
      await expect(tower.locator('[data-focus="true"]')).toHaveCount(1);
      await expect(runtime).toHaveCSS('--ms-acc', TABLETOP_ACCENT.toLowerCase());
      if (isNarrowViewport(page) && layer !== 0) {
        const dialog = page.getByTestId('card-detail-modal');
        await expect(dialog).toBeVisible();
        await dialog.getByTestId('card-detail-close').click();
        await expect(dialog).toBeHidden();
      }
    }
  });

  test('梦境矩阵：牌桌不挂载数字雨或扫描线，手牌与详情都保留原色', async ({ page }) => {
    await preselectTheme(page, 'matrix');
    await page.goto('/game/debug');
    await waitForAppReady(page);
    await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('canvas.matrix-rain')).toHaveCount(0);
    const runtime = page.getByTestId('local-runtime');
    const scan = await runtime.evaluate((el) => getComputedStyle(el, '::after').backgroundImage);
    expect(scan).toBe('none');
    const art = page.getByTestId('human-hand').getByTestId('card-0').locator('img').first();
    await expect(art).toBeVisible();
    await expect(art).toHaveCSS('filter', 'none');

    await page.getByRole('button', { name: '第 1 层说明' }).click();
    const dialog = page.getByTestId('card-detail-modal');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('img').first()).toHaveCSS('filter', 'none');
  });

  test('庄周梦蝶：牌桌及卡牌详情保持暗色，离开对局恢复亮色', async ({ page }) => {
    await preselectTheme(page, 'butterfly');
    await page.goto('/game/debug');
    await waitForAppReady(page);
    await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('.butterfly-paper, .butterfly-flyer, .butterfly-wings')).toHaveCount(
      0,
    );
    await expect(page.getByTestId('local-runtime')).toHaveCSS('color-scheme', 'dark');
    await page.getByRole('button', { name: '第 1 层说明' }).click();
    const dialog = page.getByTestId('card-detail-modal');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('color-scheme', 'dark');

    await page.goto('/settings');
    await waitForAppReady(page);
    await expect(page.locator('body')).toHaveCSS('color-scheme', 'light');
  });
});

/** 楷体字体样式与字体文件的请求：只有应用了「庄周梦蝶」才会出现 */
const FONT_REQUEST = /lxgw/i;

function trackFontRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (req) => {
    if (FONT_REQUEST.test(req.url())) urls.push(req.url());
  });
  return urls;
}

test.describe('主题 Theme · 庄周梦蝶的亮色与按需字体', () => {
  test('根元素是亮色：data-scheme=light，控件配色与背景都是亮的', async ({ page }) => {
    await preselectTheme(page, 'butterfly');
    await page.goto('/settings');
    await waitForAppReady(page);

    await expect(page.locator('html')).toHaveAttribute('data-scheme', 'light');
    const m = await page.evaluate(() => ({
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      body: getComputedStyle(document.body).backgroundColor,
    }));
    expect(m.colorScheme).toBe('light');
    // 宣纸底 #F0EBDF
    expect(m.body).toBe('rgb(240, 235, 223)');
  });

  test('刷新后首帧就是亮色：外部脚本与样式全被拦下时，根元素也已带亮色的底色与控件配色', async ({
    page,
  }) => {
    await preselectTheme(page, 'butterfly');
    // 拦掉外部脚本与样式：底色与明暗只可能来自 <head> 里的内联脚本
    await page.route('**/*', (route) =>
      ['script', 'stylesheet'].includes(route.request().resourceType())
        ? route.abort()
        : route.continue(),
    );
    await page.goto('/settings');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-scheme', 'light');
    const m = await html.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, colorScheme: cs.colorScheme };
    });
    expect(m.bg).toBe('rgb(240, 235, 223)');
    expect(m.colorScheme).toBe('light');
  });

  test('别的主题（含暗色的默认主题）没有请求楷体的样式与字体文件', async ({ page }) => {
    const urls = trackFontRequests(page);
    await page.goto('/settings');
    await waitForAppReady(page);
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'noir');
    for (const theme of SWITCHABLE_THEMES.filter(({ id }) => id !== 'butterfly')) {
      await page.getByRole('radio', { name: theme.name }).click();
      await expect(html).toHaveAttribute('data-theme', theme.id);
    }
    await page.goto('/game/debug');
    await waitForAppReady(page);
    await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    expect(urls, '其他主题不该请求楷体').toEqual([]);
  });

  test('在设置页从默认主题切到庄周梦蝶之后才请求楷体样式，之后字体按用到的分片下载', async ({
    page,
  }) => {
    const urls = trackFontRequests(page);
    await page.goto('/settings');
    await waitForAppReady(page);
    await page.waitForTimeout(500);
    expect(urls, '切换之前没有楷体请求').toEqual([]);

    await page.getByRole('radio', { name: /庄周梦蝶|The Butterfly Dream/ }).click();
    await expect
      .poll(() => urls.some((u) => /\.css(\?|$)/.test(u)), { timeout: 10_000 })
      .toBe(true);
    // 设置页标题使用主题字体，浏览器只下载用到的分片。
    await expect
      .poll(() => urls.some((u) => /\.woff2(\?|$)/.test(u)), { timeout: 10_000 })
      .toBe(true);
    // 字体按字符集分片，只下用到的分片：不会把全部 97 片都请求一遍
    expect(urls.filter((u) => /\.woff2(\?|$)/.test(u)).length).toBeLessThan(40);
  });
});

/** 在页面里放一个声明了 3 秒过渡的元素，读出它实际生效的过渡时长（全局减少动效规则生效时是 0.001s） */
const probeTransitionDuration = (page: Page) =>
  page.evaluate(() => {
    const el = document.createElement('div');
    el.style.transition = 'opacity 3s';
    document.body.appendChild(el);
    const value = getComputedStyle(el).transitionDuration;
    el.remove();
    return value;
  });

/** 设置页「视觉效果」里的开关与减少动效三态 */
const switchByName = (page: Page, name: RegExp) => page.getByRole('switch', { name });
const motionOption = (page: Page, pref: 'system' | 'reduce' | 'full') =>
  page.getByTestId(`motion-pref-${pref}`);

test.describe('主题 Theme · 效果开关', () => {
  test('梦境矩阵：关闭背景动画后刷新仍保持关闭，可以重新打开', async ({ page }) => {
    await preselectTheme(page, 'matrix');
    await page.goto('/settings');
    await waitForAppReady(page);
    const html = page.locator('html');
    const ambient = switchByName(page, /背景动画|Background animation/);
    await expect(ambient).toHaveAttribute('aria-checked', 'true');
    await expect(html).not.toHaveAttribute('data-fx-off', /./);

    await ambient.click();
    await expect(ambient).toHaveAttribute('aria-checked', 'false');
    await expect(html).toHaveAttribute('data-fx-off', /\brain\b/);
    // 同一类别里的别的内部名字也一起关
    await expect(html).toHaveAttribute('data-fx-off', /\bblink\b/);
    // 别的类别不受牵连
    await expect(html).not.toHaveAttribute('data-fx-off', /\bscan\b/);

    await page.reload();
    await waitForAppReady(page);
    await expect(switchByName(page, /背景动画|Background animation/)).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await expect(html).toHaveAttribute('data-fx-off', /\brain\b/);

    await switchByName(page, /背景动画|Background animation/).click();
    await expect(switchByName(page, /背景动画|Background animation/)).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(html).not.toHaveAttribute('data-fx-off', /./);
  });

  test('开关只显示当前主题用得到的：切到没有扫描线的主题，扫描线开关消失；深眠影院没有任何装饰开关', async ({
    page,
  }) => {
    await preselectTheme(page, 'matrix');
    await page.goto('/settings');
    await waitForAppReady(page);
    const scan = switchByName(page, /扫描线|Scanlines/);
    await expect(scan).toBeVisible();
    await expect(switchByName(page, /卡图降饱和|Desaturate card art/)).toBeVisible();
    await expect(switchByName(page, /层级调色|Layer tinting/)).toHaveCount(0);

    // preselectTheme 的初始化脚本每次加载都会写回主题，这里改用页面里的点选来切换
    await page.getByRole('radio', { name: /筑梦蓝图|Architect's Blueprint/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'blueprint');
    await expect(switchByName(page, /扫描线|Scanlines/)).toHaveCount(0);
    await expect(switchByName(page, /背景动画|Background animation/)).toBeVisible();
    await expect(switchByName(page, /背景底纹|Background texture/)).toBeVisible();

    await page.getByRole('radio', { name: /陀螺未停|The Top Still Spins/ }).click();
    await expect(switchByName(page, /层级调色|Layer tinting/)).toBeVisible();

    await page.getByRole('radio', { name: /深眠影院|Cinematic Noir/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'noir');
    await expect(page.getByTestId('effect-settings').getByRole('switch')).toHaveCount(0);
    await expect(page.getByTestId('effect-switches')).toHaveCount(0);
    // 减少动效对所有主题都有意义，始终在
    await expect(page.getByTestId('motion-pref')).toBeVisible();
  });

  test('开关可用键盘操作，触控目标不小于 44×44', async ({ page }) => {
    await preselectTheme(page, 'matrix');
    await page.goto('/settings');
    await waitForAppReady(page);
    const scan = switchByName(page, /扫描线|Scanlines/);
    const box = await scan.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await scan.focus();
    await page.keyboard.press('Space');
    await expect(scan).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('html')).toHaveAttribute('data-fx-off', /\bscan\b/);
    await page.keyboard.press('Space');
    await expect(scan).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('html')).not.toHaveAttribute('data-fx-off', /./);

    for (const pref of ['system', 'reduce', 'full'] as const) {
      const b = await motionOption(page, pref).boundingBox();
      expect(b!.height, `减少动效选项 ${pref}`).toBeGreaterThanOrEqual(44);
    }
  });

  test('减少动效三态：总是减少写 data-motion=reduced，不减少写 full，跟随系统不写；刷新后保持', async ({
    page,
  }) => {
    await page.goto('/settings');
    await waitForAppReady(page);
    const html = page.locator('html');
    await expect(motionOption(page, 'system')).toHaveAttribute('aria-checked', 'true');
    await expect(html).not.toHaveAttribute('data-motion', /./);

    await motionOption(page, 'reduce').click();
    await expect(motionOption(page, 'reduce')).toHaveAttribute('aria-checked', 'true');
    await expect(html).toHaveAttribute('data-motion', 'reduced');
    await page.reload();
    await waitForAppReady(page);
    await expect(html).toHaveAttribute('data-motion', 'reduced');
    await expect(motionOption(page, 'reduce')).toHaveAttribute('aria-checked', 'true');

    await motionOption(page, 'full').click();
    await expect(html).toHaveAttribute('data-motion', 'full');

    await motionOption(page, 'system').click();
    await expect(html).not.toHaveAttribute('data-motion', /./);
  });

  test('首屏内联脚本不依赖应用代码：外部脚本全被拦下时，已存的效果偏好也已写到根元素上', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem(
          'icgame-effects',
          JSON.stringify({ off: ['ambient', 'scan'], motion: 'reduce' }),
        );
      } catch {
        /* ignore */
      }
    });
    await page.route('**/*', (route) =>
      route.request().resourceType() === 'script' ? route.abort() : route.continue(),
    );
    await page.goto('/settings');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-fx-off', 'rain totem blink drift scan');
    await expect(html).toHaveAttribute('data-motion', 'reduced');
    await expect(page.locator('#root > *')).toHaveCount(0);
  });

  test('localStorage 里无效的效果偏好回落到缺省，页面照常工作', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('icgame-effects', '{"off":"scan","motion":"sideways"');
      } catch {
        /* ignore */
      }
    });
    await page.goto('/settings');
    await waitForAppReady(page);
    const html = page.locator('html');
    await expect(html).not.toHaveAttribute('data-fx-off', /./);
    await expect(html).not.toHaveAttribute('data-motion', /./);
    await expect(motionOption(page, 'system')).toHaveAttribute('aria-checked', 'true');
  });

  test('牌桌尊重系统减少动效，选「不减少」后盖过系统偏好', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/game/debug');
    await waitForAppReady(page);
    await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
    expect(await probeTransitionDuration(page)).toBe('0.001s');
    const flipper = page.getByTestId('layer-focus-1').locator('.tabletop-layer-flipper');
    if (!isNarrowViewport(page)) {
      await expect(flipper).toHaveCSS('transition-property', 'none');
    }

    await page.goto('/settings');
    await waitForAppReady(page);
    await motionOption(page, 'full').click();
    await page.goto('/game/debug');
    await waitForAppReady(page);
    await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
    expect(await probeTransitionDuration(page)).toBe('3s');
    if (!isNarrowViewport(page)) {
      await expect(flipper).toHaveCSS('transition-property', 'transform');
      await expect(flipper).toHaveCSS('transition-duration', '0.42s');
    }
  });
});

/** 牌桌：每张梦境层卡片里的文字与控件都要落在卡片之内（卡片裁掉溢出，溢出了就是被悄悄截掉） */
const CARD_BOUNDS = () => {
  const violations: string[] = [];
  for (const card of document.querySelectorAll(
    '[data-testid="center-stage"] [data-testid^="layer-row-"]',
  )) {
    const box = card.getBoundingClientRect();
    const inside = (r: DOMRect) =>
      r.left >= box.left - 0.5 &&
      r.right <= box.right + 0.5 &&
      r.top >= box.top - 0.5 &&
      r.bottom <= box.bottom + 0.5;
    const name = (card as HTMLElement).dataset['testid'];
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (
        !n.textContent?.trim() ||
        n.parentElement!.closest('.sr-only, [data-testid="card-art-fallback"]')
      ) {
        continue;
      }
      // 截短（overflow 隐藏 + 省略号）的文字按截短它的那个元素的框量，那是有意的裁切
      let clip: Element | null = n.parentElement;
      while (clip && clip !== card && getComputedStyle(clip).overflowX === 'visible') {
        clip = clip.parentElement;
      }
      const range = document.createRange();
      range.selectNodeContents(n);
      const rects =
        clip && clip !== card ? [clip.getBoundingClientRect()] : [...range.getClientRects()];
      for (const r of rects) {
        if (r.width === 0 || r.height === 0) continue;
        if (!inside(r)) violations.push(`${name}: "${n.textContent.trim()}"`);
      }
    }
    for (const el of card.querySelectorAll('button')) {
      // 头像列可以横向滚动；先滚到这个头像，再检查它是否能完整显示。
      const avatars = el.closest<HTMLElement>('.tabletop-layer-players');
      const originalScroll = avatars?.scrollLeft ?? 0;
      const frame = avatars?.getBoundingClientRect();
      if (avatars && frame) {
        avatars.scrollLeft += el.getBoundingClientRect().left - frame.left;
      }
      const rect = el.getBoundingClientRect();
      if (avatars) avatars.scrollLeft = originalScroll;
      if (
        !inside(rect) ||
        (frame && (rect.left < frame.left - 0.5 || rect.right > frame.right + 0.5))
      ) {
        violations.push(`${name}: <button ${el.dataset['testid'] ?? ''}>`);
      }
    }
  }
  return violations;
};

test.describe('主题 Theme · 牌桌的梦境层卡片', () => {
  const CASES = [
    { w: 1024, h: 768, players: 10 },
    { w: 1280, h: 800, players: 6 },
  ] as const;
  const ALL = [{ id: 'noir', label: '深眠影院' }, ...SWITCHABLE_THEMES];
  for (const theme of ALL) {
    for (const c of CASES) {
      test(`${theme.label} ${c.w}×${c.h}、${c.players} 人：各层文字与按钮都在各自卡片之内（含逐层设为焦点层）`, async ({
        page,
      }, testInfo) => {
        test.skip(isMobileProject(testInfo.project.name), '中央舞台只在桌面视口出现');
        await page.setViewportSize({ width: c.w, height: c.h });
        await preselectTheme(page, theme.id);
        await page.goto(`/game/debug?players=${c.players}&dead=mate`);
        await waitForAppReady(page);
        await expect(page.getByTestId('center-stage').getByTestId('layer-tower')).toBeVisible({
          timeout: 10_000,
        });
        await expect(
          page.getByTestId('center-stage').locator('[data-testid^="layer-row-"]'),
        ).toHaveCount(5);
        expect(await page.evaluate(CARD_BOUNDS), '默认焦点层').toEqual([]);
        for (const layer of [0, 1, 2, 3, 4]) {
          await page.getByTestId(`layer-focus-${layer}`).click();
          await expect(page.getByTestId(`layer-row-${layer}`)).toHaveAttribute(
            'data-focus',
            'true',
          );
          expect(await page.evaluate(CARD_BOUNDS), `焦点层 ${layer}`).toEqual([]);
        }
      });
    }
  }
});
