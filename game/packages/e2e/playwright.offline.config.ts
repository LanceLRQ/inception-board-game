// 离线模式 E2E 专用配置
// 必须使用 prod 构建 + vite preview 才能启用 Service Worker
// dev 模式下 VitePWA 的 devOptions.enabled=false → 无 SW，无法测离线

import { defineConfig, devices } from '@playwright/test';

const PREVIEW_URL = process.env.E2E_OFFLINE_BASE_URL ?? 'http://localhost:4173';

export default defineConfig({
  testDir: './tests-offline',
  fullyParallel: false, // 离线测试共享同一 preview，串行更稳
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: PREVIEW_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // 关键：测试 SW 需要 navigator.serviceWorker，只能跑 chromium/webkit
  },
  projects: [
    {
      name: 'prod-chrome',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // 先清理残留端口，再构建，再起 preview
    command:
      'cd ../.. && pnpm kill:dev >/dev/null 2>&1; pnpm --filter @icgame/client build && pnpm --filter @icgame/client exec vite preview --port 4173 --host',
    url: PREVIEW_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
