import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import {
  HTTP_DURATION_BUCKETS,
  MetricsRegistry,
  metricsPortFromEnv,
  startMetricsServer,
} from './metrics.js';

describe('MetricsRegistry', () => {
  it('按 Prometheus 文本格式输出计数器、即时值与耗时分布', () => {
    const m = new MetricsRegistry({ gauges: { ico_matches_active: () => 3 } });
    m.observeHttp('GET', 200, 0.004);
    m.observeHttp('GET', 200, 0.2);
    m.observeHttp('POST', 429, 0.02);
    const text = m.render();

    expect(text).toContain('# TYPE ico_http_requests_total counter');
    expect(text).toContain('ico_http_requests_total{method="GET",status="2xx"} 2');
    expect(text).toContain('ico_http_requests_total{method="POST",status="4xx"} 1');

    expect(text).toContain('# TYPE ico_http_request_duration_seconds histogram');
    expect(text).toContain('ico_http_request_duration_seconds_bucket{le="0.005"} 1');
    expect(text).toContain('ico_http_request_duration_seconds_bucket{le="0.25"} 3');
    expect(text).toContain('ico_http_request_duration_seconds_bucket{le="+Inf"} 3');
    expect(text).toContain('ico_http_request_duration_seconds_count 3');
    expect(text).toMatch(/ico_http_request_duration_seconds_sum 0\.224/);

    expect(text).toContain('# TYPE ico_matches_active gauge');
    expect(text).toContain('ico_matches_active 3');
    expect(text).toMatch(/ico_process_uptime_seconds \d/);
    expect(text).toMatch(/ico_process_resident_memory_bytes \d+/);
    expect(text).toMatch(/ico_process_cpu_seconds_total \d/);
    expect(text.endsWith('\n')).toBe(true);
  });

  it('分布桶从小到大、累计计数', () => {
    expect([...HTTP_DURATION_BUCKETS].sort((a, b) => a - b)).toEqual(HTTP_DURATION_BUCKETS);
    const m = new MetricsRegistry();
    m.observeHttp('GET', 500, 100);
    const text = m.render();
    for (const b of HTTP_DURATION_BUCKETS) {
      expect(text).toContain(`ico_http_request_duration_seconds_bucket{le="${b}"} 0`);
    }
    expect(text).toContain('ico_http_requests_total{method="GET",status="5xx"} 1');
  });

  it('方法名不在常见集合里一律记作 OTHER，防止标签被随意撑大', () => {
    const m = new MetricsRegistry();
    m.observeHttp('PROPFIND', 405, 0.001);
    expect(m.render()).toContain('ico_http_requests_total{method="OTHER",status="4xx"} 1');
  });

  it('即时值读取抛错时跳过该项，不影响其余输出', () => {
    const m = new MetricsRegistry({
      gauges: {
        ico_broken: () => {
          throw new Error('x');
        },
      },
    });
    const text = m.render();
    expect(text).not.toContain('ico_broken ');
    expect(text).toContain('ico_process_uptime_seconds');
  });
});

describe('startMetricsServer', () => {
  let server: Server | null = null;
  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = null;
  });

  it('只回应 GET /metrics，其余路径 404', async () => {
    const m = new MetricsRegistry();
    server = await startMetricsServer(m, 0, '127.0.0.1');
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain; version=0.0.4');
    expect(await res.text()).toContain('ico_process_uptime_seconds');
    expect((await fetch(`http://127.0.0.1:${port}/other`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${port}/metrics`, { method: 'POST' })).status).toBe(404);
  });
});

describe('metricsPortFromEnv', () => {
  it('1–65535 的整数才开启，其余都不开', () => {
    expect(metricsPortFromEnv('9464')).toBe(9464);
    expect(metricsPortFromEnv(undefined)).toBeNull();
    expect(metricsPortFromEnv('')).toBeNull();
    expect(metricsPortFromEnv('0')).toBeNull();
    expect(metricsPortFromEnv('70000')).toBeNull();
    expect(metricsPortFromEnv('abc')).toBeNull();
  });
});
