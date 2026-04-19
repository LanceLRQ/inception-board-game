// Web Vitals 性能基线 E2E（FCP / LCP / CLS / Navigation Timing）
// 对照：plans/tasks.md P1 · MVP 性能基线报告
//
// 只在 prod build + preview 下跑（dev 模式 HMR 注入会干扰测量）
// 采集基线：
//   - FCP (First Contentful Paint) 目标 < 2.0s
//   - LCP (Largest Contentful Paint) 目标 < 2.5s
//   - TTI 近似（domContentLoadedEventEnd） 目标 < 2.0s
//   - CLS 累积布局偏移 目标 < 0.1
// 结果写入 perf-web-vitals.json 供 CI 对比

import { test, expect } from '@playwright/test';
import fs from 'node:fs';

type Vitals = {
  fcp: number | null;
  lcp: number | null;
  cls: number;
  domContentLoadedMs: number;
  loadCompleteMs: number;
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('icgame-copyright-ack', '1');
    } catch {
      /* ignore */
    }
  });
});

test.describe('性能基线 Web Vitals', () => {
  test('首页 FCP / LCP / CLS 在预算内', async ({ page }) => {
    test.setTimeout(15_000);
    await page.goto('/');
    // 等 LCP 事件触发（最多 5s）
    const vitals: Vitals = await page.evaluate(
      () =>
        new Promise<Vitals>((resolve) => {
          const result: Vitals = {
            fcp: null,
            lcp: null,
            cls: 0,
            domContentLoadedMs: 0,
            loadCompleteMs: 0,
          };

          // FCP
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (entry.name === 'first-contentful-paint') {
                result.fcp = entry.startTime;
              }
            }
          }).observe({ type: 'paint', buffered: true });

          // LCP（取最后一个）
          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const last = entries[entries.length - 1];
            if (last) result.lcp = last.startTime;
          }).observe({ type: 'largest-contentful-paint', buffered: true });

          // CLS
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              const e = entry as PerformanceEntry & {
                value?: number;
                hadRecentInput?: boolean;
              };
              if (!e.hadRecentInput && typeof e.value === 'number') {
                result.cls += e.value;
              }
            }
          }).observe({ type: 'layout-shift', buffered: true });

          // Navigation Timing
          setTimeout(() => {
            const nav = performance.getEntriesByType('navigation')[0] as
              | PerformanceNavigationTiming
              | undefined;
            if (nav) {
              result.domContentLoadedMs = nav.domContentLoadedEventEnd - nav.startTime;
              result.loadCompleteMs = nav.loadEventEnd - nav.startTime;
            }
            resolve(result);
          }, 2_500);
        }),
    );

    const fcp = vitals.fcp ?? Infinity;
    const lcp = vitals.lcp ?? Infinity;

    console.log('[perf] vitals =', JSON.stringify(vitals));

    // 写入 JSON 供 CI 对比
    try {
      fs.writeFileSync(
        'perf-web-vitals.json',
        JSON.stringify(
          {
            at: new Date().toISOString(),
            url: '/',
            fcpMs: fcp,
            lcpMs: lcp,
            cls: vitals.cls,
            domContentLoadedMs: vitals.domContentLoadedMs,
            loadCompleteMs: vitals.loadCompleteMs,
          },
          null,
          2,
        ),
      );
    } catch {
      /* ignore IO errors */
    }

    // 断言（MVP 基线；未来可调紧）
    expect(fcp).toBeLessThan(2_000);
    expect(lcp).toBeLessThan(3_500);
    expect(vitals.cls).toBeLessThan(0.25);
    expect(vitals.domContentLoadedMs).toBeLessThan(3_000);
  });

  test('/local 路由首次访问耗时可接受', async ({ page }) => {
    const t0 = Date.now();
    await page.goto('/local');
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - t0;

    console.log(`[perf] /local dom-ready in ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5_000);
  });
});
