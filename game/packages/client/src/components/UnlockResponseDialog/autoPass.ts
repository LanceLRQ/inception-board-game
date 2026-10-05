// 解封响应窗口的到点自动放弃。联机时由服务端到点代发，客户端不再自己计时

export interface AutoPassOptions {
  /** 窗口是否正在显示 */
  active: boolean;
  /** false 时不启动计时 */
  autoPass: boolean;
  timeoutMs: number;
  makeMove: (move: string, args: unknown[], opts?: { silent?: boolean }) => unknown;
}

/** 启动计时并返回取消函数；无需计时时返回 null */
export function startAutoPass(opts: AutoPassOptions): (() => void) | null {
  if (!opts.active || !opts.autoPass || opts.timeoutMs <= 0) return null;
  const id = setTimeout(() => {
    // 自动发出的 move 被拒不提示
    void opts.makeMove('passResponse', [], { silent: true });
  }, opts.timeoutMs);
  return () => clearTimeout(id);
}
