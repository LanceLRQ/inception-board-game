// 联机倒计时：截止点用「本机单调时钟」表示，与本机的日历时间无关
//
// 服务端每条消息都带「距截止还剩多少毫秒」，客户端在收到的那一刻记下单调时钟（performance.now），
// 截止点 = 收到时刻 + 剩余毫秒。之后每秒用同一个单调时钟倒数，所以本机时钟被拨快或拨慢都不影响倒计时。
// 取舍：单调时钟不含网络传输的那一小段延迟（通常几十毫秒，显示会多出这么多），
// 但不需要在握手时估算时钟偏移，也不怕偏移估算本身出错；设备休眠后单调时钟可能暂停，
// 恢复连接时服务端会重发一份新的剩余毫秒，随即校正。

/** 本机单调时钟（毫秒）：只会往前走，不受系统时间调整影响 */
export function monotonicNow(): number {
  return performance.now();
}

/**
 * 把服务端消息里的截止信息换算成本机单调时钟上的截止点。
 * 优先用 deadlineInMs（距截止还剩多少毫秒）；旧版服务端不带它，退回用 serverDeadlineAt 减本机日历时间，
 * 这条路径受本机时钟偏差影响，只为兼容旧服务端。没有截止时间返回 null。
 */
export function toLocalDeadline(
  serverDeadlineAt: number | null,
  deadlineInMs: number | null | undefined,
  receivedMonotonic: number,
  wallNow: number,
): number | null {
  if (typeof deadlineInMs === 'number') return receivedMonotonic + Math.max(0, deadlineInMs);
  if (serverDeadlineAt === null) return null;
  return receivedMonotonic + Math.max(0, serverDeadlineAt - wallNow);
}

/** 距截止还剩几秒（向上取整，最小 0）；deadline 与 now 要在同一个时钟上；没有截止时间返回 null */
export function remainingSeconds(deadline: number | null, now: number): number | null {
  if (deadline === null) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
