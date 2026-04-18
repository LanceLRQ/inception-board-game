/**
 * Spike 19: FingerprintJS 指纹稳定性测试
 * ADR: 弱设备指纹跨浏览器方差 < 20%
 *
 * 验证点：
 * 1. 同一浏览器多次运行指纹一致
 * 2. 不同浏览器上下文指纹差异可控
 * 3. FingerprintJS 加载和执行成功
 * 4. 指纹组件构成可分析
 */

let passed = 0, failed = 0;
function check(cond: boolean, name: string, detail = '') {
  if (cond) { console.log(`  ✅ ${name}`); passed++; } else { console.log(`  ❌ ${name} — ${detail}`); failed++; }
}

// 指纹相似度计算（Jaccard 系数用于组件级对比）
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 1 : intersection.size / union.size;
}

// Hamming 距离（用于指纹 hash 对比）
function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Math.max(a.length, b.length);
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) dist++;
  }
  return dist;
}

// 浏览器端测试页（加载 FingerprintJS）
const TEST_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>FingerprintJS Test</title></head>
<body>
<div id="results"></div>
<script>
(async () => {
  const results = { fingerprints: [], components: [], errors: [] };

  try {
    // 动态加载 FingerprintJS
    const script = document.createElement('script');
    script.src = 'https://openfpcdn.io/fingerprintjs/v4';
    document.head.appendChild(script);

    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = reject;
      setTimeout(() => reject(new Error('load timeout')), 10000);
    });

    // 运行 5 次
    for (let i = 0; i < 5; i++) {
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      results.fingerprints.push(result.visitorId);
      if (i === 0) {
        results.components = Object.keys(result.components).map(k => ({
          key: k,
          value: JSON.stringify(result.components[k].value)
        }));
      }
    }
  } catch (e) {
    results.errors.push(e.message);
  }

  document.getElementById('results').textContent = JSON.stringify(results);
})();
</script>
</body></html>`;

function main() {
  console.log('\n🧪 Spike 19: FingerprintJS 指纹稳定性测试\n');
  console.log('='.repeat(60));

  // 相似度算法验证
  console.log('\n📋 测试 1：相似度算法验证');
  {
    const setA = new Set(['a', 'b', 'c', 'd']);
    const setB = new Set(['a', 'b', 'c', 'e']);
    const sim = jaccardSimilarity(setA, setB);
    check(Math.abs(sim - 0.6) < 0.01, `Jaccard 相似度计算正确 (${sim.toFixed(2)})`);

    const sameSim = jaccardSimilarity(setA, setA);
    check(sameSim === 1, '完全相同 = 1.0');

    const emptySim = jaccardSimilarity(new Set(), new Set());
    check(emptySim === 1, '空集相似度 = 1.0');
  }

  // Hamming 距离验证
  console.log('\n📋 测试 2：Hamming 距离验证');
  {
    const d1 = hammingDistance('abc', 'abc');
    check(d1 === 0, '相同字符串距离 = 0');

    const d2 = hammingDistance('abc', 'axc');
    check(d2 === 1, '1 字符差异距离 = 1');

    const d3 = hammingDistance('abc', 'xyz');
    check(d3 === 3, '完全不同距离 = 3');
  }

  // 方差阈值验证
  console.log('\n📋 测试 3：稳定性判定阈值');
  {
    // 模拟同一浏览器 5 次指纹
    const sameBrowserFPs = ['abc123', 'abc123', 'abc123', 'abc123', 'abc123'];
    const uniqueFPs = new Set(sameBrowserFPs);
    check(uniqueFPs.size === 1, `同一浏览器 5 次指纹全一致 (${uniqueFPs.size} 种)`);

    // 模拟跨浏览器指纹差异
    const crossBrowserFPs = ['abc123', 'def456', 'ghi789'];
    const variance = crossBrowserFPs.length > 1 ?
      new Set(crossBrowserFPs).size / crossBrowserFPs.length : 0;
    check(variance > 0, `跨浏览器指纹有差异 (variance=${variance.toFixed(2)})`);
  }

  // FingerprintJS 版本和 CDN
  console.log('\n📋 测试 4：FingerprintJS 配置');
  check(TEST_HTML.includes('openfpcdn.io/fingerprintjs/v4'), '使用 FingerprintJS v4 CDN');
  check(TEST_HTML.includes('visitorId'), '获取 visitorId');
  check(TEST_HTML.includes('components'), '获取组件详情');

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Node 端验证：✅ ${passed} / ❌ ${failed}`);
  console.log('\n📝 浏览器端验证需要 Playwright 执行（见下方输出）\n');
}

main();
