// 基础运行指标：以 Prometheus 文本格式输出，不引入额外依赖
//
// 指标挂在单独的端口上（METRICS_PORT，不设不开），不经 nginx：自带的反代把 /api/ 整段转给后端，
// 挂在主端口上会被公网读到。同一网络里的 Prometheus 直接抓 http://api:<端口>/metrics。
//
// 只记少量、标签取值有限的指标：HTTP 请求按方法与状态码类别计数、耗时分布，进程资源，
// 以及调用方登记的即时值（进行中的对局数、实时连接数）。

import { createServer, type Server } from 'node:http';

/** HTTP 耗时分布的桶上限（秒），从小到大 */
export const HTTP_DURATION_BUCKETS: readonly number[] = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

const KNOWN_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

export interface MetricsOptions {
  /** 即时值：输出时调用一次，抛错的跳过 */
  readonly gauges?: Readonly<Record<string, () => number>>;
}

export class MetricsRegistry {
  private readonly requests = new Map<string, number>();
  private readonly bucketCounts = HTTP_DURATION_BUCKETS.map(() => 0);
  private durationCount = 0;
  private durationSum = 0;

  constructor(private readonly options: MetricsOptions = {}) {}

  /** 记一次 HTTP 请求：状态码按类别（2xx、4xx…）计，方法不在常见集合里的记作 OTHER */
  observeHttp(method: string, status: number, seconds: number): void {
    const m = KNOWN_METHODS.has(method) ? method : 'OTHER';
    const key = `method="${m}",status="${Math.floor(status / 100)}xx"`;
    this.requests.set(key, (this.requests.get(key) ?? 0) + 1);
    HTTP_DURATION_BUCKETS.forEach((le, i) => {
      if (seconds <= le) this.bucketCounts[i]! += 1;
    });
    this.durationCount += 1;
    this.durationSum += seconds;
  }

  render(): string {
    const out: string[] = [];
    const metric = (name: string, type: string, help: string) =>
      out.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);

    metric('ico_http_requests_total', 'counter', 'HTTP requests by method and status class');
    for (const [labels, n] of this.requests) out.push(`ico_http_requests_total{${labels}} ${n}`);

    const h = 'ico_http_request_duration_seconds';
    metric(h, 'histogram', 'HTTP request duration in seconds');
    HTTP_DURATION_BUCKETS.forEach((le, i) =>
      out.push(`${h}_bucket{le="${le}"} ${this.bucketCounts[i]}`),
    );
    out.push(`${h}_bucket{le="+Inf"} ${this.durationCount}`);
    out.push(`${h}_sum ${Math.round(this.durationSum * 1e6) / 1e6}`);
    out.push(`${h}_count ${this.durationCount}`);

    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    metric('ico_process_uptime_seconds', 'gauge', 'Process uptime in seconds');
    out.push(`ico_process_uptime_seconds ${Math.round(process.uptime())}`);
    metric('ico_process_resident_memory_bytes', 'gauge', 'Resident memory in bytes');
    out.push(`ico_process_resident_memory_bytes ${mem.rss}`);
    metric('ico_process_heap_used_bytes', 'gauge', 'V8 heap used in bytes');
    out.push(`ico_process_heap_used_bytes ${mem.heapUsed}`);
    metric('ico_process_cpu_seconds_total', 'counter', 'User and system CPU time in seconds');
    out.push(`ico_process_cpu_seconds_total ${(cpu.user + cpu.system) / 1e6}`);

    for (const [name, read] of Object.entries(this.options.gauges ?? {})) {
      let value: number;
      try {
        value = read();
      } catch {
        continue;
      }
      metric(name, 'gauge', name.replace(/^ico_/, '').replace(/_/g, ' '));
      out.push(`${name} ${value}`);
    }
    return `${out.join('\n')}\n`;
  }
}

/** 在单独的端口上提供 GET /metrics；返回已开始监听的服务 */
export function startMetricsServer(
  registry: MetricsRegistry,
  port: number,
  host = '0.0.0.0',
): Promise<Server> {
  const server = createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/metrics') {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' });
    res.end(registry.render());
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

/** 解析 METRICS_PORT：1–65535 的整数才开启，未设置与其他取值都不开 */
export function metricsPortFromEnv(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return null;
  const port = Number(value);
  return port <= 65535 ? port : null;
}
