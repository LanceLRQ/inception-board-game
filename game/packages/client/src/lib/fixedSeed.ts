// 本地人机对局的固定种子入口：地址参数 `?seed=...`
//
// 只给端到端测试与开发走查用：让同一条用例每次开出同一局（角色、金库、牌库、骰子都固定）。
// 本地人机局完全在本机浏览器里跑，没有对手也没有服务端，固定种子不会带来任何信息优势问题，
// 所以生产构建里也保留这个入口。联机对局的种子由服务端决定，客户端无法指定，与这里无关。

/** 种子的合法字符与长度：字母、数字、点、下划线、连字符，1–64 位；其余一律当作没给 */
const SEED_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

/** 从地址查询串里取固定种子；没给或格式不合法时返回 undefined（走随机种子） */
export function readFixedSeed(search: URLSearchParams | string): string | undefined {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const raw = params.get('seed');
  if (raw === null) return undefined;
  return SEED_PATTERN.test(raw) ? raw : undefined;
}
