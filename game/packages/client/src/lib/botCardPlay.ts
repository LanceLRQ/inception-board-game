// 本地人机对局的 Bot 出牌开关：地址参数 `?botplay=off`
//
// 只给端到端测试与开发走查用：关闭后 Bot 在出牌阶段只结束出牌，不打行动牌，
// 让依赖「对手不出手」的用例保持确定。本地人机局完全在本机浏览器里跑，没有服务端和真人对手，
// 开关不涉及信息优势，所以生产构建里也保留。

/** 从地址查询串里判断 Bot 是否打行动牌：只有明确写了 `botplay=off` 才关闭，其余一律打开 */
export function readBotCardPlay(search: URLSearchParams | string): boolean {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  return params.get('botplay') !== 'off';
}
