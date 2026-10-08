// 轮到本人应答的待决状态：固定场景里操作界面出现、选项正确、点击后发出预期的 move。
//
// 固定场景里发出的 move 只记日志、不推进状态（日志频道 game/fixture），所以这里读控制台日志断言发出了什么。
// 宽屏用舞台右上角的应答窗口（awaited-window），窄屏用手牌坞上方的响应条（awaited-bar），
// 两套布局的按钮测试 ID 相同（awaited-action-*）；要选牌 / 分牌 / 选层的打开同一个应答弹窗（awaited-sheet）。
// 另含棋局·易位弹窗的关闭与重新打开。

import type { Page } from '@playwright/test';
import { test, expect, isNarrowViewport, waitForAppReady } from './fixtures/index.js';

interface SentMove {
  move: string;
  args: unknown[];
}

/** 收集固定场景记下的 move 日志 */
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

async function openScene(page: Page, url: string): Promise<SentMove[]> {
  const sent = recordMoves(page);
  await page.goto(url);
  await waitForAppReady(page);
  await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
  return sent;
}

const panelOf = (page: Page) =>
  page.getByTestId(isNarrowViewport(page) ? 'awaited-bar' : 'awaited-window');
const action = (page: Page, id: string) => page.getByTestId(`awaited-action-${id}`);

/** 等日志里出现一条 move（日志经异步序列化，轮询等待） */
async function lastMove(sent: SentMove[], count: number): Promise<SentMove> {
  await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(count);
  return sent[count - 1]!;
}

test.describe('固定场景 · 应答窗口', () => {
  test('缺省场景没有应答窗口', async ({ page }) => {
    await openScene(page, '/game/debug');
    await expect(page.getByTestId('awaited-window')).toHaveCount(0);
    await expect(page.getByTestId('awaited-bar')).toHaveCount(0);
  });

  test('被 SHOOT 的双鱼：可游离也可放弃，各发对应的 move', async ({ page }) => {
    const sent = await openScene(page, '/game/debug?pending=shoot');
    await expect(panelOf(page)).toBeVisible({ timeout: 10_000 });
    await expect(panelOf(page)).toHaveAttribute('data-kind', 'shoot-evade');
    await expect(action(page, 'evade')).toBeEnabled();
    await expect(action(page, 'evade')).toContainText('1');
    await expect(action(page, 'pass')).toBeEnabled();

    await action(page, 'evade').click();
    expect(await lastMove(sent, 1)).toEqual({ move: 'respondShootEvade', args: [] });
    await action(page, 'pass').click();
    expect(await lastMove(sent, 2)).toEqual({ move: 'respondShootPass', args: [] });
  });

  test('恐怖分子狂热：接受惩罚直接发；弃牌要先在弹窗里选一张', async ({ page }) => {
    const sent = await openScene(page, '/game/debug?pending=terrorist');
    await expect(panelOf(page)).toHaveAttribute('data-kind', 'shoot-zealot', { timeout: 10_000 });

    await action(page, 'accept').click();
    expect(await lastMove(sent, 1)).toEqual({ move: 'respondTerroristAccept', args: [] });

    await action(page, 'discard').click();
    const sheet = page.getByTestId('awaited-sheet');
    await expect(sheet).toBeVisible();
    // 没选牌不能确认
    await expect(page.getByTestId('awaited-sheet-confirm')).toBeDisabled();
    await page.getByTestId('awaited-card-1').click();
    await expect(page.getByTestId('awaited-sheet-confirm')).toBeEnabled();
    await page.getByTestId('awaited-sheet-confirm').click();
    const move = await lastMove(sent, 2);
    expect(move.move).toBe('respondTerroristDiscard');
    expect(move.args).toHaveLength(1);
    expect(typeof move.args[0]).toBe('string');
    await expect(sheet).toHaveCount(0);
  });

  test('天秤分牌：把牌切到第 2 份后确认，发两堆牌；返回不发任何 move', async ({ page }) => {
    const sent = await openScene(page, '/game/debug?pending=libra-split');
    await expect(panelOf(page)).toHaveAttribute('data-kind', 'libra-split', { timeout: 10_000 });

    await action(page, 'split').click();
    await expect(page.getByTestId('awaited-sheet')).toBeVisible();
    const total = await page.getByTestId('awaited-sheet-hand').locator('button').count();
    expect(total).toBeGreaterThan(0);

    await page.getByTestId('awaited-sheet-back').click();
    await expect(page.getByTestId('awaited-sheet')).toHaveCount(0);
    expect(sent).toHaveLength(0);

    await action(page, 'split').click();
    await page.getByTestId('awaited-card-0').click();
    await expect(page.getByTestId('awaited-pile-2')).not.toContainText('空');
    await page.getByTestId('awaited-sheet-confirm').click();
    const move = await lastMove(sent, 1);
    expect(move.move).toBe('resolveLibraSplit');
    const [pile1, pile2] = move.args as [string[], string[]];
    expect(pile2).toHaveLength(1);
    expect(pile1).toHaveLength(total - 1);
  });

  test('天秤挑一份：看得到两份内容，点哪份发哪份', async ({ page }) => {
    const sent = await openScene(page, '/game/debug?pending=libra-pick');
    await expect(panelOf(page)).toHaveAttribute('data-kind', 'libra-pick', { timeout: 10_000 });

    await action(page, 'pick').click();
    await expect(page.getByTestId('awaited-pile-1')).toBeVisible();
    await expect(page.getByTestId('awaited-pile-2')).toBeVisible();
    await page.getByTestId('awaited-take-2').click();
    expect(await lastMove(sent, 1)).toEqual({ move: 'resolveLibraPick', args: ['pile2'] });
  });

  test('意念判官：两个骰值各标出结果，点哪个发哪个', async ({ page }) => {
    const sent = await openScene(page, '/game/debug?pending=sudger');
    await expect(panelOf(page)).toHaveAttribute('data-kind', 'sudger', { timeout: 10_000 });
    await expect(action(page, 'pick-a')).toContainText('1');
    await expect(action(page, 'pick-a')).toContainText('击杀');
    await expect(action(page, 'pick-b')).toContainText('4');
    await expect(action(page, 'pick-b')).toContainText('移动');

    await action(page, 'pick-b').click();
    expect(await lastMove(sent, 1)).toEqual({ move: 'resolveSudgerPick', args: ['B'] });
    await action(page, 'pick-a').click();
    expect(await lastMove(sent, 2)).toEqual({ move: 'resolveSudgerPick', args: ['A'] });
  });

  test('处女·完美：抽 2 张 / 不发动直接发；复活与传送要在弹窗里选完才能确认', async ({ page }) => {
    const sent = await openScene(page, '/game/debug?pending=virgo');
    await expect(panelOf(page)).toHaveAttribute('data-kind', 'virgo', { timeout: 10_000 });

    await action(page, 'draw-two').click();
    expect(await lastMove(sent, 1)).toEqual({
      move: 'respondVirgoPerfect',
      args: ['draw_two'],
    });
    await action(page, 'skip').click();
    expect(await lastMove(sent, 2)).toEqual({ move: 'respondVirgoPerfect', args: ['skip'] });

    // 复活：列出所有已死亡的玩家，不限阵营（场景里一名盗梦者和梦主都已死亡）
    await expect(action(page, 'revive')).toBeEnabled();
    await action(page, 'revive').click();
    const targets = page.getByTestId('awaited-sheet-targets').locator('button');
    await expect(targets).toHaveCount(2);
    await expect(page.getByTestId('awaited-sheet-confirm')).toBeDisabled();
    await targets.first().click();
    await page.getByTestId('awaited-sheet-confirm').click();
    const revive = await lastMove(sent, 3);
    expect(revive.move).toBe('respondVirgoPerfect');
    expect(revive.args[0]).toBe('revive');
    expect(revive.args[1]).toMatchObject({ targetID: expect.any(String) });

    // 传送：1-4 层任选
    await action(page, 'teleport').click();
    await expect(page.getByTestId('awaited-sheet-layers').locator('button')).toHaveCount(4);
    await page.getByTestId('awaited-layer-4').click();
    await page.getByTestId('awaited-sheet-confirm').click();
    expect(await lastMove(sent, 4)).toEqual({
      move: 'respondVirgoPerfect',
      args: ['teleport', { layer: 4 }],
    });
  });

  test('白羊·星尘：弃掉直接发；回音萦绕发动要选层与方式', async ({ page }) => {
    const sent = await openScene(page, '/game/debug?pending=aries');
    await expect(panelOf(page)).toHaveAttribute('data-kind', 'aries', { timeout: 10_000 });
    await expect(panelOf(page)).toContainText('回音萦绕');

    await action(page, 'discard').click();
    expect(await lastMove(sent, 1)).toEqual({ move: 'playAriesStardustDiscard', args: [] });

    await action(page, 'activate').click();
    await expect(page.getByTestId('awaited-sheet-confirm')).toBeDisabled();
    await page.getByTestId('awaited-layer-3').click();
    await expect(page.getByTestId('awaited-sheet-confirm')).toBeDisabled();
    await page.getByTestId('awaited-echo-add').click();
    await page.getByTestId('awaited-sheet-confirm').click();
    expect(await lastMove(sent, 2)).toEqual({
      move: 'playAriesStardustActivate',
      args: [{ targetLayer: 3, action: 'add' }],
    });
  });

  test('白羊·星尘（邪念瘟疫）：发动要先点名派发贿赂牌的盗梦者，也可以一个都不点名', async ({
    page,
  }) => {
    const sent = await openScene(page, '/game/debug?pending=aries-plague');
    await expect(panelOf(page)).toHaveAttribute('data-kind', 'aries', { timeout: 10_000 });
    await expect(panelOf(page)).toContainText('邪念瘟疫');

    await action(page, 'activate').click();
    const confirm = page.getByTestId('awaited-sheet-confirm');
    await expect(page.getByTestId('awaited-nm-plague')).toBeVisible();
    // 一个都不点名也可以确认
    await expect(confirm).toBeEnabled();
    const candidates = page.getByTestId(/^awaited-nm-plague-\d+$/);
    expect(await candidates.count()).toBeGreaterThanOrEqual(2);
    const first = candidates.first();
    const id = ((await first.getAttribute('data-testid')) ?? '').replace('awaited-nm-plague-', '');
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await confirm.click();
    expect(await lastMove(sent, 1)).toEqual({
      move: 'playAriesStardustActivate',
      args: [{ bribedTargets: [id] }],
    });

    // 固定场景不推进状态：弹窗再打开时草稿还在，取消点名后一个都不点名也能确认
    await action(page, 'activate').click();
    await candidates.first().click();
    await expect(candidates.first()).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('awaited-sheet-confirm').click();
    expect(await lastMove(sent, 2)).toEqual({
      move: 'playAriesStardustActivate',
      args: [{ bribedTargets: [] }],
    });
  });

  test('黑洞·吞噬：必须交一张手牌，没有放弃按钮；选定后才能确认，发 respondBlackHoleLevy', async ({
    page,
  }) => {
    const sent = await openScene(page, '/game/debug?pending=levy');
    await expect(panelOf(page)).toHaveAttribute('data-kind', 'levy', { timeout: 10_000 });
    await expect(panelOf(page)).toContainText('黑洞');
    await expect(action(page, 'give')).toBeEnabled();
    await expect(page.getByTestId(/^awaited-action-/)).toHaveCount(1);

    await action(page, 'give').click();
    await expect(page.getByTestId('awaited-sheet')).toBeVisible();
    await expect(page.getByTestId('awaited-sheet-confirm')).toBeDisabled();
    await page.getByTestId('awaited-card-2').click();
    await expect(page.getByTestId('awaited-sheet-confirm')).toBeEnabled();
    await page.getByTestId('awaited-sheet-confirm').click();
    const move = await lastMove(sent, 1);
    expect(move.move).toBe('respondBlackHoleLevy');
    expect(move.args).toHaveLength(1);
    expect(typeof move.args[0]).toBe('string');
  });

  test('达尔文·淘汰：手牌里含新抽的牌；刚好选 2 张才能确认，选的先后就是放回的顺序', async ({
    page,
  }) => {
    const sent = await openScene(page, '/game/debug?pending=darwin');
    await expect(panelOf(page)).toHaveAttribute('data-kind', 'darwin', { timeout: 10_000 });
    await action(page, 'return').click();
    await expect(page.getByTestId('awaited-sheet')).toBeVisible();
    const confirm = page.getByTestId('awaited-sheet-confirm');
    const total = await page.getByTestId('awaited-sheet-hand').locator('button').count();
    expect(total).toBe(6);
    await expect(confirm).toBeDisabled();

    // 先选刚抽到的最后一张，再选第一张
    await page.getByTestId(`awaited-card-${total - 1}`).click();
    await expect(confirm).toBeDisabled();
    await page.getByTestId('awaited-card-0').click();
    await expect(confirm).toBeEnabled();
    await expect(page.getByTestId(`awaited-order-${total - 1}`)).toHaveText('1');
    await expect(page.getByTestId('awaited-order-0')).toHaveText('2');
    await expect(page.getByTestId('awaited-return-progress')).toContainText('2 / 2');
    // 已经选满 2 张：再点第三张不生效
    await page.getByTestId('awaited-card-1').click();
    await expect(page.getByTestId('awaited-order-1')).toHaveCount(0);
    await confirm.click();
    const forward = await lastMove(sent, 1);
    expect(forward.move).toBe('respondDarwinReturn');
    const [firstPick] = forward.args as [string[]];
    expect(firstPick).toHaveLength(2);

    // 固定场景不推进状态：弹窗再打开时草稿还在。再点已选的牌是取消，不是顶掉
    await action(page, 'return').click();
    await expect(page.getByTestId('awaited-order-0')).toHaveText('2');
    await page.getByTestId('awaited-card-0').click();
    await expect(page.getByTestId('awaited-order-0')).toHaveCount(0);
    await expect(confirm).toBeDisabled();
    await page.getByTestId('awaited-card-3').click();
    await expect(confirm).toBeEnabled();
    await expect(page.getByTestId('awaited-order-3')).toHaveText('2');
  });

  test('雅典娜·急智：可以放弃直接发 null；或在弹窗里从弃牌堆选一张再确认', async ({ page }) => {
    const sent = await openScene(page, '/game/debug?pending=athena');
    await expect(panelOf(page)).toHaveAttribute('data-kind', 'athena', { timeout: 10_000 });
    await expect(panelOf(page)).toContainText('雅典娜');

    await action(page, 'pass').click();
    expect(await lastMove(sent, 1)).toEqual({ move: 'respondAthenaWit', args: [null] });

    await action(page, 'take').click();
    await expect(page.getByTestId('awaited-sheet')).toBeVisible();
    const confirm = page.getByTestId('awaited-sheet-confirm');
    await expect(confirm).toBeDisabled();
    const options = page.getByTestId('awaited-sheet-discard').locator('button');
    expect(await options.count()).toBeGreaterThanOrEqual(3);
    await options.nth(1).click();
    await expect(confirm).toBeEnabled();
    await confirm.click();
    const move = await lastMove(sent, 2);
    expect(move.move).toBe('respondAthenaWit');
    expect(move.args).toHaveLength(1);
    expect(typeof move.args[0]).toBe('string');
  });

  test('应答窗口不挡住别的界面：舞台仍在，页面没有报错', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openScene(page, '/game/debug?pending=virgo');
    await expect(panelOf(page)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('runtime-stage')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('固定场景 · 棋局·易位弹窗', () => {
  test('行动阶段自动弹出；能关闭，关闭后本回合不再自动弹出，能结束行动，也能从技能入口再打开', async ({
    page,
  }) => {
    const sent = await openScene(page, '/game/debug?as=master&chess=1');
    const panel = page.getByTestId('chess-transpose-panel');
    await expect(panel).toBeVisible({ timeout: 10_000 });

    // 关闭：弹窗消失，页面上的「结束行动」可点
    await panel.getByRole('button', { name: '取消' }).click();
    await expect(panel).toHaveCount(0);
    await page.waitForTimeout(600);
    await expect(panel).toHaveCount(0);

    await page.getByTestId('action-end').click();
    expect(await lastMove(sent, 1)).toEqual({ move: 'endActionPhase', args: [] });

    // 主动打开：技能入口里有「棋局·易位」
    await page.getByTestId('dock-skill').click();
    await page.getByTestId('active-skill-useChessTranspose').click();
    await expect(panel).toBeVisible();

    // 选两个金库后确认，发出易位 move
    await page.getByTestId('vault-0').click();
    await page.getByTestId('vault-1').click();
    await page.getByTestId('chess-confirm').click();
    const swap = await lastMove(sent, 2);
    expect(swap.move).toBe('useChessTranspose');
    expect(swap.args).toHaveLength(2);
    await expect(panel).toHaveCount(0);
  });

  test('按 Esc 也能关闭', async ({ page }) => {
    await openScene(page, '/game/debug?as=master&chess=1');
    const panel = page.getByTestId('chess-transpose-panel');
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  });
});
