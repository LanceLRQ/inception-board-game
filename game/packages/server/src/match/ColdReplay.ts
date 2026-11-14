// 冷归档包含未裁剪事件，仅由服务端读取。公开接口仍走现有的座位视角裁剪。
import { createHash } from 'node:crypto';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client.js';
import { logger } from '../infra/logger.js';

const compress = promisify(gzip);
const decompress = promisify(gunzip);
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const digest = (body: Buffer) => createHash('sha256').update(body).digest('hex');

const archiveSchema = z.object({
  version: z.literal(1),
  rows: z.array(
    z.object({
      moveCounter: z.number().int(),
      eventKind: z.string(),
      payload: z.json(),
      createdAt: z.iso.datetime().transform((value) => new Date(value)),
    }),
  ),
});

export type ColdEvent = z.output<typeof archiveSchema>['rows'][number];
export type ColdReplayDb = Pick<PrismaClient, 'match' | 'matchEvent' | '$transaction'>;

export interface ReplayObjectStore {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

export async function readColdReplay(store: ReplayObjectStore, key: string): Promise<ColdEvent[]> {
  const body = await store.get(key);
  if (!key.endsWith(`/${digest(body)}.json.gz`))
    throw new Error('Replay archive checksum mismatch');
  const text = (await decompress(body)).toString('utf8');
  return archiveSchema.parse(JSON.parse(text)).rows;
}

export async function archiveColdReplays(
  db: ColdReplayDb,
  store: ReplayObjectStore,
  now = new Date(),
): Promise<number> {
  const candidates = await db.match.findMany({
    where: {
      replayArchiveKey: null,
      endedAt: { lte: new Date(now.getTime() - RETENTION_MS) },
      matchEvents: { some: {} },
    },
    orderBy: [{ endedAt: 'asc' }, { id: 'asc' }],
    select: { id: true, endedAt: true },
    take: 100,
  });
  let moved = 0;
  for (const { id, endedAt } of candidates) {
    try {
      const rows = await db.matchEvent.findMany({
        where: { matchId: id },
        orderBy: { moveCounter: 'asc' },
        select: { id: true, moveCounter: true, eventKind: true, payload: true, createdAt: true },
      });
      if (rows.length === 0) continue;
      const body = await compress(
        JSON.stringify({
          version: 1,
          rows: rows.map(({ moveCounter, eventKind, payload, createdAt }) => ({
            moveCounter,
            eventKind,
            payload,
            createdAt,
          })),
        }),
      );
      const key = `replays/v1/${id}/${digest(body)}.json.gz`;
      await store.put(key, body);
      await readColdReplay(store, key);
      const archived = await db.$transaction(async (tx) => {
        const claimed = await tx.match.updateMany({
          where: { id, endedAt, replayArchiveKey: null },
          data: { replayArchiveKey: key },
        });
        if (!claimed.count) return false;
        const { count } = await tx.matchEvent.deleteMany({
          where: { matchId: id, id: { in: rows.map((row) => row.id) } },
        });
        if (count !== rows.length || (await tx.matchEvent.count({ where: { matchId: id } }))) {
          throw new Error('Replay changed during archiving');
        }
        return true;
      });
      if (archived) moved++;
    } catch (err) {
      logger.error({ matchID: id, err }, 'cold replay archive failed');
    }
  }
  return moved;
}
