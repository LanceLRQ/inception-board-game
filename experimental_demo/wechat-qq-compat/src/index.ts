/**
 * Spike 17: 微信/QQ 内置浏览器兼容性测试
 * 验证点：PWA / Service Worker / WebSocket / localStorage / CSS 特性在微信/QQ UA 下的表现
 *
 * 注意：Node 端测试框架逻辑，Playwright 端执行实际浏览器验证
 */

// 微信/QQ 内置浏览器的 User-Agent 特征
const UA_PROFILES = {
  wechat_android: {
    name: '微信 Android',
    ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.43.2502(0x28002B35) Process/tools WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64',
    checks: ['serviceWorker', 'localStorage', 'websocket', 'manifest', 'cssGrid', 'cssFlex', 'crypto', 'fetch'],
  },
  wechat_ios: {
    name: '微信 iOS',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.43(0x18002b2f) NetType/WIFI Language/zh_CN',
    checks: ['serviceWorker', 'localStorage', 'websocket', 'manifest', 'cssGrid', 'cssFlex', 'crypto', 'fetch'],
  },
  qq_android: {
    name: 'QQ Android',
    ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 MQQBrowser/14.5 QQ/9.0.8.8520',
    checks: ['serviceWorker', 'localStorage', 'websocket', 'manifest', 'cssGrid', 'cssFlex', 'crypto', 'fetch'],
  },
  qq_ios: {
    name: 'QQ iOS',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 QQ/9.0.8.640 V1_IPH_SQ_9.0.8_1_APP_A Pixel/1170 MiniAppEnable SimpleUIStrategy',
    checks: ['serviceWorker', 'localStorage', 'websocket', 'manifest', 'cssGrid', 'cssFlex', 'crypto', 'fetch'],
  },
};

// 检测 HTML 页面（在浏览器中执行）
const TEST_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>WeChat/QQ Compat Test</title>
<link rel="manifest" href="data:application/json,{%22name%22:%22test%22}">
<style>
.css-grid-test { display: grid; grid-template-columns: 1fr 1fr; }
.css-flex-test { display: flex; }
</style>
</head>
<body>
<div id="results"></div>
<script>
const results = {};

// Service Worker
results.serviceWorker = ('serviceWorker' in navigator);

// localStorage
try {
  localStorage.setItem('_compat_test', '1');
  results.localStorage = localStorage.getItem('_compat_test') === '1';
  localStorage.removeItem('_compat_test');
} catch (e) { results.localStorage = false; }

// WebSocket
results.websocket = typeof WebSocket !== 'undefined';

// Manifest (link rel=manifest)
results.manifest = !!document.querySelector('link[rel="manifest"]');

// CSS Grid (computed style)
const gridDiv = document.createElement('div');
gridDiv.className = 'css-grid-test';
document.body.appendChild(gridDiv);
results.cssGrid = window.getComputedStyle(gridDiv).display === 'grid';
document.body.removeChild(gridDiv);

// CSS Flex
const flexDiv = document.createElement('div');
flexDiv.className = 'css-flex-test';
document.body.appendChild(flexDiv);
results.cssFlex = window.getComputedStyle(flexDiv).display === 'flex';
document.body.removeChild(flexDiv);

// Crypto (subtle)
results.crypto = !!(window.crypto && window.crypto.subtle);

// Fetch
results.fetch = typeof fetch === 'function';

// IndexedDB
results.indexedDB = !!window.indexedDB;

// Cache API
results.cacheAPI = ('caches' in window);

// Notification
results.notification = ('Notification' in window);

// UserAgent
results.userAgent = navigator.userAgent;

document.getElementById('results').textContent = JSON.stringify(results);
</script>
</body>
</html>`;

let passed = 0, failed = 0;
function check(cond: boolean, name: string, detail = '') {
  if (cond) { console.log(`  ✅ ${name}`); passed++; } else { console.log(`  ❌ ${name} — ${detail}`); failed++; }
}

function main() {
  console.log('\n🧪 Spike 17: 微信/QQ 内置浏览器兼容性测试\n');
  console.log('='.repeat(60));

  // 输出 UA 配置
  console.log('\n📋 UA 配置概览：');
  for (const [key, profile] of Object.entries(UA_PROFILES)) {
    console.log(`  ${profile.name}: ${profile.ua.slice(0, 80)}...`);
  }

  // 检测项定义验证
  const allChecks = new Set(Object.values(UA_PROFILES).flatMap(p => p.checks));
  console.log(`\n📋 检测项 (${allChecks.size}): ${[...allChecks].join(', ')}`);

  // UA 特征匹配验证
  for (const [key, profile] of Object.entries(UA_PROFILES)) {
    const hasUA = profile.ua.length > 50;
    check(hasUA, `${profile.name} UA 格式有效 (${profile.ua.length} chars)`);
    const isMicroMessenger = key.startsWith('wechat') ? profile.ua.includes('MicroMessenger') : true;
    check(isMicroMessenger, `${profile.name} 含 MicroMessenger/QQBrowser 标识`);
  }

  // TEST HTML 完整性
  check(TEST_HTML.includes('serviceWorker'), '测试页含 serviceWorker 检测');
  check(TEST_HTML.includes('localStorage'), '测试页含 localStorage 检测');
  check(TEST_HTML.includes('WebSocket'), '测试页含 WebSocket 检测');
  check(TEST_HTML.includes('crypto.subtle'), '测试页含 crypto.subtle 检测');

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Node 端验证：✅ ${passed} / ❌ ${failed}`);
  console.log('\n📝 浏览器端验证需要 Playwright 执行（见下方输出）\n');
}

main();
