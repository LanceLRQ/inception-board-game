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
    scheme: 'dark',
  },
  {
    id: 'totem',
    label: '陀螺未停',
    name: /陀螺未停|The Top Still Spins/,
    stage: 'totem-stage',
    desc: '陀螺仪加梦层塔',
    scheme: 'dark',
  },
  {
    id: 'matrix',
    label: '梦境矩阵',
    name: /梦境矩阵|DreamMatrix/,
    stage: 'matrix-stage',
    desc: '终端进程表',
    scheme: 'dark',
  },
  {
    id: 'butterfly',
    label: '庄周梦蝶',
    name: /庄周梦蝶|The Butterfly Dream/,
    stage: 'butterfly-stage',
    desc: '山水长卷',
    scheme: 'light',
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
      await expect(html).toHaveAttribute('data-scheme', theme.scheme);

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
      await expect(html).toHaveAttribute('data-scheme', theme.scheme);
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

/** 梦境矩阵的数字雨画布：状态由控制器写在 data-rain-state 上 */
const RAIN = 'canvas.matrix-rain';

/** 画布内容的指纹：像素有变化它就变 */
const rainFrame = (page: Page) =>
  page.evaluate((sel) => (document.querySelector(sel) as HTMLCanvasElement).toDataURL(), RAIN);

async function openMatrixMatch(page: Page): Promise<void> {
  await preselectTheme(page, 'matrix');
  await page.goto('/game/debug');
  await waitForAppReady(page);
  await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(RAIN)).toHaveAttribute('data-rain-state', 'running');
}

test.describe('主题 Theme · 梦境矩阵的特效', () => {
  test('数字雨在桌面与移动布局里都有，并且在持续推进', async ({ page }) => {
    await openMatrixMatch(page);
    const before = await rainFrame(page);
    await expect.poll(() => rainFrame(page), { timeout: 5_000 }).not.toBe(before);
  });

  test('data-fx-off="rain"：画布停止推进并清空，去掉后恢复', async ({ page }) => {
    await openMatrixMatch(page);
    const html = page.locator('html');

    await page.evaluate(() => document.documentElement.setAttribute('data-fx-off', 'rain'));
    await expect(page.locator(RAIN)).toHaveAttribute('data-rain-state', 'off');
    const a = await rainFrame(page);
    await page.waitForTimeout(700);
    expect(await rainFrame(page), '关掉之后画面不再变化').toBe(a);

    await page.evaluate(() => document.documentElement.removeAttribute('data-fx-off'));
    await expect(html).not.toHaveAttribute('data-fx-off', /./);
    await expect(page.locator(RAIN)).toHaveAttribute('data-rain-state', 'running');
    await expect.poll(() => rainFrame(page), { timeout: 5_000 }).not.toBe(a);
  });

  test('页面不可见时暂停，重新可见时恢复', async ({ page }) => {
    await openMatrixMatch(page);
    const setVisibility = (state: 'hidden' | 'visible') =>
      page.evaluate((v) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
        document.dispatchEvent(new Event('visibilitychange'));
      }, state);

    await setVisibility('hidden');
    await expect(page.locator(RAIN)).toHaveAttribute('data-rain-state', 'paused');
    const a = await rainFrame(page);
    await page.waitForTimeout(700);
    expect(await rainFrame(page), '暂停期间画面不变').toBe(a);

    await setVisibility('visible');
    await expect(page.locator(RAIN)).toHaveAttribute('data-rain-state', 'running');
  });

  test('减少动效：系统偏好与 data-motion=reduced 都只留静态一帧，且运行中切换即时生效', async ({
    page,
  }) => {
    await openMatrixMatch(page);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator(RAIN)).toHaveAttribute('data-rain-state', 'static');
    const a = await rainFrame(page);
    await page.waitForTimeout(700);
    expect(await rainFrame(page), '静态一帧不再推进').toBe(a);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(page.locator(RAIN)).toHaveAttribute('data-rain-state', 'running');

    await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'reduced'));
    await expect(page.locator(RAIN)).toHaveAttribute('data-rain-state', 'static');
  });

  test('扫描线：纯 CSS 叠层、不拦截指针，data-fx-off="scan" 关闭', async ({ page }) => {
    await openMatrixMatch(page);
    const layer = page.getByTestId('local-runtime');
    const overlay = () =>
      layer.evaluate((el) => {
        const s = getComputedStyle(el, '::after');
        return { content: s.content, events: s.pointerEvents, image: s.backgroundImage };
      });

    const on = await overlay();
    expect(on.content).toBe('""');
    expect(on.events).toBe('none');
    expect(on.image).toContain('repeating-linear-gradient');

    await page.evaluate(() => document.documentElement.setAttribute('data-fx-off', 'scan'));
    await expect.poll(async () => (await overlay()).content).not.toBe('""');
  });

  test('卡图降饱和：对局里的卡图有滤镜，data-fx-off="desat" 关闭，详情弹窗里的大图始终原色', async ({
    page,
  }) => {
    await openMatrixMatch(page);
    const mobile =
      (await page.getByTestId('local-runtime').getAttribute('data-layout')) === 'mobile';
    // 桌面取座位角色卡的卡图，移动取手牌卡图
    const art = mobile
      ? page.locator('[data-layout="mobile"] [data-testid^="card-"] img').first()
      : page.locator('.ms-card img').first();
    await expect(art).toBeVisible();
    const filterOf = () => art.evaluate((el) => getComputedStyle(el).filter);

    expect(await filterOf()).toContain('saturate');

    // 打开一张详情：弹窗里的大图不降饱和
    await page
      .locator('[data-testid^="vault-thumb-"], [data-testid="human-character-preview"]')
      .first()
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const modalFilter = await dialog
      .locator('img')
      .first()
      .evaluate((el) => getComputedStyle(el).filter);
    expect(modalFilter).toBe('none');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    await page.evaluate(() => document.documentElement.setAttribute('data-fx-off', 'desat'));
    await expect.poll(filterOf).toBe('none');
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
    for (const id of ['noir', 'blueprint', 'totem', 'matrix']) {
      await preselectTheme(page, id);
      await page.goto('/settings');
      await waitForAppReady(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', id);
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
    // 字体文件按用到的字才下载：设置页没有楷体的字，进对局界面（标题、名牌用楷体）后才会下到分片
    await page.goto('/game/debug');
    await waitForAppReady(page);
    await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(() => urls.some((u) => /\.woff2(\?|$)/.test(u)), { timeout: 10_000 })
      .toBe(true);
    // 字体按字符集分片，只下用到的分片：不会把全部 97 片都请求一遍
    expect(urls.filter((u) => /\.woff2(\?|$)/.test(u)).length).toBeLessThan(40);
  });

  test('装饰效果可单独关闭：paper 关纸纹，drift 停掉蝶的漂移与扇动', async ({ page }, testInfo) => {
    test.skip(
      isMobileProject(testInfo.project.name) || isNarrowViewport(page),
      '蝶在桌面的中央舞台里',
    );
    await preselectTheme(page, 'butterfly');
    await page.goto('/game/debug');
    await waitForAppReady(page);
    await expect(page.getByTestId('butterfly-stage')).toBeVisible({ timeout: 10_000 });

    const paper = page.locator('.butterfly-paper').first();
    const flyer = page.locator('.butterfly-flyer').first();
    const wings = page.locator('.butterfly-wings').first();
    await expect(paper).toBeVisible();
    expect(await flyer.evaluate((el) => getComputedStyle(el).animationName)).toBe('ms-drift');
    expect(await wings.evaluate((el) => getComputedStyle(el).animationName)).toBe('ms-flutter');

    await page.evaluate(() => document.documentElement.setAttribute('data-fx-off', 'paper drift'));
    await expect(paper).toBeHidden();
    expect(await flyer.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    expect(await wings.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });

  test('减少动效（系统偏好）下蝶不再动', async ({ page }, testInfo) => {
    test.skip(
      isMobileProject(testInfo.project.name) || isNarrowViewport(page),
      '蝶在桌面的中央舞台里',
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await preselectTheme(page, 'butterfly');
    await page.goto('/game/debug');
    await waitForAppReady(page);
    await expect(page.getByTestId('butterfly-stage')).toBeVisible({ timeout: 10_000 });
    const flyer = page.locator('.butterfly-flyer').first();
    expect(await flyer.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });

  test('中文界面的层签竖排，放不下竖排的矮舞台与英文界面改横排', async ({ page }, testInfo) => {
    test.skip(
      isMobileProject(testInfo.project.name) || isNarrowViewport(page),
      '中央舞台只在桌面视口出现',
    );
    await page.setViewportSize({ width: 1920, height: 1080 });
    await preselectTheme(page, 'butterfly');
    await page.goto('/game/debug');
    await waitForAppReady(page);
    const tag = page.getByTestId('layer-focus-2');
    await expect(tag).toBeVisible({ timeout: 10_000 });
    const mode = () => tag.evaluate((el) => getComputedStyle(el).writingMode);
    expect(await mode()).toBe('vertical-rl');

    // 英文界面：舞台根元素的 lang 不是 zh，层签保持横排
    await page.getByTestId('butterfly-stage').evaluate((el) => el.setAttribute('lang', 'en'));
    expect(await mode()).toBe('horizontal-tb');
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
  test('梦境矩阵：关掉背景动画后数字雨停掉，刷新后仍是关，重新打开后恢复', async ({ page }) => {
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

    await page.goto('/game/debug');
    await waitForAppReady(page);
    await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(RAIN)).toHaveAttribute('data-rain-state', 'off');

    await page.goto('/settings');
    await waitForAppReady(page);
    await switchByName(page, /背景动画|Background animation/).click();
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
    await expect(page.getByRole('switch')).toHaveCount(0);
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
    await expect(html).toHaveAttribute('data-fx-off', 'rain totem flow blink drift scan');
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

  test('梦境矩阵：系统要求减少动效时数字雨只画静态一帧；选「不减少」后盖过系统偏好照常运行', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await preselectTheme(page, 'matrix');
    await page.goto('/game/debug');
    await waitForAppReady(page);
    await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(RAIN)).toHaveAttribute('data-rain-state', 'static');
    expect(await probeTransitionDuration(page)).toBe('0.001s');

    await page.goto('/settings');
    await waitForAppReady(page);
    await motionOption(page, 'full').click();
    await page.goto('/game/debug');
    await waitForAppReady(page);
    await expect(page.locator(RAIN)).toHaveAttribute('data-rain-state', 'running');
    // 样式侧同样让位：全局的 1ms 动画压缩不再生效
    expect(await probeTransitionDuration(page)).toBe('3s');
  });
});

/** 筑梦蓝图：每块斜切楼板里的文字与控件都要落在该楼板的顶面平行四边形之内 */
const SLAB_BOUNDS = () => {
  const violations: string[] = [];
  for (const plane of document.querySelectorAll('[data-testid^="layer-row-"]')) {
    const svg = plane.querySelector('svg.blueprint-slab')!;
    const poly = svg.querySelector('.blueprint-slab-top')!;
    const vb = (svg as SVGSVGElement).viewBox.baseVal;
    const sr = svg.getBoundingClientRect();
    const [tl, tr, br, bl] = poly
      .getAttribute('points')!
      .split(' ')
      .map((s) => s.split(',').map(Number))
      .map(([x, y]) => [
        sr.left + (x! / vb.width) * sr.width,
        sr.top + (y! / vb.height) * sr.height,
      ]);
    const xAt = (y: number, a: number[], c: number[]) =>
      a[0]! + ((y - a[1]!) / (c[1]! - a[1]!)) * (c[0]! - a[0]!);
    const inside = (x: number, y: number) =>
      y >= tl![1]! - 0.5 &&
      y <= bl![1]! + 0.5 &&
      x >= xAt(y, tl!, bl!) - 0.5 &&
      x <= xAt(y, tr!, br!) + 0.5;
    const corners = (r: DOMRect) =>
      [
        [r.left, r.top],
        [r.right, r.top],
        [r.left, r.bottom],
        [r.right, r.bottom],
      ] as const;
    const walker = document.createTreeWalker(plane, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim() || n.parentElement!.closest('svg')) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.width === 0 || r.height === 0) continue;
        if (!corners(r).every(([x, y]) => inside(x, y))) {
          violations.push(`${(plane as HTMLElement).dataset['testid']}: "${n.textContent.trim()}"`);
        }
      }
    }
    for (const el of plane.querySelectorAll('button')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (!corners(r).every(([x, y]) => inside(x, y))) {
        violations.push(
          `${(plane as HTMLElement).dataset['testid']}: button ${el.getAttribute('data-testid')}`,
        );
      }
    }
  }
  return violations;
};

test.describe('主题 Theme · 筑梦蓝图的楼板', () => {
  const CASES = [
    { w: 1024, h: 768, players: 10 },
    { w: 1024, h: 768, players: 4 },
    { w: 1280, h: 800, players: 6 },
    { w: 1920, h: 1080, players: 10 },
  ] as const;
  for (const c of CASES) {
    test(`${c.w}×${c.h}、${c.players} 人：各层文字与按钮都在各自楼板的顶面之内（含逐层设为焦点层）`, async ({
      page,
    }, testInfo) => {
      test.skip(isMobileProject(testInfo.project.name), '中央舞台只在桌面视口出现');
      await page.setViewportSize({ width: c.w, height: c.h });
      await preselectTheme(page, 'blueprint');
      await page.goto(`/game/debug?players=${c.players}`);
      await waitForAppReady(page);
      await expect(page.getByTestId('blueprint-stage')).toBeVisible({ timeout: 10_000 });
      expect(await page.evaluate(SLAB_BOUNDS), '默认焦点层').toEqual([]);
      for (const layer of [0, 1, 2, 3, 4]) {
        await page.getByTestId(`layer-focus-${layer}`).click();
        await expect(page.getByTestId(`layer-row-${layer}`)).toHaveAttribute('data-focus', 'true');
        expect(await page.evaluate(SLAB_BOUNDS), `焦点层 ${layer}`).toEqual([]);
      }
    });
  }
});
