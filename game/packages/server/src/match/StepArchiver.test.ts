import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FakeTimers } from '../testing/fakeTimers.js';
import { InMemoryMatchArchive, type StepRow } from './MatchArchive.js';
import { ARCHIVE_RETRY_MAX_MS, StepArchiver } from './StepArchiver.js';

const { log } = vi.hoisted(() => ({
  log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../infra/logger.js', () => ({ logger: log }));

const pump = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function row(stateID: number, matchID = 'm1'): StepRow {
  return {
    matchID,
    stateID,
    request: { playerID: '0', move: 'x', args: [] },
    events: [],
    at: new Date(0),
  };
}

/** 按指令失败的归档替身：记录每次真正写入的顺序 */
class FlakyArchive extends InMemoryMatchArchive {
  /** 接下来的这么多次 appendStep 调用抛错 */
  failAppends = 0;
  failGaps = 0;
  /** 为真时 appendStep 不返回，直到 release 被调用 */
  hold = false;
  written: number[] = [];
  attempts: number[] = [];
  private waiting: Array<() => void> = [];

  release(): void {
    this.hold = false;
    for (const w of this.waiting.splice(0)) w();
  }

  override async appendStep(r: StepRow): Promise<void> {
    this.attempts.push(r.stateID);
    if (this.failAppends > 0) {
      this.failAppends -= 1;
      throw new Error('pg down');
    }
    if (this.hold) await new Promise<void>((resolve) => this.waiting.push(resolve));
    await super.appendStep(r);
    this.written.push(r.stateID);
  }

  override async recordGap(matchID: string, from: number, to: number): Promise<void> {
    if (this.failGaps > 0) {
      this.failGaps -= 1;
      throw new Error('pg down');
    }
    await super.recordGap(matchID, from, to);
  }
}

let timers: FakeTimers;
let archive: FlakyArchive;

beforeEach(() => {
  vi.clearAllMocks();
  timers = new FakeTimers();
  archive = new FlakyArchive();
});

describe('StepArchiver', () => {
  it('正常写入：入队立即返回，后台按版本号顺序落库', async () => {
    const a = new StepArchiver(archive, timers);
    a.enqueue(row(1));
    a.enqueue(row(2));
    a.enqueue(row(3));
    await pump();
    expect(archive.written).toEqual([1, 2, 3]);
    expect(a.pendingOf('m1')).toBe(0);
  });

  it('前一条没写成功不写后一条；退避重试成功后不重复、不缺', async () => {
    const a = new StepArchiver(archive, timers);
    archive.failAppends = 2;
    a.enqueue(row(1));
    a.enqueue(row(2));
    await pump();
    expect(archive.written).toEqual([]);
    expect(archive.attempts).toEqual([1]);

    // 首次重试间隔 1 秒，第二次翻倍
    expect(timers.pending().map((p) => p.at - timers.now())).toEqual([1_000]);
    timers.fireNext();
    await pump();
    expect(archive.attempts).toEqual([1, 1]);
    expect(timers.pending().map((p) => p.at - timers.now())).toEqual([2_000]);
    timers.fireNext();
    await pump();

    expect(archive.attempts).toEqual([1, 1, 1, 2]);
    expect(archive.written).toEqual([1, 2]);
    expect((await archive.listSteps('m1')).map((r) => r.stateID)).toEqual([1, 2]);
  });

  it('重试间隔翻倍并以 30 秒封顶', async () => {
    const a = new StepArchiver(archive, timers);
    archive.failAppends = 10;
    a.enqueue(row(1));
    await pump();
    const delays: number[] = [];
    for (let i = 0; i < 7; i++) {
      delays.push(timers.pending()[0]!.at - timers.now());
      timers.fireNext();
      await pump();
    }
    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, ARCHIVE_RETRY_MAX_MS, 30_000]);
  });

  it('重试期间新入队的步排在后面，仍按序落库', async () => {
    const a = new StepArchiver(archive, timers);
    archive.failAppends = 1;
    a.enqueue(row(1));
    await pump();
    a.enqueue(row(2));
    a.enqueue(row(3));
    await pump();
    expect(archive.written).toEqual([]);
    timers.fireNext();
    await pump();
    expect(archive.written).toEqual([1, 2, 3]);
  });

  it('超过队列上限：丢最旧的并记缺口，缺口落库，其余按序写', async () => {
    const a = new StepArchiver(archive, timers, 3);
    archive.failAppends = 1;
    a.enqueue(row(1));
    await pump();
    // 队首 1 在退避等待，不在写入中，可以被丢弃
    a.enqueue(row(2));
    a.enqueue(row(3));
    a.enqueue(row(4));
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ matchID: 'm1', stateID: 1 }),
      expect.stringContaining('overflow'),
    );
    a.enqueue(row(5));
    timers.fireNext();
    await pump();
    expect(archive.written).toEqual([3, 4, 5]);
    // 相邻的丢弃合并成一段缺口 1..2
    expect(await archive.listGaps('m1')).toEqual([{ from: 1, to: 2 }]);
  });

  it('溢出时正在写入的队首不会被丢', async () => {
    const a = new StepArchiver(archive, timers, 2);
    archive.hold = true;
    a.enqueue(row(1));
    await pump();
    a.enqueue(row(2));
    a.enqueue(row(3));
    archive.release();
    await pump();
    expect(archive.written).toEqual([1, 3]);
    expect(await archive.listGaps('m1')).toEqual([{ from: 2, to: 2 }]);
  });

  it('缺口写入失败也会退避重试', async () => {
    const a = new StepArchiver(archive, timers);
    archive.failGaps = 1;
    a.enqueueGap('m1', 4, 6);
    await pump();
    expect(await archive.listGaps('m1')).toEqual([]);
    timers.fireNext();
    await pump();
    expect(await archive.listGaps('m1')).toEqual([{ from: 4, to: 6 }]);
  });

  it('各局的队列互不阻塞：一局写失败不影响另一局', async () => {
    const a = new StepArchiver(archive, timers);
    archive.failAppends = 1;
    a.enqueue(row(1, 'a'));
    a.enqueue(row(1, 'b'));
    await pump();
    expect((await archive.listSteps('b')).map((r) => r.stateID)).toEqual([1]);
    expect(await archive.listSteps('a')).toEqual([]);
  });

  describe('drain', () => {
    it('队列写完后返回', async () => {
      const a = new StepArchiver(archive, timers);
      archive.hold = true;
      a.enqueue(row(1));
      a.enqueue(row(2));
      let done = false;
      const p = a.drain('m1').then(() => (done = true));
      await pump();
      expect(done).toBe(false);
      archive.release();
      await p;
      expect(archive.written).toEqual([1, 2]);
    });

    it('等待时立即重试，不必等退避到点', async () => {
      const a = new StepArchiver(archive, timers);
      archive.failAppends = 1;
      a.enqueue(row(1));
      await pump();
      await a.drain('m1');
      expect(archive.written).toEqual([1]);
    });

    it('没有队列直接返回；超时也返回并记 ERROR，写入仍留在队列里', async () => {
      const a = new StepArchiver(archive, timers);
      await a.drain('none');

      archive.failAppends = 1_000;
      a.enqueue(row(1));
      await pump();
      const p = a.drain('m1', 5_000);
      for (let i = 0; i < 50 && a.pendingOf('m1') > 0; i++) {
        await pump();
        // 只推进到超时点：重试被 drain 的 kick 即时触发，超时计时器最终触发
        if (!timers.fireNext()) break;
      }
      await p;
      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({ matchID: 'm1' }),
        'archive drain timed out',
      );
      expect(a.pendingOf('m1')).toBe(1);
    });
  });

  describe('flush', () => {
    it('全部写完返回 0', async () => {
      const a = new StepArchiver(archive, timers);
      archive.failAppends = 1;
      a.enqueue(row(1, 'a'));
      a.enqueue(row(1, 'b'));
      a.enqueue(row(2, 'b'));
      await pump();
      expect(await a.flush(5_000)).toBe(0);
      expect(archive.written.sort()).toEqual([1, 1, 2]);
    });

    it('超时返回未写完的条数（步骤加缺口）', async () => {
      const a = new StepArchiver(archive, timers);
      archive.failAppends = 1_000;
      archive.failGaps = 1_000;
      a.enqueue(row(1));
      a.enqueue(row(2));
      a.enqueueGap('m1', 9, 9);
      await pump();
      const p = a.flush(5_000);
      for (let i = 0; i < 50; i++) {
        await pump();
        if (!timers.fireNext()) break;
      }
      expect(await p).toBe(3);
    });

    it('stop 清掉重试计时器', async () => {
      const a = new StepArchiver(archive, timers);
      archive.failAppends = 1;
      a.enqueue(row(1));
      await pump();
      expect(timers.pending()).toHaveLength(1);
      a.stop();
      expect(timers.pending()).toHaveLength(0);
    });
  });
});
