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

  test('梦魇：弃掉与发动都列出三层已翻开的梦魇；不需要参数的梦魇直接发动', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=nightmare');
    await openSkillPanel(page);

    await skillButton(page, 'masterDiscardNightmare').click();
    for (const layer of [1, 2, 3]) {
      await expect(page.getByTestId(`active-skill-layer-${layer}`)).toBeVisible();
    }
    await expect(page.getByTestId('active-skill-layer-4')).toHaveCount(0);
    await page.getByTestId('active-skill-cancel-layer').click();

    await skillButton(page, 'masterActivateNightmare').click();
    for (const layer of [1, 2, 3]) {
      await expect(page.getByTestId(`active-skill-step-layer-${layer}`)).toBeVisible();
    }
    await expect(page.getByTestId('active-skill-step-layer-4')).toHaveCount(0);
    // 第 2 层是致命漩涡，不需要参数：点层就发动
    await page.getByTestId('active-skill-step-layer-2').click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]).toEqual({ move: 'masterActivateNightmare', args: [2] });
  });

  test('梦魇：回音萦绕发动要先选层与方式，选完才能确认', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=nightmare');
    await openSkillPanel(page);

    await skillButton(page, 'masterActivateNightmare').click();
    await page.getByTestId('active-skill-step-layer-3').click();
    const confirm = page.getByTestId('active-skill-step-next');
    await expect(page.getByTestId('active-skill-nm-echo')).toBeVisible();
    await expect(confirm).toBeDisabled();
    await page.getByTestId('active-skill-nm-echo-layer-2').click();
    await expect(confirm).toBeDisabled();
    await page.getByTestId('active-skill-nm-echo-restore').click();
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]).toEqual({
      move: 'masterActivateNightmare',
      args: [3, { targetLayer: 2, action: 'restore' }],
    });
  });

  test('梦魇：邪念瘟疫发动要点名派发贿赂牌的盗梦者；可以不点名；能退回上一步', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=nightmare');
    await openSkillPanel(page);

    await skillButton(page, 'masterActivateNightmare').click();
    await page.getByTestId('active-skill-step-layer-1').click();
    await expect(page.getByTestId('active-skill-nm-plague')).toBeVisible();
    const candidates = page.getByTestId(/^active-skill-nm-plague-\d+$/);
    expect(await candidates.count()).toBeGreaterThanOrEqual(2);
    const first = candidates.first();
    const id = ((await first.getAttribute('data-testid')) ?? '').replace(
      'active-skill-nm-plague-',
      '',
    );
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('active-skill-nm-plague-count')).toContainText('1');
    // 退回上一步重选层
    await page.getByTestId('active-skill-step-back').click();
    await expect(page.getByTestId('active-skill-step-layers')).toBeVisible();
    await page.getByTestId('active-skill-step-layer-1').click();
    // 回到参数步骤时，之前的点名已清空
    await expect(page.getByTestId('active-skill-nm-plague-count')).toContainText('0');
    await candidates.first().click();
    await page.getByTestId('active-skill-step-next').click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]).toEqual({
      move: 'masterActivateNightmare',
      args: [1, { bribedTargets: [id] }],
    });
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

test.describe('黑天鹅·纷飞（抽牌阶段）', () => {
  test('抽牌阶段的黑天鹅多一个「纷飞」入口：选接收者、把手牌分完才能确认，发出分发表', async ({
    page,
  }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=black-swan');
    await expect(page.getByTestId('dock-entry-skip-draw')).toBeVisible();
    const entry = page.getByTestId('dock-entry-tour');
    await expect(entry).toBeVisible();
    await expect(entry).not.toHaveAttribute('aria-disabled', 'true');
    await entry.click();

    await expect(page.getByTestId('black-swan-tour-dialog')).toBeVisible();
    const confirm = page.getByTestId('tour-confirm');
    await expect(confirm).toBeDisabled();
    const recipients = page.getByTestId(/^tour-recipient-\d+$/);
    expect(await recipients.count()).toBeGreaterThanOrEqual(2);
    const cards = page.getByTestId(/^tour-card-\d+$/);
    const total = await cards.count();
    expect(total).toBeGreaterThanOrEqual(2);

    // 还没选接收者时点牌没有效果
    await cards.first().click();
    await expect(cards.first()).toHaveAttribute('data-assigned', '');
    // 第一位接收者收前一半，第二位收其余
    const firstId = ((await recipients.nth(0).getAttribute('data-testid')) ?? '').replace(
      'tour-recipient-',
      '',
    );
    const secondId = ((await recipients.nth(1).getAttribute('data-testid')) ?? '').replace(
      'tour-recipient-',
      '',
    );
    await recipients.nth(0).click();
    for (let i = 0; i < total - 1; i++) await cards.nth(i).click();
    await expect(confirm).toBeDisabled();
    await recipients.nth(1).click();
    await cards.nth(total - 1).click();
    await expect(confirm).toBeEnabled();
    await expect(page.getByTestId('tour-progress')).toContainText(`${total} / ${total}`);
    await confirm.click();

    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]!.move).toBe('playBlackSwanTour');
    const dist = sent[0]!.args[0] as Record<string, string[]>;
    expect(Object.keys(dist).sort()).toEqual([firstId, secondId].sort());
    expect(dist[firstId]).toHaveLength(total - 1);
    expect(dist[secondId]).toHaveLength(1);
  });

  test('再点一次已分配的牌取消；取消按钮关闭弹层且不发 move', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=black-swan');
    await page.getByTestId('dock-entry-tour').click();
    await page
      .getByTestId(/^tour-recipient-\d+$/)
      .first()
      .click();
    const card = page.getByTestId('tour-card-0');
    await card.click();
    await expect(card).not.toHaveAttribute('data-assigned', '');
    await card.click();
    await expect(card).toHaveAttribute('data-assigned', '');
    await page.getByTestId('tour-cancel').click();
    await expect(page.getByTestId('black-swan-tour-dialog')).toHaveCount(0);
    expect(sent).toEqual([]);
  });

  test('其他角色的抽牌阶段没有「纷飞」', async ({ page }) => {
    await openScene(page, '/game/debug?skill=draw');
    await expect(page.getByTestId('dock-entry-tour')).toHaveCount(0);
  });
});

test.describe('背面技能与分步表单技能', () => {
  test('露娜·满月：只能选非 SHOOT 牌，凑够 2 张才能下一步；复活对象可以不选', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=luna');
    await openSkillPanel(page);
    await skillButton(page, 'playLunaFullMoon').click();

    await expect(page.getByTestId('active-skill-step-form')).toHaveAttribute(
      'data-step',
      'handCards',
    );
    // 手里有 SHOOT、解封、梦境穿梭剂、KICK：SHOOT 不可选
    await expect(page.getByTestId(/^active-skill-step-card-\d+$/)).toHaveCount(3);
    const next = page.getByTestId('active-skill-step-next');
    await expect(next).toBeDisabled();
    const cards = page.getByTestId(/^active-skill-step-card-\d+$/);
    await cards.nth(0).click();
    await expect(next).toBeDisabled();
    await cards.nth(1).click();
    await expect(next).toBeEnabled();
    // 第 3 张点不动（刚好 2 张）
    await cards.nth(2).click();
    await expect(cards.nth(2)).toHaveAttribute('aria-pressed', 'false');
    await next.click();

    // 复活对象：迷失层的那位同伴；先选，再确认
    const targets = page.getByTestId(/^active-skill-step-player-\d+$/);
    await expect(targets).toHaveCount(1);
    const id = ((await targets.first().getAttribute('data-testid')) ?? '').replace(
      'active-skill-step-player-',
      '',
    );
    await targets.first().click();
    await page.getByTestId('active-skill-step-next').click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]!.move).toBe('playLunaFullMoon');
    const [discards, revives] = sent[0]!.args as [string[], string[]];
    expect(discards).toHaveLength(2);
    expect(discards).not.toContain('action_shoot');
    expect(revives).toEqual([id]);
  });

  test('露娜·满月：一个都不复活也能确认，参数里复活列表为空', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=luna');
    await openSkillPanel(page);
    await skillButton(page, 'playLunaFullMoon').click();
    const cards = page.getByTestId(/^active-skill-step-card-\d+$/);
    await cards.nth(0).click();
    await cards.nth(1).click();
    await page.getByTestId('active-skill-step-next').click();
    await page.getByTestId('active-skill-step-next').click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]!.args[1]).toEqual([]);
  });

  test('双鱼·洗礼：可以不复活；也可以点名迷失层的同伴', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=pisces');
    await openSkillPanel(page);
    await skillButton(page, 'playPiscesBlessing').click();
    await page.getByTestId('active-skill-step-next').click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]).toEqual({ move: 'playPiscesBlessing', args: [null] });

    await openSkillPanel(page).catch(() => undefined);
    await skillButton(page, 'playPiscesBlessing').click();
    const target = page.getByTestId(/^active-skill-step-player-\d+$/).first();
    const id = ((await target.getAttribute('data-testid')) ?? '').replace(
      'active-skill-step-player-',
      '',
    );
    await target.click();
    await page.getByTestId('active-skill-step-next').click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(2);
    expect(sent[1]).toEqual({ move: 'playPiscesBlessing', args: [id] });
  });

  test('格林射线·缉捕：先选 SHOOT 牌、再选层、再选该层的目标，参数顺序是 (牌, 目标, 层)', async ({
    page,
  }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=green-ray');
    await openSkillPanel(page);
    await skillButton(page, 'playGreenRayArrest').click();

    // 手牌里只有基础 SHOOT 一张 SHOOT 类牌
    const cards = page.getByTestId(/^active-skill-step-card-\d+$/);
    await expect(cards).toHaveCount(1);
    await cards.first().click();
    await page.getByTestId('active-skill-step-next').click();

    const layers = page.getByTestId(/^active-skill-step-layer-\d$/);
    expect(await layers.count()).toBeGreaterThanOrEqual(2);
    await page.getByTestId('active-skill-step-layer-1').click();
    const targets = page.getByTestId(/^active-skill-step-player-\d+$/);
    expect(await targets.count()).toBeGreaterThanOrEqual(1);
    const id = ((await targets.first().getAttribute('data-testid')) ?? '').replace(
      'active-skill-step-player-',
      '',
    );
    await targets.first().click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]).toEqual({ move: 'playGreenRayArrest', args: ['action_shoot', id, 1] });
  });

  test('水瓶·凝聚：弃牌堆里本回合用过的牌不列；选一张发出 playAquariusCoherence', async ({
    page,
  }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=aquarius');
    await openSkillPanel(page);
    const button = skillButton(page, 'playAquariusCoherence');
    await expect(button).not.toHaveAttribute('aria-disabled', 'true');
    await button.click();
    const options = page.getByTestId(/^active-skill-step-discard-/);
    expect(await options.count()).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId('active-skill-step-discard-action_kick')).toHaveCount(0);
    const first = options.first();
    const card = ((await first.getAttribute('data-testid')) ?? '').replace(
      'active-skill-step-discard-',
      '',
    );
    await first.click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]).toEqual({ move: 'playAquariusCoherence', args: [card] });
  });

  test('射手·穿心：先选增减、再选层；没有击杀过玩家时置灰并说明', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=sagittarius');
    await openSkillPanel(page);
    const locked = skillButton(page, 'useSagittariusHeartLock');
    await expect(locked).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('active-skill-reason-useSagittariusHeartLock')).toContainText(
      '本回合还没有击杀过玩家',
    );

    await openScene(page, '/game/debug?skill=heart-lock');
    await openSkillPanel(page);
    await skillButton(page, 'useSagittariusHeartLock').click();
    // 开局每层心锁都是原有数量：增加没有可选的层
    await page.getByTestId('active-skill-step-choice-increase').click();
    await expect(page.getByTestId('active-skill-step-empty')).toBeVisible();
    await page.getByTestId('active-skill-step-back').click();
    await page.getByTestId('active-skill-step-choice-decrease').click();
    await page.getByTestId('active-skill-step-layer-2').click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]).toEqual({ move: 'useSagittariusHeartLock', args: [2, -1] });
  });

  test('金星·镜界复制：先选目标、再选 2 张牌弃掉', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=venus-mirror');
    await openSkillPanel(page);
    await skillButton(page, 'useVenusMirrorWorld').click();
    const targets = page.getByTestId(/^active-skill-step-player-\d+$/);
    expect(await targets.count()).toBeGreaterThanOrEqual(2);
    const first = targets.first();
    const id = ((await first.getAttribute('data-testid')) ?? '').replace(
      'active-skill-step-player-',
      '',
    );
    await first.click();
    const cards = page.getByTestId(/^active-skill-step-card-\d+$/);
    await cards.nth(0).click();
    const next = page.getByTestId('active-skill-step-next');
    await expect(next).toBeDisabled();
    await cards.nth(1).click();
    await next.click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]!.move).toBe('useVenusMirrorWorld');
    expect(sent[0]!.args[0]).toBe(id);
    expect(sent[0]!.args[1]).toHaveLength(2);
  });

  test('取消：回到技能列表，不发 move', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?skill=luna');
    await openSkillPanel(page);
    await skillButton(page, 'playLunaFullMoon').click();
    await page.getByTestId('active-skill-step-cancel').click();
    await expect(page.getByTestId('active-skill-buttons')).toBeVisible();
    expect(sent).toEqual([]);
  });
});

test.describe('金库三选一 · 发动梦魇的附加参数', () => {
  test('回音萦绕：展开后选层与方式，选完才能确认，发出 masterVaultDecision', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?as=master&vault=echo');
    await expect(page.getByTestId('master-nightmare-decision-dialog')).toBeVisible();
    await page.getByTestId('vault-decision-nightmare-activate').click();
    const confirm = page.getByTestId('vault-decision-params-confirm');
    await expect(page.getByTestId('vault-decision-echo')).toBeVisible();
    await expect(confirm).toBeDisabled();
    await page.getByTestId('vault-decision-echo-layer-4').click();
    await expect(confirm).toBeDisabled();
    await page.getByTestId('vault-decision-echo-add').click();
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]).toEqual({
      move: 'masterVaultDecision',
      args: ['nightmare', { targetLayer: 4, action: 'add' }],
    });
  });

  test('邪念瘟疫：展开后点名派发贿赂牌的盗梦者（可以不点名），发出 bribedTargets', async ({
    page,
  }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?as=master&vault=plague');
    await expect(page.getByTestId('master-nightmare-decision-dialog')).toBeVisible();
    await page.getByTestId('vault-decision-nightmare-activate').click();
    await expect(page.getByTestId('vault-decision-plague')).toBeVisible();
    const confirm = page.getByTestId('vault-decision-params-confirm');
    await expect(confirm).toBeEnabled();
    const candidates = page.getByTestId(/^vault-decision-plague-\d+$/);
    expect(await candidates.count()).toBeGreaterThanOrEqual(2);
    const first = candidates.first();
    const id = ((await first.getAttribute('data-testid')) ?? '').replace(
      'vault-decision-plague-',
      '',
    );
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await confirm.click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]).toEqual({
      move: 'masterVaultDecision',
      args: ['nightmare', { bribedTargets: [id] }],
    });
  });
});
