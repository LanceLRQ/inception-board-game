// 测试用的虚拟计时器：按虚拟时间推进，不依赖真实时钟

export class FakeTimers {
  t = 1_000;
  private seq = 0;
  private readonly items = new Map<number, { at: number; cb: () => void }>();
  now = (): number => this.t;
  setTimeout = (cb: () => void, ms: number): unknown => {
    const id = ++this.seq;
    this.items.set(id, { at: this.t + ms, cb });
    return id;
  };
  clearTimeout = (h: unknown): void => {
    this.items.delete(h as number);
  };
  pending(): { at: number }[] {
    return [...this.items.values()].map((i) => ({ at: i.at }));
  }
  /** 触发最早的计时器；没有返回 false */
  fireNext(): boolean {
    let best: [number, { at: number; cb: () => void }] | null = null;
    for (const entry of this.items) {
      if (best === null || entry[1].at < best[1].at) best = entry;
    }
    if (best === null) return false;
    this.items.delete(best[0]);
    this.t = Math.max(this.t, best[1].at);
    best[1].cb();
    return true;
  }
}
