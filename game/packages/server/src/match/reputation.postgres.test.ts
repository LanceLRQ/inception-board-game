import { afterAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { createPrismaReputationStore } from '../services/PrismaReputationStore.js';
import { ReputationService } from '../services/ReputationService.js';
import { PrismaMatchArchive } from './MatchArchive.js';
import { makeTestSnapshot } from './MatchStore.contract.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('信誉分 · PostgreSQL', () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  const archive = new PrismaMatchArchive(prisma);
  const reputation = new ReputationService(createPrismaReputationStore(prisma));

  afterAll(() => prisma.$disconnect());

  it('同局并发归档只结算一次，自建房保留单局积分并豁免信誉', async () => {
    const accounts = await prisma.player.createManyAndReturn({
      data: ['正常完局', '三次超时', '主动退出'].map((nickname) => ({
        nickname,
        avatarSeed: 'test',
      })),
    });
    const matchID = crypto.randomUUID();
    const friendID = crypto.randomUUID();
    const snapshot = makeTestSnapshot(matchID, 4);
    snapshot.state.ctx.gameover = { winner: 'thief' };
    const seats = snapshot.seats.map((seat, i) => ({
      ...seat,
      isBot: i === 3,
      playerId: accounts[i]?.id ?? null,
      ...(i === 1 && { turnTimeouts: 3 }),
      ...(i === 2 && { departed: true }),
    }));
    try {
      await archive.recordStart({ ...snapshot, matchID: friendID, seats });
      await archive.recordFinish(friendID, snapshot.state, seats);
      expect(
        await prisma.reputation.count({ where: { playerId: { in: accounts.map((a) => a.id) } } }),
      ).toBe(0);
      expect(
        (
          await prisma.matchPlayer.findUnique({
            where: { matchId_seat: { matchId: friendID, seat: 0 } },
          })
        )?.score,
      ).toEqual(expect.any(Number));

      await archive.recordStart({ ...snapshot, mode: 'matchmaking', seats });
      await Promise.all([
        archive.recordFinish(matchID, snapshot.state, seats),
        archive.recordFinish(matchID, snapshot.state, seats),
      ]);
      const records = await Promise.all(accounts.map(({ id }) => reputation.get(id)));
      expect(records.map(({ score, completedMatches }) => [score, completedMatches])).toEqual([
        [52, 1],
        [49, 1],
        [45, 0],
      ]);
      const departed = await prisma.matchPlayer.findUnique({
        where: { matchId_seat: { matchId: matchID, seat: 2 } },
      });
      expect(departed).toMatchObject({ score: null, abandoned: true });
    } finally {
      await prisma.match.deleteMany({ where: { id: { in: [matchID, friendID] } } });
      await prisma.player.deleteMany({ where: { id: { in: accounts.map((a) => a.id) } } });
    }
  });

  it('已恢复分数只用于一次写入，并发加减保留全部变更', async () => {
    const { id } = await prisma.player.create({
      data: { nickname: '信誉恢复', avatarSeed: 'test' },
    });
    try {
      await prisma.reputation.create({
        data: {
          playerId: id,
          score: 35,
          level: 'low',
          decayedAt: new Date(Date.now() - 65 * 86_400_000),
        },
      });
      expect((await reputation.get(id)).score).toBe(37);
      await Promise.all([reputation.adjust(id, 'complete'), reputation.adjust(id, 'abandon')]);
      expect(await reputation.get(id)).toMatchObject({
        score: 34,
        completedMatches: 1,
        level: 'low',
      });
    } finally {
      await prisma.player.delete({ where: { id } });
    }
  });

  it('补归档时按实际完局时间计算闲置恢复', async () => {
    const { id } = await prisma.player.create({
      data: { nickname: '延迟归档', avatarSeed: 'test' },
    });
    const matchID = crypto.randomUUID();
    const day = 86_400_000;
    const endedAt = new Date(Date.now() - 3 * day);
    const snapshot = makeTestSnapshot(matchID, 4);
    snapshot.state.ctx.gameover = { winner: 'thief' };
    snapshot.seats[0]!.playerId = id;
    try {
      await prisma.reputation.create({
        data: { playerId: id, score: 35, decayedAt: new Date(+endedAt - 29 * day) },
      });
      await archive.recordStart({ ...snapshot, mode: 'matchmaking' });
      await archive.recordFinish(matchID, snapshot.state, snapshot.seats, endedAt);
      expect(await reputation.get(id)).toMatchObject({ score: 37, decayedAt: endedAt });
      expect((await archive.matchInfo(matchID))?.endedAt).toEqual(endedAt);
    } finally {
      await prisma.match.delete({ where: { id: matchID } });
      await prisma.player.delete({ where: { id } });
    }
  });
});
