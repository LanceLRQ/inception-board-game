// E2E 测试 Fixtures 和基础工具
/* eslint-disable react-hooks/rules-of-hooks */

import { test as base, expect, type Locator, type Page } from '@playwright/test';

// 扩展 fixture：每个 test 自动注入版权 ack + 错误监听
export const test = base.extend({
  page: async ({ page }, use) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => {
      consoleErrors.push(`[pageerror] ${err.message}`);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // 忽略 favicon / HMR 噪音
        if (text.includes('favicon.ico')) return;
        if (text.includes('vite') && text.includes('reload')) return;
        consoleErrors.push(`[console.error] ${text}`);
      }
    });

    // 注入 localStorage 预设：跳过版权弹窗与首次昵称引导
    await page.addInitScript(() => {
      try {
        localStorage.setItem('icgame-copyright-ack', '1');
        // 固定场景的操作通过结构化日志断言，生产构建默认不输出 INFO。
        if (location.pathname === '/game/debug') localStorage.setItem('icgame-log-level', 'info');
      } catch {
        /* ignore */
      }
    });

    await use(page);

    // 测试结束附加 console errors 到 test info（非 assertion，便于排查）
    if (consoleErrors.length > 0) {
      console.warn('[E2E] Captured console errors during test:\n' + consoleErrors.join('\n'));
    }
  },
});

export { expect };

// 移动端 UA 检测
export function isMobileProject(projectName: string): boolean {
  return projectName.startsWith('mobile-') || projectName.startsWith('tablet-');
}

/**
 * 人机对战页的固定种子地址：同样的种子与人数每次开出同一局，用例不再被随机到的角色与布局影响。
 * 这个种子下真人是一名没有开局弹窗、前几回合不会被点名应答的盗梦者；
 * 4 人局与 5 人局都已验证。想覆盖别的角色，换一个种子并跑一遍相关用例。
 * `botpace=fast` 让 Bot 不等节奏（正常对局 Bot 每步隔 0.8 秒），用例不必为 Bot 的回合久等。
 */
export const LOCAL_MATCH_URL = '/local?seed=e2e-local-1&botpace=fast';

/** 保留手动抽牌按钮，供明确要验证抽牌这一步的用例使用。 */
export async function disableAutoDraw(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'ico:draw:prefs',
      JSON.stringify({ state: { autoDraw: false }, version: 0 }),
    );
  });
}

export function getDiscardPrompt(page: Page): Locator {
  return page
    .locator('.tabletop-hand-actions')
    .getByRole('status')
    .filter({ hasText: /张弃牌/ });
}

// 等待页面就绪
// - 不依赖 networkidle（Web Worker / WS 长连接会让它永不触发）
// - 仅等待 DOM 完成 + React 懒加载根节点挂载
export async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page
    .waitForFunction(() => !!document.querySelector('#root')?.firstChild, null, {
      timeout: 8_000,
    })
    .catch(() => {});
}

/**
 * 等对局界面的素材预加载（进对局前那一段）取完：取得慢时会有一层加载界面盖在对局上，
 * 用鼠标 / 触摸做底层手势（按下、拖动）的用例要先等它退场，否则手势会落在加载界面上。
 * 用元素定位器的点击与断言自带可点击性等待，不需要这个。
 */
export async function waitForAssetsReady(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="local-runtime"][data-assets-ready="true"]')).toBeVisible(
    {
      timeout: 15_000,
    },
  );
}

/**
 * 收集 test 执行期间页面层的 console errors（可选显式使用）
 */
export function createConsoleErrorRecorder(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (text.includes('favicon.ico')) return;
      errors.push(text);
    }
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return { errors };
}

/** 对局界面按视口宽度分两套布局，断点 1024px：宽屏桌面布局，窄屏移动布局 */
export function isNarrowViewport(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 1024;
}

export function chatToggle(page: Page): Locator {
  return isNarrowViewport(page)
    ? page.getByTestId('hand-dock').getByRole('button', { name: '聊天', exact: true })
    : page.getByTestId('chat-toggle');
}

/**
 * 点第 index 张手牌并打出（不区分布局）：两种布局都是两步出牌，
 * 点牌选中后，再点「打出」按钮才进入出牌流程。
 * 需要目标的牌之后会弹出选目标弹窗，调用方自行断言。
 */
export async function selectAndPlayCard(page: Page, index: number): Promise<void> {
  await page.getByTestId(`card-${index}`).click();
  await page.getByTestId('hand-commit-play').click();
}

/**
 * 在弃牌阶段选够 required 张牌（按手牌位置选，同名牌各算一张，不必再挑不重名的）。
 * 返回实际点选的张数。
 */
export async function pickCardsToDiscard(page: Page, required: number): Promise<number> {
  const cards = page.getByTestId('human-hand').locator('[data-testid^="card-"]');
  const count = await cards.count();
  let picked = 0;
  for (let i = 0; i < count && picked < required; i++) {
    await cards.nth(i).click({ timeout: 1_500 });
    picked += 1;
  }
  return picked;
}

/**
 * 本地对局里轮到真人应答时（被 SHOOT、天秤、处女、意念判官、白羊，以及 Bot 打出【解封】后的响应窗口），对局会等真人操作而不是代答。
 * 随机对局的用例不关心这些选择，用这个函数给出最简单的答复：能放弃就放弃，没有放弃选项的选第一个合法操作。
 * 返回这一轮是否答复过。
 */
export async function answerAwaitedResponse(page: Page): Promise<boolean> {
  // 掷骰闸门点名了真人（被 Bot 的 SHOOT 打中等）：掷骰
  const roll = page.getByTestId('dice-roll-button');
  if ((await roll.isVisible()) && (await roll.isEnabled())) {
    await roll.click({ timeout: 1_500 });
    return true;
  }
  // Bot 打出【解封】后，真人在响应窗口里：放弃响应
  const unlockPass = page.getByTestId('unlock-response-pass');
  if (await unlockPass.isVisible()) {
    await unlockPass.click({ timeout: 1_500 });
    return true;
  }
  const panel = page.getByTestId('awaited-window');
  if (!(await panel.isVisible())) return false;
  const decline = panel.locator('[data-testid^="awaited-action-"][data-decline="true"]').first();
  if (await decline.isVisible()) {
    await decline.click({ timeout: 1_500 });
    return true;
  }
  const split = panel.getByTestId('awaited-action-split');
  const pick = panel.getByTestId('awaited-action-pick');
  const dice = panel.getByTestId('awaited-action-pick-a');
  const discard = panel.getByTestId('awaited-action-discard');
  if (await split.isVisible()) {
    await split.click({ timeout: 1_500 });
    await page.getByTestId('awaited-sheet-confirm').click({ timeout: 1_500 });
  } else if (await pick.isVisible()) {
    await pick.click({ timeout: 1_500 });
    await page.getByTestId('awaited-take-1').click({ timeout: 1_500 });
  } else if (await dice.isVisible()) {
    await dice.click({ timeout: 1_500 });
  } else if (await discard.isVisible()) {
    await discard.click({ timeout: 1_500 });
  } else {
    return false;
  }
  return true;
}

/** 等操作出现且掷骰窗关闭，等待期间随时答复轮到真人的应答。 */
export async function waitVisibleAnswering(
  page: Page,
  target: Locator,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const diceGate = page.getByTestId('dice-gate');
  while (Date.now() < deadline) {
    try {
      if (await answerAwaitedResponse(page)) continue;
    } catch {
      /* 窗口刚好消失，下一轮再看 */
    }
    if ((await target.isVisible()) && !(await diceGate.isVisible())) return;
    await page.waitForTimeout(250);
  }
  await expect(diceGate).toBeHidden({ timeout: 1_000 });
  await target.waitFor({ state: 'visible', timeout: 1_000 });
}
