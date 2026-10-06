// 触控目标审计（移动项目）：390×844 下主要页面与对局状态里，所有可交互元素的命中区不小于 44×44
//
// 命中区的量法见 fixtures/responsive.ts 的 auditTouchTargets：靠 padding / min-h / 伪元素扩大点击区域都算数，
// 被相邻目标盖住也会被抓出来（相邻目标的命中区不得重叠）。
//
// 豁免清单（只有这几类，其余一律要达标）：
//   1. 夹在正文里的行内文字链接（WCAG 2.5.8 行内例外）；
//   2. 「跳到主内容」链接（平时在屏幕外，只在键盘聚焦时出现）；
//   3. 不可见 / aria-hidden / inert 的元素。
// 对局里需要真实对局才能出现的状态（角色技能面板的按钮、联机对局的响应窗口）没有固定场景，
// 它们落在 Sheet / Dialog / Popover 里，由这些外壳统一把按钮撑到 44px（coarse 变体），
// 并在人工审计脚本里用真实对局核对过。

import type { Page } from '@playwright/test';
import { test, expect, isMobileProject, waitForAppReady } from './fixtures/index.js';
import { auditTouchTargets } from './fixtures/responsive.js';

// eslint-disable-next-line no-empty-pattern -- Playwright 要求第一个参数是解构形式，这里只需要 testInfo
test.beforeEach(({}, testInfo) => {
  test.skip(!isMobileProject(testInfo.project.name), '触控目标只在移动项目里审计');
});

async function expectTouchClean(page: Page, what: string): Promise<void> {
  // 过渡动画（弹窗淡入、坞展开）结束后再量
  await page.waitForTimeout(500);
  const bad = await auditTouchTargets(page);
  expect(
    bad,
    `${what}：命中区不足 44×44 或被相邻目标盖住的元素\n${JSON.stringify(bad, null, 2)}`,
  ).toEqual([]);
}

async function openPage(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await waitForAppReady(page);
  await page.waitForTimeout(500);
}

async function openScene(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await waitForAppReady(page);
  await expect(page.getByTestId('hand-dock')).toBeVisible({ timeout: 10_000 });
}

const PAGES = [
  ['首页', '/'],
  ['大厅', '/lobby'],
  ['房间页', '/room/ABCD'],
  ['设置', '/settings'],
  ['教程', '/tutorial'],
  ['关于', '/about'],
  ['本地对局设置页', '/local'],
] as const;

const SCENES = [
  ['盗梦者视角', '/game/debug'],
  ['梦主视角', '/game/debug?as=master'],
  ['响应窗口', '/game/debug?pending=1'],
  ['弃牌阶段', '/game/debug?discard=1'],
  ['10 人', '/game/debug?players=10'],
  ['应答：被 SHOOT 的双鱼', '/game/debug?pending=shoot'],
  ['应答：恐怖分子狂热', '/game/debug?pending=terrorist'],
  ['应答：天秤分牌', '/game/debug?pending=libra-split'],
  ['应答：天秤挑一份', '/game/debug?pending=libra-pick'],
  ['应答：意念判官', '/game/debug?pending=sudger'],
  ['应答：处女·完美', '/game/debug?pending=virgo'],
  ['应答：白羊·星尘', '/game/debug?pending=aries'],
  ['棋局易位弹窗', '/game/debug?as=master&chess=1'],
] as const;

test.describe('触控目标 · 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const [name, url] of PAGES) {
    test(`页面：${name}`, async ({ page }) => {
      await openPage(page, url);
      await expectTouchClean(page, name);
    });
  }

  for (const [name, url] of SCENES) {
    test(`对局：${name}`, async ({ page }) => {
      await openScene(page, url);
      await expectTouchClean(page, name);
    });
  }

  test('对局：卡牌详情、金库详情、选中手牌、选目标弹窗', async ({ page }) => {
    await openScene(page, '/game/debug');

    await page.getByTestId('human-character-preview').click();
    await expect(page.getByTestId('card-detail-modal')).toBeVisible();
    await expectTouchClean(page, '角色卡牌详情');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('card-detail-modal')).toHaveCount(0);

    await page.locator('[data-testid^="vault-thumb-"]').first().click();
    await expect(page.getByTestId('card-detail-modal')).toBeVisible();
    await expectTouchClean(page, '金库详情');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('card-detail-modal')).toHaveCount(0);

    await page.locator('[data-testid^="card-"][title="SHOOT"]').first().click();
    await expect(page.getByTestId('hand-commit-play')).toBeVisible();
    await expectTouchClean(page, '选中手牌后的展开坞');

    await page.getByTestId('hand-commit-play').click();
    await expect(page.getByTestId('target-player-picker-dialog')).toBeVisible();
    await expectTouchClean(page, '选目标弹窗');
  });

  test('对局：应答弹窗（分牌、复活、回音萦绕）', async ({ page }) => {
    await openScene(page, '/game/debug?pending=libra-split');
    await page.getByTestId('awaited-action-split').click();
    await expect(page.getByTestId('awaited-sheet')).toBeVisible();
    await page.getByTestId('awaited-card-0').click();
    await expectTouchClean(page, '分牌弹窗');

    await openScene(page, '/game/debug?pending=virgo');
    await page.getByTestId('awaited-action-revive').click();
    await expect(page.getByTestId('awaited-sheet')).toBeVisible();
    await expectTouchClean(page, '复活弹窗');

    await openScene(page, '/game/debug?pending=aries');
    await page.getByTestId('awaited-action-activate').click();
    await expect(page.getByTestId('awaited-sheet')).toBeVisible();
    await expectTouchClean(page, '回音萦绕弹窗');
  });

  test('对局：弃牌阶段选牌后', async ({ page }) => {
    await openScene(page, '/game/debug?discard=1');
    await page.getByTestId('card-0').click();
    await page.getByTestId('card-1').click();
    await expectTouchClean(page, '弃牌选牌后');
  });

  for (const themeId of ['blueprint', 'totem', 'matrix', 'butterfly'] as const) {
    test(`对局：主题 ${themeId}`, async ({ page }) => {
      await page.addInitScript((id) => {
        try {
          localStorage.setItem('icgame-theme', id);
        } catch {
          /* 无存储时按缺省主题 */
        }
      }, themeId);
      await openScene(page, '/game/debug');
      await expectTouchClean(page, `主题 ${themeId}`);
    });
  }
});

test.describe('触控目标 · 平板竖屏 768×1024', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  for (const [name, url] of SCENES.slice(0, 4)) {
    test(`对局：${name}`, async ({ page }) => {
      await openScene(page, url);
      await expectTouchClean(page, `平板 ${name}`);
    });
  }
});

test.describe('触控目标 · 手机横屏 844×390', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  for (const [name, url] of SCENES.slice(0, 4)) {
    test(`对局：${name}`, async ({ page }) => {
      await openScene(page, url);
      await expectTouchClean(page, `横屏 ${name}`);
    });
  }
});
