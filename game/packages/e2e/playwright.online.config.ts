// 联机对局端到端配置：全内存服务端 + 客户端开发服务，两个浏览器上下文真实打一局
//
// 使用本机已安装的 Chrome；服务端与客户端用专用端口，避免和正在运行的开发服务冲突。
// 无人操作的座位由服务端按短时长代发，让整局在几分钟内打完。
// 对局种子固定（只经服务端进程的环境变量注入，客户端拿不到也指定不了），
// 每次都走同一局，不会偶然抽到打满很多回合的长局而撞上超时。

import { defineConfig, devices } from '@playwright/test';

const SERVER_PORT = 3101;
const CLIENT_PORT = 3100;
const CLIENT_URL = `http://localhost:${CLIENT_PORT}`;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

export default defineConfig({
  testDir: './tests-online',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: 5 * 60_000,
  use: {
    baseURL: CLIENT_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'online-chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: [
    {
      command: 'pnpm --filter @icgame/server exec tsx src/testing/devServer.ts',
      url: `${SERVER_URL}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: String(SERVER_PORT),
        WS_CORS_ORIGIN: CLIENT_URL,
        MATCH_BOT_STEP_DELAY_MS: '50',
        MATCH_PENDING_TIMEOUT_MS: '1500',
        MATCH_TURN_TIMEOUT_MS: '2500',
        MATCH_RESPONSE_TIMEOUT_CAP_MS: '1500',
        // 挑过的种子：4 人局（2 真人 + 2 Bot）二十多回合分出胜负
        MATCH_FIXED_SEED: 'e2e-online-35',
      },
    },
    {
      command: `pnpm --filter @icgame/client exec vite --port ${CLIENT_PORT} --strictPort`,
      url: CLIENT_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_API_URL: SERVER_URL },
    },
  ],
});
