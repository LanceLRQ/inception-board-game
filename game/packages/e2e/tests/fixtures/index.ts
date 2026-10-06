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
 * 本地对局里轮到真人应答时（被 SHOOT、天秤、处女、意念判官、白羊），对局会等真人操作而不是代答。
 * 随机对局的用例不关心这些选择，用这个函数给出最简单的答复：能放弃就放弃，没有放弃选项的选第一个合法操作。
 * 返回这一轮是否答复过。
 */
export async function answerAwaitedResponse(page: Page): Promise<boolean> {
  const panel = page.locator('[data-testid="awaited-window"], [data-testid="awaited-bar"]').first();
  if (!(await panel.isVisible())) return false;
  const decline = panel.locator('[data-testid^="awaited-action-"][data-decline="true"]').first();
  if (await decline.isVisible()) {
    await decline.click({ timeout: 1_500 });
    return true;
  }
  const kind = await panel.getAttribute('data-kind');
  if (kind === 'libra-split') {
    await panel.getByTestId('awaited-action-split').click({ timeout: 1_500 });
    await page.getByTestId('awaited-sheet-confirm').click({ timeout: 1_500 });
  } else if (kind === 'libra-pick') {
    await panel.getByTestId('awaited-action-pick').click({ timeout: 1_500 });
    await page.getByTestId('awaited-take-1').click({ timeout: 1_500 });
  } else if (kind === 'sudger') {
    await panel.getByTestId('awaited-action-pick-a').click({ timeout: 1_500 });
  } else if (kind === 'aries') {
    await panel.getByTestId('awaited-action-discard').click({ timeout: 1_500 });
  } else {
    return false;
  }
  return true;
}

/** 等某个元素出现，等待期间随时答复轮到真人的应答；超时则抛出 */
export async function waitVisibleAnswering(
  page: Page,
  target: Locator,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await target.isVisible()) return;
    try {
      await answerAwaitedResponse(page);
    } catch {
      /* 窗口刚好消失，下一轮再看 */
    }
    await page.waitForTimeout(250);
  }
  await target.waitFor({ state: 'visible', timeout: 1_000 });
}
