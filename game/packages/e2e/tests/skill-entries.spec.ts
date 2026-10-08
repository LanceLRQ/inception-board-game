// 抽牌阶段入口、角色技能面板（背面技能、药剂师、空间女王、黑洞、皇城、土星、金星、密道、梦魇）、
// 【解封】预判、SHOOT 跨层目标与射手·禁足的端到端用例。
// 固定场景里发出的 move 只记日志（频道 game/fixture），所以读控制台日志断言发出了什么。
// 桌面与移动两种布局都跑：技能面板在桌面是「技能」按钮的浮层，在移动是从坞升起的抽屉，内容是同一个面板。

import type { Page } from '@playwright/test';
import { test, expect, selectAndPlayCard, waitForAppReady } from './fixtures/index.js';

interface SentMove {
  move: string;
  args: unknown[];
}

function recordMoves(page: Page): SentMove[] {
  const sent: SentMove[] = [];
  page.on('console', (msg) => {
    if (!msg.text().includes('move dispatched')) return;
    void msg
      .args()[1]
      ?.jsonValue()
      .then((ctx: { move: string; args: unknown[] }) => {
        sent.push({ move: ctx.move, args: ctx.args });
      });
  });
  return sent;
}

async function openScene(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await waitForAppReady(page);
  await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('hand-dock')).toBeVisible();
}

async function openSkillPanel(page: Page): Promise<void> {
  await page.getByTestId('dock-skill').click();
  await expect(page.getByTestId('active-skill-panel')).toBeVisible();
}

const skillButton = (page: Page, move: string) => page.getByTestId(`active-skill-${move}`);

/** 手牌里第 n 张的 data-testid 序号（按牌名找，同名取第一张） */
async function handIndexOf(page: Page, title: string): Promise<number> {
  const card = page
    .getByTestId('human-hand')
    .locator(`[data-testid^="card-"][title="${title}"]`)
    .first();
  return Number(((await card.getAttribute('data-testid')) ?? '').replace('card-', ''));
}

test.describe('抽牌阶段 · 按钮组', () => {
  test('抽牌阶段有「抽牌」「跳过抽牌」，点「跳过抽牌」发出 skipDraw', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=draw');

    await expect(page.getByTestId('action-draw')).toBeVisible();
    const skip = page.getByTestId('dock-entry-skip-draw');
    await expect(skip).toBeVisible();
    await expect(skip).not.toHaveAttribute('aria-disabled', 'true');
    // 不是小丑：没有「小丑·失控」
    await expect(page.getByTestId('dock-entry-joker')).toHaveCount(0);

    await skip.click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]).toEqual({ move: 'skipDraw', args: [] });
  });

  test('小丑多一个「小丑·失控」，点它发出 playJokerGamble', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=joker');

    await expect(page.getByTestId('dock-entry-skip-draw')).toBeVisible();
    const joker = page.getByTestId('dock-entry-joker');
    await expect(joker).toBeVisible();
    await joker.click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]).toEqual({ move: 'playJokerGamble', args: [] });
  });

  test('出牌阶段没有这两个入口', async ({ page }) => {
    await openScene(page, '/game/debug');
    await expect(page.getByTestId('dock-entry-skip-draw')).toHaveCount(0);
    await expect(page.getByTestId('dock-entry-joker')).toHaveCount(0);
  });
});

test.describe('背面技能与药剂师', () => {
  test('翻到背面的双子：技能面板里有「双子·抉择」，点它发出 playGeminiChoice', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=gemini-back');
    await openSkillPanel(page);

    const choice = skillButton(page, 'playGeminiChoice');
    await expect(choice).toBeVisible();
    await expect(choice).not.toHaveAttribute('aria-disabled', 'true');
    // 正面的「双子·命运」不在这里（那是弃牌阶段的技能）
    await expect(skillButton(page, 'playGeminiSync')).toHaveCount(0);
    await choice.click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]).toEqual({ move: 'playGeminiChoice', args: [] });
  });

  test('药剂师：弃牌堆里没有梦境穿梭剂时「调剂」置灰并说明；「注射」选同层玩家再选相邻层', async ({
    page,
  }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=chemist');
    await openSkillPanel(page);

    const refine = skillButton(page, 'playChemistRefine');
    await expect(refine).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('active-skill-reason-playChemistRefine')).toContainText(
      '弃牌堆里没有梦境穿梭剂',
    );

    await skillButton(page, 'playChemistInject').click();
    const targets = page.getByTestId(/^active-skill-pl-target-\d+$/);
    // 同层的另一名盗梦者（固定场景里本人在第 2 层，只有一位同伴同层）
    await expect(targets).toHaveCount(1);
    await targets.first().click();
    // 目标在第 2 层：只能移到第 1 层或第 3 层
    await expect(page.getByTestId('active-skill-pl-layer-1')).toBeVisible();
    await expect(page.getByTestId('active-skill-pl-layer-3')).toBeVisible();
    await expect(page.getByTestId('active-skill-pl-layer-2')).toHaveCount(0);
    await expect(page.getByTestId('active-skill-pl-layer-4')).toHaveCount(0);
    await page.getByTestId('active-skill-pl-layer-3').click();

    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]!.move).toBe('playChemistInject');
    expect(sent[0]!.args).toHaveLength(2);
    expect(typeof sent[0]!.args[0]).toBe('string');
    expect(sent[0]!.args[1]).toBe(3);
  });
});

test.describe('现有参数形态补上的技能入口', () => {
  test('空间女王·造物：弃牌阶段选 1 张手牌，发出 useSpaceQueenStashTop(牌)', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=space-queen');
    await openSkillPanel(page);

    await skillButton(page, 'useSpaceQueenStashTop').click();
    await expect(page.getByTestId('active-skill-card-picker')).toBeVisible();
    await page.getByTestId('active-skill-card-0').click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]!.move).toBe('useSpaceQueenStashTop');
    expect(typeof sent[0]!.args[0]).toBe('string');
  });

  test('黑洞·吸纳：只列有存活玩家的相邻层', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=black-hole');
    await openSkillPanel(page);

    await skillButton(page, 'useBlackHoleAbsorb').click();
    await expect(page.getByTestId('active-skill-layer-picker')).toBeVisible();
    // 本人在第 2 层：相邻的第 1、3 层都有人
    await expect(page.getByTestId('active-skill-layer-1')).toBeVisible();
    await expect(page.getByTestId('active-skill-layer-3')).toBeVisible();
    await expect(page.getByTestId('active-skill-layer-2')).toHaveCount(0);
    await expect(page.getByTestId('active-skill-layer-4')).toHaveCount(0);
    await page.getByTestId('active-skill-layer-1').click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]).toEqual({ move: 'useBlackHoleAbsorb', args: [1] });
  });

  test('皇城世界观：选一名没收到贿赂牌的盗梦者，发出 useImperialCityWorldShoot(目标)', async ({
    page,
  }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=imperial');
    await openSkillPanel(page);

    await skillButton(page, 'useImperialCityWorldShoot').click();
    await expect(page.getByTestId('active-skill-target-picker')).toBeVisible();
    // 目标不含梦主与本人：6 人局里是另外 4 名盗梦者
    const targets = page.getByTestId(/^active-skill-target-\d+$/);
    await expect(targets).toHaveCount(4);
    await targets.first().click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]!.move).toBe('useImperialCityWorldShoot');
    expect(sent[0]!.args).toHaveLength(1);
  });

  test('金星·重影（梦主）：多选手牌后确认，发出 useVenusDouble([牌])', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=venus');
    await openSkillPanel(page);

    await skillButton(page, 'useVenusDouble').click();
    await expect(page.getByTestId('active-skill-multi-card-picker')).toBeVisible();
    const confirm = page.getByTestId('active-skill-confirm-mc');
    await expect(confirm).toBeDisabled();
    await page.getByTestId('active-skill-mc-card-0').click();
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]!.move).toBe('useVenusDouble');
    expect(Array.isArray(sent[0]!.args[0])).toBe(true);
    expect((sent[0]!.args[0] as unknown[]).length).toBe(1);
  });
});

test.describe('界面可点但引擎必拒：按引擎条件过滤', () => {
  test('土星·领地：持贿赂的盗梦者只能去相邻层', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=saturn');
    await openSkillPanel(page);

    await skillButton(page, 'useSaturnFreeMove').click();
    await expect(page.getByTestId('active-skill-layer-1')).toBeVisible();
    await expect(page.getByTestId('active-skill-layer-3')).toBeVisible();
    await expect(page.getByTestId('active-skill-layer-2')).toHaveCount(0);
    await expect(page.getByTestId('active-skill-layer-4')).toHaveCount(0);
    await page.getByTestId('active-skill-layer-3').click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]).toEqual({ move: 'useSaturnFreeMove', args: [3] });
  });

  test('缺省场景（梦主不是土星、没有贿赂牌）没有土星入口', async ({ page }) => {
    await openScene(page, '/game/debug');
    await openSkillPanel(page).catch(() => undefined);
    await expect(skillButton(page, 'useSaturnFreeMove')).toHaveCount(0);
  });

  test('密道·传送（梦主）：手牌里只能选梦境穿梭剂', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=passage');
    await openSkillPanel(page);

    await skillButton(page, 'playSecretPassageTeleport').click();
    await page
      .getByTestId(/^active-skill-pc-target-\d+$/)
      .first()
      .click();
    const cards = page.getByTestId(/^active-skill-pc-card-\d+$/);
    await expect(cards).toHaveCount(1);
    await cards.first().click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]!.move).toBe('playSecretPassageTeleport');
    expect(sent[0]!.args[1]).toBe('action_dream_transit');
  });

  test('梦魇：弃掉列出两层已翻开的梦魇，发动不列回音萦绕那一层', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=nightmare');
    await openSkillPanel(page);

    await skillButton(page, 'masterDiscardNightmare').click();
    await expect(page.getByTestId('active-skill-layer-2')).toBeVisible();
    await expect(page.getByTestId('active-skill-layer-3')).toBeVisible();
    await expect(page.getByTestId('active-skill-layer-1')).toHaveCount(0);
    await page.getByTestId('active-skill-cancel-layer').click();

    await skillButton(page, 'masterActivateNightmare').click();
    await expect(page.getByTestId('active-skill-layer-2')).toBeVisible();
    await expect(page.getByTestId('active-skill-layer-3')).toHaveCount(0);
    await page.getByTestId('active-skill-layer-2').click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]).toEqual({ move: 'masterActivateNightmare', args: [2] });
  });

  test('【解封】：所在层心锁为 0 时打不出', async ({ page }) => {
    await openScene(page, '/game/debug?skill=unlock-none');
    const unlock = await handIndexOf(page, '解封');
    await page.getByTestId(`card-${unlock}`).click();
    await expect(page.getByTestId('hand-commit-play')).toHaveCount(0);
  });

  test('【解封】：本回合解封次数用尽时打不出；缺省场景可以打', async ({ page }) => {
    await openScene(page, '/game/debug?skill=unlock-spent');
    const unlock = await handIndexOf(page, '解封');
    await page.getByTestId(`card-${unlock}`).click();
    await expect(page.getByTestId('hand-commit-play')).toHaveCount(0);

    await openScene(page, '/game/debug');
    await page.getByTestId(`card-${await handIndexOf(page, '解封')}`).click();
    await expect(page.getByTestId('hand-commit-play')).toBeVisible();
  });
});

test.describe('SHOOT 的目标限制与射手·禁足', () => {
  test('缺省场景：跨层目标置灰', async ({ page }) => {
    await openScene(page, '/game/debug');
    await selectAndPlayCard(page, await handIndexOf(page, 'SHOOT'));
    await expect(page.getByTestId('target-player-picker-dialog')).toBeVisible();
    await expect(
      page.getByTestId(/^target-player-\d+$/).and(page.locator('[data-reason="sameLayer"]')),
    ).not.toHaveCount(0);
  });

  test('恐怖分子·远程：任意层的目标都可选', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=terrorist');
    await selectAndPlayCard(page, await handIndexOf(page, 'SHOOT'));
    await expect(page.getByTestId('target-player-picker-dialog')).toBeVisible();
    await expect(page.locator('[data-reason="sameLayer"]')).toHaveCount(0);
    const options = page.getByTestId(/^target-player-\d+$/);
    const total = await options.count();
    await expect(options.and(page.locator(':enabled'))).toHaveCount(total);
    // 点一个跨层的目标，发出 playShoot
    await options.and(page.locator('[title*="允许"]')).first().click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]!.move).toBe('playShoot');
  });

  test('射手：目标弹窗里有「禁足」开关，勾选后 playShoot 末位带 true', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=sagittarius');
    await selectAndPlayCard(page, await handIndexOf(page, 'SHOOT'));
    await expect(page.getByTestId('target-player-picker-dialog')).toBeVisible();

    const toggle = page.getByTestId('prevent-move-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page
      .getByTestId(/^target-player-\d+$/)
      .and(page.locator(':enabled'))
      .first()
      .click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]!.move).toBe('playShoot');
    expect(sent[0]!.args[1]).toBe('action_shoot');
    expect(sent[0]!.args[3]).toBe(true);
  });

  test('射手不勾选：参数里没有禁足；别的角色没有这个开关', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=sagittarius');
    await selectAndPlayCard(page, await handIndexOf(page, 'SHOOT'));
    await page
      .getByTestId(/^target-player-\d+$/)
      .and(page.locator(':enabled'))
      .first()
      .click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]!.args).toHaveLength(2);

    await openScene(page, '/game/debug');
    await selectAndPlayCard(page, await handIndexOf(page, 'SHOOT'));
    await expect(page.getByTestId('target-player-picker-dialog')).toBeVisible();
    await expect(page.getByTestId('prevent-move-toggle')).toHaveCount(0);
  });
});
