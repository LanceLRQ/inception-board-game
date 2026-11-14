import { describe, expect, it, vi } from 'vitest';
import { archiveColdReplays, type ColdReplayDb } from './ColdReplay.js';

describe('冷归档', () => {
  it('只有已结束至少 30 天的归档参与迁移，对象读回成功后才删除热数据', async () => {
    const date = new Date('2026-11-14T12:00:00Z');
    const order: string[] = [];
    const tx = {
      match: { updateMany: vi.fn(async () => ({ count: 1 })) },
      matchEvent: {
        deleteMany: vi.fn(async () => {
          order.push('delete');
          return { count: 1 };
        }),
        count: vi.fn(async () => 0),
      },
    };
    const db = {
      match: {
        findMany: vi.fn(async () => [{ id: 'match', endedAt: new Date('2026-10-15T12:00:00Z') }]),
      },
      matchEvent: {
        findMany: vi.fn(async () => [
          {
            id: 1n,
            moveCounter: 1,
            eventKind: 'step',
            payload: { request: {}, events: [] },
            createdAt: date,
          },
        ]),
      },
      $transaction: (write: (value: typeof tx) => Promise<unknown>) => write(tx),
    };
    let body = Buffer.alloc(0);
    const store = {
      put: vi.fn(async (_key: string, value: Buffer) => {
        body = Buffer.from(value);
        order.push('put');
      }),
      get: vi.fn(async () => {
        order.push('get');
        return body;
      }),
    };
    await expect(archiveColdReplays(db as unknown as ColdReplayDb, store, date)).resolves.toBe(1);
    expect(db.match.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          replayArchiveKey: null,
          endedAt: { lte: new Date('2026-10-15T12:00:00Z') },
        }),
      }),
    );
    expect(order).toEqual(['put', 'get', 'delete']);

    tx.matchEvent.deleteMany.mockClear();
    store.get.mockResolvedValueOnce(Buffer.from('截断的归档'));
    await expect(archiveColdReplays(db as unknown as ColdReplayDb, store, date)).resolves.toBe(0);
    expect(tx.matchEvent.deleteMany).not.toHaveBeenCalled();
  });
});
