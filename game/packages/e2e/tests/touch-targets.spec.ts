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
import { seedSave, validMeta } from './fixtures/localSave.js';
import { ROOM_CODE, mockRoomSession } from './fixtures/roomSession.js';

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
  ['短语入口与座位气泡', '/game/debug?chat=1'],
  ['意念判官的出牌', '/game/debug?character=sudger'],
  ['结算：局后举报区', '/game/debug?outcome=1'],
  ['本人在迷失层（复活入口）', '/game/debug?dead=1'],
  ['同伴在迷失层（复活同伴入口）', '/game/debug?dead=mate'],
  ['梦主 + 同伴在迷失层（两个入口）', '/game/debug?as=master&dead=mate'],
  ['梦主的梦境窥视选目标', '/game/debug?as=master&bribe=1'],
  ['抽牌阶段（略过抽牌）', '/game/debug?skill=draw'],
  ['抽牌阶段（略过抽牌 + 小丑·失控）', '/game/debug?skill=joker'],
  ['【解封】打不出（心锁为 0）', '/game/debug?skill=unlock-none'],
  ['抽牌阶段（黑天鹅·纷飞）', '/game/debug?skill=black-swan'],
  ['应答：白羊·星尘（邪念瘟疫）', '/game/debug?pending=aries-plague'],
  ['应答：黑洞·吞噬', '/game/debug?pending=levy'],
  ['应答：达尔文·淘汰', '/game/debug?pending=darwin'],
  ['应答：雅典娜·急智', '/game/debug?pending=athena'],
  ['抽牌阶段（黑洞·吞噬）', '/game/debug?skill=black-hole-draw'],
  ['金库三选一（回音萦绕）', '/game/debug?as=master&vault=echo'],
] as const;

test.describe('触控目标 · 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const [name, url] of PAGES) {
    test(`页面：${name}`, async ({ page }) => {
      await openPage(page, url);
      await expectTouchClean(page, name);
    });
  }

  test('页面：房间页（分享区，二维码展开）', async ({ page }) => {
    await mockRoomSession(page);
    await openPage(page, `/room/${ROOM_CODE}`);
    await expect(page.getByTestId('room-share')).toBeVisible({ timeout: 10_000 });
    await expectTouchClean(page, '房间页分享区');
    await page.getByTestId('room-qr-toggle').click();
    await expect(page.getByTestId('room-qr')).toBeVisible();
    await expectTouchClean(page, '房间页分享区（二维码展开）');
  });

  test('页面：设置页账号区的头像「换一个」', async ({ page }) => {
    await mockRoomSession(page);
    await openPage(page, '/settings');
    await expect(page.getByTestId('settings-avatar-roll')).toBeVisible({ timeout: 10_000 });
    await expectTouchClean(page, '设置页头像');
  });

  test('页面：本地对局的「继续上一局」提示', async ({ page }) => {
    await openPage(page, '/local');
    await seedSave(page, validMeta({ playerCount: 5, turn: 3 }));
    await page.reload();
    await expect(page.getByTestId('local-resume-prompt')).toBeVisible({ timeout: 10_000 });
    await expectTouchClean(page, '继续上一局提示');
  });

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

  test('对局：预设短语抽屉（分类标签、短语按钮、最近消息展开）', async ({ page }) => {
    await openScene(page, '/game/debug?chat=1');
    await page.getByTestId('dock-chat').click();
    await expect(page.getByTestId('chat-sheet')).toBeVisible();
    await page.getByTestId('chat-recent-toggle').click();
    await expect(page.getByTestId('chat-recent')).toBeVisible();
    await expectTouchClean(page, '短语抽屉');
    await page.getByTestId('chat-tab-tactic').click();
    await expectTouchClean(page, '短语抽屉（战术分类）');
  });

  test('对局：举报弹窗（选理由、填说明、提交结果）', async ({ page }) => {
    await openScene(page, '/game/debug?outcome=1');
    await page.getByTestId('report-button-1').click();
    await expect(page.getByTestId('report-dialog')).toBeVisible();
    await expectTouchClean(page, '举报弹窗');
    await page.getByTestId('report-reason-afk').check();
    await page.getByTestId('report-submit').click();
    await expect(page.getByTestId('report-result')).toBeVisible();
    await expectTouchClean(page, '举报弹窗（结果）');
  });

  test('对局：复活弹层与梦主移动弹层', async ({ page }) => {
    await openScene(page, '/game/debug?dead=1');
    await page.getByTestId('dock-entry-revive-self').click();
    await expect(page.getByTestId('revive-dialog')).toBeVisible();
    await page.getByTestId('revive-card-0').click();
    await expectTouchClean(page, '复活弹层（本人）');

    await openScene(page, '/game/debug?as=master&dead=mate');
    await page.getByTestId('dock-entry-revive-other').click();
    await expect(page.getByTestId('revive-dialog')).toBeVisible();
    await expectTouchClean(page, '复活弹层（同伴）');
    await page.keyboard.press('Escape');

    await page.getByTestId('dock-entry-move').click();
    await expect(page.getByTestId('target-layer-picker-dialog')).toBeVisible();
    await expectTouchClean(page, '梦主移动弹层');
  });

  test('对局：技能面板（置灰项与原因、选目标、选层、选牌）', async ({ page }) => {
    await openScene(page, '/game/debug?skill=chemist');
    await page.getByTestId('dock-skill').click();
    await expect(page.getByTestId('skill-sheet')).toBeVisible();
    await expect(page.getByTestId('active-skill-reason-playChemistRefine')).toBeVisible();
    await expectTouchClean(page, '技能面板（含置灰项）');
    await page.getByTestId('active-skill-playChemistInject').click();
    await expect(page.getByTestId('active-skill-player-layer-picker')).toBeVisible();
    await expectTouchClean(page, '技能面板（选目标）');
    await page
      .getByTestId(/^active-skill-pl-target-\d+$/)
      .first()
      .click();
    await expectTouchClean(page, '技能面板（选层）');

    await openScene(page, '/game/debug?skill=passage');
    await page.getByTestId('dock-skill').click();
    await page.getByTestId('active-skill-playSecretPassageTeleport').click();
    await page
      .getByTestId(/^active-skill-pc-target-\d+$/)
      .first()
      .click();
    await expectTouchClean(page, '技能面板（选牌）');
  });

  test('对局：黑天鹅·纷飞的分发弹层', async ({ page }) => {
    await openScene(page, '/game/debug?skill=black-swan');
    await page.getByTestId('dock-entry-tour').click();
    await expect(page.getByTestId('black-swan-tour-dialog')).toBeVisible();
    await expectTouchClean(page, '分发弹层（未选）');
    await page
      .getByTestId(/^tour-recipient-\d+$/)
      .first()
      .click();
    await page.getByTestId('tour-card-0').click();
    await expectTouchClean(page, '分发弹层（已分配一张）');
  });

  test('对局：分步表单技能（露娜、格林射线、射手、水瓶、金星复制）', async ({ page }) => {
    await openScene(page, '/game/debug?skill=luna');
    await page.getByTestId('dock-skill').click();
    await page.getByTestId('active-skill-playLunaFullMoon').click();
    await expect(page.getByTestId('active-skill-step-form')).toBeVisible();
    await page
      .getByTestId(/^active-skill-step-card-\d+$/)
      .nth(0)
      .click();
    await expectTouchClean(page, '分步表单（选牌）');
    await page
      .getByTestId(/^active-skill-step-card-\d+$/)
      .nth(1)
      .click();
    await page.getByTestId('active-skill-step-next').click();
    await expectTouchClean(page, '分步表单（选可不选的玩家）');

    await openScene(page, '/game/debug?skill=green-ray');
    await page.getByTestId('dock-skill').click();
    await page.getByTestId('active-skill-playGreenRayArrest').click();
    await page
      .getByTestId(/^active-skill-step-card-\d+$/)
      .first()
      .click();
    await page.getByTestId('active-skill-step-next').click();
    await expectTouchClean(page, '分步表单（选层）');
    await page.getByTestId('active-skill-step-layer-1').click();
    await expectTouchClean(page, '分步表单（选目标，可不选）');

    await openScene(page, '/game/debug?skill=heart-lock');
    await page.getByTestId('dock-skill').click();
    await page.getByTestId('active-skill-useSagittariusHeartLock').click();
    await expectTouchClean(page, '分步表单（选增减）');

    await openScene(page, '/game/debug?skill=aquarius');
    await page.getByTestId('dock-skill').click();
    await page.getByTestId('active-skill-playAquariusCoherence').click();
    await expectTouchClean(page, '分步表单（选弃牌堆里的牌）');

    await openScene(page, '/game/debug?skill=nightmare');
    await page.getByTestId('dock-skill').click();
    await page.getByTestId('active-skill-masterActivateNightmare').click();
    await page.getByTestId('active-skill-step-layer-1').click();
    await expect(page.getByTestId('active-skill-nm-plague')).toBeVisible();
    await expectTouchClean(page, '分步表单（邪念瘟疫点名）');
  });

  test('对局：金库三选一展开发动梦魇的参数', async ({ page }) => {
    await openScene(page, '/game/debug?as=master&vault=plague');
    await page.getByTestId('vault-decision-nightmare-activate').click();
    await expect(page.getByTestId('vault-decision-plague')).toBeVisible();
    await expectTouchClean(page, '金库三选一（邪念瘟疫点名）');
    await openScene(page, '/game/debug?as=master&vault=echo');
    await page.getByTestId('vault-decision-nightmare-activate').click();
    await expect(page.getByTestId('vault-decision-echo')).toBeVisible();
    await expectTouchClean(page, '金库三选一（回音萦绕）');
  });

  test('对局：射手的选目标弹窗（禁足开关）', async ({ page }) => {
    await openScene(page, '/game/debug?skill=sagittarius');
    await page.locator('[data-testid^="card-"][title="SHOOT"]').first().click();
    await page.getByTestId('hand-commit-play').click();
    await expect(page.getByTestId('prevent-move-toggle')).toBeVisible();
    await expectTouchClean(page, '射手选目标弹窗');
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
