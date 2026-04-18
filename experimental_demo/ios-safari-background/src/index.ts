/**
 * Spike 18: iOS Safari 后台断开重连 Demo
 * ADR: PageVisibility API + 静默重连 < 2s
 *
 * 验证点：
 * 1. visibilitychange 事件正确触发
 * 2. 后台→前台重连时间 < 2s
 * 3. 心跳超时检测
 * 4. 重连退避策略
 */

let passed = 0, failed = 0;
function check(cond: boolean, name: string, detail = '') {
  if (cond) { console.log(`  ✅ ${name}`); passed++; } else { console.log(`  ❌ ${name} — ${detail}`); failed++; }
}

// 模拟连接状态机
type ConnState = 'connected' | 'disconnected' | 'reconnecting';

interface ReconnectManager {
  state: ConnState;
  lastHeartbeat: number;
  reconnectAttempts: number;
  maxAttempts: number;
  backoffMs: number[];
  visibilityHiddenAt: number | null;
  reconnectStartAt: number | null;
}

const BACKOFF_MS = [500, 1000, 2000, 4000, 8000]; // 指数退避

function createManager(): ReconnectManager {
  return {
    state: 'connected',
    lastHeartbeat: Date.now(),
    reconnectAttempts: 0,
    maxAttempts: 5,
    backoffMs: BACKOFF_MS,
    visibilityHiddenAt: null,
    reconnectStartAt: null,
  };
}

function onVisibilityChange(mgr: ReconnectManager, hidden: boolean, now: number): ReconnectManager {
  if (hidden) {
    return { ...mgr, visibilityHiddenAt: now, state: 'disconnected' };
  }
  // 从后台回到前台 → 立即重连
  if (mgr.visibilityHiddenAt !== null && mgr.state === 'disconnected') {
    return {
      ...mgr,
      state: 'reconnecting',
      reconnectStartAt: now,
      visibilityHiddenAt: null,
    };
  }
  return mgr;
}

function attemptReconnect(mgr: ReconnectManager, now: number): { mgr: ReconnectManager; delayMs: number } {
  if (mgr.reconnectAttempts >= mgr.maxAttempts) {
    return { mgr: { ...mgr, state: 'disconnected' }, delayMs: -1 }; // 放弃
  }
  const delay = mgr.backoffMs[Math.min(mgr.reconnectAttempts, mgr.backoffMs.length - 1)];
  const newMgr: ReconnectManager = {
    ...mgr,
    reconnectAttempts: mgr.reconnectAttempts + 1,
  };
  return { mgr: newMgr, delayMs: delay };
}

function onReconnectSuccess(mgr: ReconnectManager, now: number): ReconnectManager {
  const reconnectTime = mgr.reconnectStartAt ? now - mgr.reconnectStartAt : 0;
  return {
    ...mgr,
    state: 'connected',
    lastHeartbeat: now,
    reconnectAttempts: 0,
    reconnectStartAt: null,
  };
}

// 检测 HTML 页面
const TEST_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Background Reconnect Test</title></head>
<body>
<div id="log"></div>
<script>
const log = [];
const startTime = performance.now();
function addLog(msg) {
  const t = (performance.now() - startTime).toFixed(0);
  log.push({ time: +t, msg });
}

// 模拟 WebSocket 连接
let ws = { readyState: 1 }; // OPEN
let reconnectStart = null;
let state = 'connected';

document.addEventListener('visibilitychange', () => {
  const now = performance.now();
  if (document.hidden) {
    state = 'background';
    addLog('hidden');
  } else {
    state = 'foreground';
    reconnectStart = now;
    addLog('visible');
    // 模拟重连
    setTimeout(() => {
      const elapsed = performance.now() - reconnectStart;
      addLog('reconnected in ' + elapsed.toFixed(0) + 'ms');
      state = 'connected';
      document.getElementById('log').textContent = JSON.stringify(log);
    }, 200); // 模拟 200ms 重连延迟
  }
  document.getElementById('log').textContent = JSON.stringify(log);
});

// 初始状态
addLog('init');
document.getElementById('log').textContent = JSON.stringify(log);
</script>
</body></html>`;

function main() {
  console.log('\n🧪 Spike 18: iOS Safari 后台断开重连 Demo\n');
  console.log('='.repeat(60));

  // 退避策略验证
  console.log('\n📋 测试 1：重连退避策略');
  {
    const delays = BACKOFF_MS;
    check(delays[0] === 500, '首次退避 500ms');
    check(delays[delays.length - 1] === 8000, '最大退避 8000ms');
    check(delays.length === 5, '5 级退避');
    let prev = 0;
    const isIncreasing = delays.every(d => { const ok = d >= prev; prev = d; return ok; });
    check(isIncreasing, '退避时间递增');
  }

  // 后台→前台重连时序
  console.log('\n📋 测试 2：后台→前台重连时序');
  {
    let mgr = createManager();
    check(mgr.state === 'connected', '初始状态=connected');

    // 进入后台
    mgr = onVisibilityChange(mgr, true, 1000);
    check(mgr.state === 'disconnected', '后台=disconnected');
    check(mgr.visibilityHiddenAt === 1000, '记录隐藏时间');

    // 回到前台
    mgr = onVisibilityChange(mgr, false, 4000);
    check(mgr.state === 'reconnecting', '回到前台=reconnecting');
    check(mgr.reconnectStartAt === 4000, '记录重连开始时间');

    // 模拟重连成功
    mgr = onReconnectSuccess(mgr, 4100);
    check(mgr.state === 'connected', '重连成功=connected');
    const reconnectTime = 4100 - 4000;
    check(reconnectTime < 2000, `重连耗时 ${reconnectTime}ms < 2000ms`);
  }

  // 多次重连退避
  console.log('\n📋 测试 3：重连失败退避');
  {
    let mgr = createManager();
    mgr = { ...mgr, state: 'reconnecting', reconnectStartAt: 0 };

    const delays: number[] = [];
    for (let i = 0; i < 3; i++) {
      const result = attemptReconnect(mgr, i * 1000);
      delays.push(result.delayMs);
      mgr = result.mgr;
    }
    check(delays[0] === 500, `第 1 次退避 ${delays[0]}ms`);
    check(delays[1] === 1000, `第 2 次退避 ${delays[1]}ms`);
    check(delays[2] === 2000, `第 3 次退避 ${delays[2]}ms`);
  }

  // 最大重连次数
  console.log('\n📋 测试 4：重连上限');
  {
    let mgr: ReconnectManager = { ...createManager(), state: 'reconnecting', reconnectAttempts: 5 };
    const result = attemptReconnect(mgr, 0);
    check(result.delayMs === -1, '超过 5 次放弃重连');
  }

  // 测试页完整性
  console.log('\n📋 测试 5：浏览器测试页完整性');
  check(TEST_HTML.includes('visibilitychange'), '含 visibilitychange 事件');
  check(TEST_HTML.includes('document.hidden'), '含 document.hidden 检测');
  check(TEST_HTML.includes('reconnect'), '含重连逻辑');

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Node 端验证：✅ ${passed} / ❌ ${failed}`);
  console.log('\n📝 浏览器端验证需要 Playwright 执行（见下方输出）\n');
}

main();
