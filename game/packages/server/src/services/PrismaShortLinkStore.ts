// 短链的数据库适配器：ShortLinkStore 的 Prisma 实现，短链接口与回放分享共用

import { prisma } from '../infra/postgres.js';
import type { ShortLinkRecord, ShortLinkStore, ShortLinkTargetType } from './ShortLinkService.js';

interface ShortLinkRow {
  code: string;
  targetType: string;
  targetId: string;
  createdByPlayerId: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  hitCount: number;
  lastHitAt: Date | null;
}

function toRecord(row: ShortLinkRow): ShortLinkRecord {
  return {
    code: row.code,
    targetType: row.targetType as ShortLinkTargetType,
    targetId: row.targetId,
    createdByPlayerId: row.createdByPlayerId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    hitCount: row.hitCount,
    lastHitAt: row.lastHitAt,
  };
}

export const prismaShortLinkStore: ShortLinkStore = {
  async findByCode(code) {
    const row = await prisma.shortLink.findUnique({ where: { code } });
    return row ? toRecord(row) : null;
  },
  async save(input) {
    const row = await prisma.shortLink.create({
      data: {
        code: input.code,
        targetType: input.targetType,
        targetId: input.targetId,
        createdByPlayerId: input.createdByPlayerId,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
      },
    });
    return toRecord(row);
  },
  async recordHit(code) {
    await prisma.shortLink
      .update({ where: { code }, data: { hitCount: { increment: 1 }, lastHitAt: new Date() } })
      .catch(() => {
        /* 统计失败不阻塞 */
      });
  },
  async exists(code) {
    return (await prisma.shortLink.count({ where: { code } })) > 0;
  },
  async deleteExpired(cutoff) {
    const { count } = await prisma.shortLink.deleteMany({ where: { expiresAt: { lte: cutoff } } });
    return count;
  },
};
