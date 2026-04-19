// 好友房纯前端全链路（无后端）
// 验证：不启动任何后端 API 的情况下，客户端 roomApi/identityApi 自动降级到
// LocalStorage mock，仍能走完 Lobby → Room → Game(friend=1) 流程。
//
// 价值：Chrome 能直接跑 `pnpm --filter @icgame/client dev` 即完成 demo。

import { test, expect, waitForAppReady } from './fixtures/index.js';

const API_BASE = 'http://localhost:3001';

test.describe('好友房纯前端（后端离线）', () => {
  test('无后端：Lobby → 创建房间 → 补 AI → 开始 → Game 页', async ({ page }) => {
    // 拦截所有后端请求 → 模拟网络失败（触发降级）
    await page.route(`${API_BASE}/**`, (r) => r.abort());

    await page.goto('/lobby');
    await waitForAppReady(page);

    // 1. 未认证 → 输入昵称
    await expect(page.getByLabel('先给自己起个名字')).toBeVisible({ timeout: 5_000 });
    await page.getByLabel('先给自己起个名字').fill('胡桃');
    await page.getByRole('button', { name: /继续/ }).click();

    // 2. identityApi 降级后仍能拿到身份
    await expect(page.getByTestId('lobby-nickname')).toHaveText('胡桃', { timeout: 5_000 });

    // 3. 创建房间 → 跳 /room/XXXXXX（动态房间码）
    await page.getByTestId('lobby-create').click();
    await page.waitForURL(/\/room\/[A-Z0-9]{6}/, { timeout: 5_000 });

    // 4. Room 页：房主 + 1 人（自己）
    await expect(page.getByTestId('room-count')).toContainText('1 / 6');
    await expect(page.getByTestId('room-start')).toBeDisabled();

    // 5. 补 AI → 满 6 席
    await page.getByTestId('room-fill-ai').click();
    await expect(page.getByTestId('room-count')).toContainText('6 / 6', { timeout: 5_000 });
    await expect(page.getByTestId('room-start')).toBeEnabled();

    // 6. Start → /game/:matchId?friend=1
    await page.getByTestId('room-start').click();
    await page.waitForURL(/\/game\/.*friend=1/, { timeout: 5_000 });

    // 7. 对局 Runtime 可见
    await expect(page.getByTestId('local-runtime')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('turn-indicator')).toBeVisible();
  });
});
