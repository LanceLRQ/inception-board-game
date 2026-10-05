// 内存版身份数据库：只实现身份接口与大厅用到的几个查询，数据存在进程内的表里

import type { IdentityPlayerRow, IdentityPrisma } from '../api/identity.js';
import type { LobbyPrisma } from '../services/LobbyService.js';

interface CodeRow {
  codeHash: string;
  playerId: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  useCount: number;
  revokedAt: Date | null;
}

export type MemoryIdentityPrisma = IdentityPrisma & LobbyPrisma;

export function createMemoryIdentityPrisma(): MemoryIdentityPrisma {
  const players = new Map<string, IdentityPlayerRow>();
  const codes = new Map<string, CodeRow>();

  const player: MemoryIdentityPrisma['player'] = {
    async create({ data }) {
      const row: IdentityPlayerRow = {
        ...data,
        createdAt: new Date(),
        isBanned: false,
        banUntil: null,
        banReason: null,
      };
      players.set(row.id, row);
      return row;
    },
    async findUnique({ where }) {
      return players.get(where.id) ?? null;
    },
    async update({ where, data }) {
      const row = players.get(where.id);
      if (!row) throw new Error('Player not found');
      const next = {
        ...row,
        nickname: data.nickname ?? row.nickname,
        avatarSeed: data.avatarSeed ?? row.avatarSeed,
        locale: data.locale ?? row.locale,
        isBanned: data.isBanned ?? row.isBanned,
        banUntil: data.banUntil === undefined ? row.banUntil : data.banUntil,
        banReason: data.banReason === undefined ? row.banReason : data.banReason,
      };
      players.set(row.id, next);
      return next;
    },
  };

  const recoveryCode: MemoryIdentityPrisma['recoveryCode'] = {
    async create({ data }) {
      const row: CodeRow = {
        ...data,
        createdAt: new Date(),
        lastUsedAt: null,
        useCount: 0,
        revokedAt: null,
      };
      codes.set(row.codeHash, row);
      return row;
    },
    async findUnique({ where }) {
      const row = codes.get(where.codeHash);
      const owner = row ? players.get(row.playerId) : undefined;
      return row && owner
        ? { playerId: row.playerId, revokedAt: row.revokedAt, player: owner }
        : null;
    },
    async updateMany({ where, data }) {
      let count = 0;
      for (const row of [...codes.values()]) {
        if (row.revokedAt !== null) continue;
        if (where.playerId !== undefined && row.playerId !== where.playerId) continue;
        if (where.codeHash !== undefined && row.codeHash !== where.codeHash) continue;
        row.revokedAt = data.revokedAt;
        if (data.lastUsedAt) row.lastUsedAt = data.lastUsedAt;
        if (data.useCount) row.useCount += data.useCount.increment;
        if (data.codeHash && data.codeHash !== row.codeHash) {
          codes.delete(row.codeHash);
          row.codeHash = data.codeHash;
          codes.set(row.codeHash, row);
        }
        count += 1;
      }
      return { count };
    },
    async findMany({ where, take }) {
      return [...codes.values()]
        .filter((r) => r.playerId === where.playerId && r.revokedAt === null)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, take)
        .map((r) => ({ createdAt: r.createdAt }));
    },
  };

  return { player, recoveryCode };
}
