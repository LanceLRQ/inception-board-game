import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Desktop
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'desktop-safari', use: { ...devices['Desktop Safari'] } },

    // Mobile - iOS Safari
    {
      name: 'mobile-ios',
      use: { ...devices['iPhone 14 Pro'] },
    },

    // Mobile - Android Chrome
    {
      name: 'mobile-android',
      use: { ...devices['Pixel 7'] },
    },

    // Mobile - 平板
    {
      name: 'tablet-ipad',
      use: { ...devices['iPad Pro'] },
    },
  ],
  webServer: {
    command: 'pnpm --filter @icgame/client dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
