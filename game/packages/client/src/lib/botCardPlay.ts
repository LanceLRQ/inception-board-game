// 本地人机对局的 Bot 出牌开关与节奏：地址参数 `?botplay=off`、`?botpace=fast`
//
// 只给端到端测试与开发走查用：关闭后 Bot 在出牌阶段只结束出牌，不打行动牌，
// 让依赖「对手不出手」的用例保持确定。本地人机局完全在本机浏览器里跑，没有服务端和真人对手，
// 开关不涉及信息优势，所以生产构建里也保留。

/** Bot 每一步与上一步落地之间的间隔（毫秒），让玩家看得清 Bot 在做什么 */
export const BOT_STEP_MS = 800;

/**
 * 从地址查询串里读 Bot 的节奏：`botpace=fast` 不等（端到端用，Bot 一口气走完自己的回合），
 * 其余一律按 BOT_STEP_MS。
 */
export function readBotStepMs(search: URLSearchParams | string): number {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  return params.get('botpace') === 'fast' ? 0 : BOT_STEP_MS;
}

/** 从地址查询串里判断 Bot 是否打行动牌：只有明确写了 `botplay=off` 才关闭，其余一律打开 */
export function readBotCardPlay(search: URLSearchParams | string): boolean {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  return params.get('botplay') !== 'off';
}
