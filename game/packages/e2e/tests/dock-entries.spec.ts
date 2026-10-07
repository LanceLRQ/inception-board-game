// 底部坞的操作入口 E2E：复活（本人在迷失层）、复活同伴、梦主的免费移动、梦主的梦境窥视选目标。
// 固定场景里发出的 move 只记日志（频道 game/fixture），所以读控制台日志断言发出了什么。
// 桌面与移动两种布局都跑：桌面的入口在底部坞操作区，移动的入口在手牌坞操作区上方的一行（收起态也看得到）。

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

/** 手牌里第 n 张的 data-testid 序号（按牌名找，同名取第一张） */
async function handIndexOf(page: Page, title: string): Promise<number> {
  const card = page
    .getByTestId('human-hand')
    .locator(`[data-testid^="card-"][title="${title}"]`)
    .first();
  return Number(((await card.getAttribute('data-testid')) ?? '').replace('card-', ''));
}

test.describe('复活 · 本人在迷失层', () => {
  test('底部坞出现「复活」，打开后选 2 张牌确认，发出 playRevive(null, 两张牌)', async ({
    page,
  }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?dead=1');

    const entry = page.getByTestId('dock-entry-revive-self');
    await expect(entry).toBeVisible();
    await expect(entry).not.toHaveAttribute('aria-disabled', 'true');
    // 在迷失层只有「复活」一个入口
    await expect(page.getByTestId('dock-entry-revive-other')).toHaveCount(0);
    await expect(page.getByTestId('dock-entry-move')).toHaveCount(0);

    await entry.click();
    const dialog = page.getByTestId('revive-dialog');
    await expect(dialog).toBeVisible();
    const confirm = page.getByTestId('revive-confirm');
    await expect(confirm).toBeDisabled();

    await page.getByTestId('revive-card-0').click();
    await expect(confirm).toBeDisabled();
    await page.getByTestId('revive-card-1').click();
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]!.move).toBe('playRevive');
    const [target, cards] = sent[0]!.args as [unknown, string[]];
    expect(target).toBeNull();
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => typeof c === 'string')).toBe(true);
  });

  test('已在迷失层：手里的牌都打不出（不会点了才被引擎拒绝）', async ({ page }) => {
    await openScene(page, '/game/debug?dead=1');
    const first = page.getByTestId('card-0');
    await first.click();
    await expect(page.getByTestId('hand-commit-play')).toHaveCount(0);
  });

  test('缺省场景（本人存活、没有人在迷失层）没有任何操作入口', async ({ page }) => {
    await openScene(page, '/game/debug');
    await expect(page.getByTestId('dock-entries')).toHaveCount(0);
  });
});

test.describe('复活同伴 · 本人存活', () => {
  test('同伴在迷失层：出现「复活同伴」，选对象与 2 张牌，发出 playRevive(对象, 两张牌)', async ({
    page,
  }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?dead=mate');

    const entry = page.getByTestId('dock-entry-revive-other');
    await expect(entry).toBeVisible();
    await entry.click();
    await expect(page.getByTestId('revive-dialog')).toBeVisible();
    await expect(page.getByTestId('revive-targets')).toBeVisible();

    const confirm = page.getByTestId('revive-confirm');
    // 场景里只有一个可复活的对象，已自动选中；仍要选够牌才能确认
    await page.getByTestId('revive-card-1').click();
    await page.getByTestId('revive-card-2').click();
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]!.move).toBe('playRevive');
    const [target, cards] = sent[0]!.args as [string, string[]];
    expect(typeof target).toBe('string');
    expect(cards).toHaveLength(2);
  });
});

test.describe('梦主 · 免费移动', () => {
  test('梦主视角出现「移动」，只能选相邻层，发出 dreamMasterMove(层)', async ({ page }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?as=master');

    const entry = page.getByTestId('dock-entry-move');
    await expect(entry).toBeVisible();
    await expect(entry).not.toHaveAttribute('aria-disabled', 'true');
    await entry.click();

    await expect(page.getByTestId('target-layer-picker-dialog')).toBeVisible();
    // 固定场景里梦主在第 3 层：第 2、4 层可选，第 1 层与当前层置灰
    await expect(page.getByTestId('target-layer-2')).toBeEnabled();
    await expect(page.getByTestId('target-layer-4')).toBeEnabled();
    await expect(page.getByTestId('target-layer-1')).toBeDisabled();
    await expect(page.getByTestId('target-layer-3')).toBeDisabled();

    await page.getByTestId('target-layer-2').click();
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]).toEqual({ move: 'dreamMasterMove', args: [2] });
  });

  test('盗梦者视角没有「移动」入口', async ({ page }) => {
    await openScene(page, '/game/debug');
    await expect(page.getByTestId('dock-entry-move')).toHaveCount(0);
  });

  test('梦主本人手里的【解封】打不出，信息条 / 身份块给出原因', async ({ page }) => {
    await openScene(page, '/game/debug?as=master');
    const unlock = await handIndexOf(page, '解封');
    await page.getByTestId(`card-${unlock}`).click();
    await expect(page.getByTestId('hand-commit-play')).toHaveCount(0);
  });
});

test.describe('梦主 · 梦境窥视（效果②）', () => {
  test('没有人持有贿赂牌：【梦境窥视】打不出', async ({ page }) => {
    await openScene(page, '/game/debug?as=master');
    const peek = await handIndexOf(page, '梦境窥视');
    await page.getByTestId(`card-${peek}`).click();
    await expect(page.getByTestId('hand-commit-play')).toHaveCount(0);
  });

  test('有盗梦者持有贿赂牌：打出后选目标玩家，只列持有者，发出 playPeekMaster(牌, 目标)', async ({
    page,
  }) => {
    const sent = recordMoves(page);
    await openScene(page, '/game/debug?as=master&bribe=1');
    const peek = await handIndexOf(page, '梦境窥视');
    await selectAndPlayCard(page, peek);

    await expect(page.getByTestId('target-player-picker-dialog')).toBeVisible();
    const options = page.getByTestId(/^target-player-\d+$/);
    await expect(options).toHaveCount(1);
    await options.first().click();

    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(sent[0]!.move).toBe('playPeekMaster');
    expect(sent[0]!.args).toHaveLength(2);
    expect(sent[0]!.args[0]).toBe('action_dream_peek');
    expect(typeof sent[0]!.args[1]).toBe('string');
  });
});
