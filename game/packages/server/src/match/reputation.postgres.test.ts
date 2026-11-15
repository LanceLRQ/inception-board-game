import { afterAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import { createAdminRouter } from '../api/admin.js';
import { createOperatorAuthMiddleware } from '../middleware/operatorAuth.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { createPrismaReputationStore } from '../services/PrismaReputationStore.js';
import { ReputationService } from '../services/ReputationService.js';
import { PrismaReportArchive } from '../services/PrismaReportArchive.js';
import { ReportService, type ReportReason } from '../services/ReportService.js';
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

  it('只在快速匹配的挂机和作弊举报首次核实时扣分', async () => {
    const accounts = await prisma.player.createManyAndReturn({
      data: ['举报人', '举报对象'].map((nickname) => ({ nickname, avatarSeed: 'test' })),
    });
    const [reporter, target] = accounts;
    const matches = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    const reports = new PrismaReportArchive(prisma);
    const service = new ReportService({ archive: reports });
    const token = 'operator-test-token';
    const app = new Koa();
    app.use(errorHandler);
    app.use(bodyParser());
    app.use(
      createAdminRouter({
        archive: reports,
        auth: createOperatorAuthMiddleware({ token }),
      }).routes(),
    );
    const server = createServer(app.callback()).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const scenarios = [
      { matchID: matches[0]!, mode: 'friend', reason: 'afk' },
      { matchID: matches[1]!, mode: 'matchmaking', reason: 'abusive' },
      { matchID: matches[2]!, mode: 'matchmaking', reason: 'cheating' },
    ] as const;
    try {
      for (const { matchID, mode } of scenarios) {
        await prisma.match.create({ data: { id: matchID, mode } });
      }
      const submit = (matchID: string, reason: 'afk' | 'abusive' | 'cheating') =>
        service.submit({ matchID, reason, reporterID: reporter!.id, targetID: target!.id });
      for (const { matchID, reason } of scenarios) {
        expect(await submit(matchID, reason)).toEqual({ ok: true });
      }
      expect((await reputation.get(target!.id)).score).toBe(50);

      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      for (const { matchID } of scenarios) {
        const [report] = await reports.list({ matchID });
        const resolve = () =>
          fetch(`${base}/admin/reports/${report!.id}`, {
            method: 'PATCH',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ status: 'resolved' }),
          });
        const results = await Promise.all([resolve(), resolve()]);
        for (const res of results) {
          expect(res.status).toBe(200);
          expect(await res.json()).toMatchObject({ status: 'resolved' });
        }
      }
      expect((await reputation.get(target!.id)).score).toBe(40);
      const [confirmed] = await reports.list({ matchID: matches[2]! });
      await reports.updateStatus(confirmed!.id, { status: 'pending' });
      await reports.updateStatus(confirmed!.id, { status: 'resolved' });
      expect((await reputation.get(target!.id)).score).toBe(40);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await prisma.report.deleteMany({ where: { matchId: { in: matches } } });
      await prisma.match.deleteMany({ where: { id: { in: matches } } });
      await prisma.player.deleteMany({ where: { id: { in: accounts.map((a) => a.id) } } });
    }
  });

  it('24 小时内 3 名不同玩家的有效局后匹配举报扣 10 分，人工核实不会重复扣分', async () => {
    const accounts = await prisma.player.createManyAndReturn({
      data: ['对象', '首报', '过期', '好友房', '局中', '驳回', '第二位', '第三位', '旧数据'].map(
        (nickname) => ({ nickname, avatarSeed: 'test' }),
      ),
    });
    const [target, first, expired, friend, ongoing, dismissed, second, third, legacy] =
      accounts.map(({ id }) => id);
    const matches = Array.from({ length: 4 }, () => crypto.randomUUID());
    const [matchID, otherMatch, friendMatch, liveMatch] = matches;
    const now = new Date();
    const hour = 60 * 60 * 1000;
    const endedAt = new Date(+now - 48 * hour);
    const reports = new PrismaReportArchive(prisma);
    const submit = (
      reporterID: string,
      id: string = matchID!,
      at = now,
      reason: ReportReason = 'afk',
    ) =>
      new ReportService({ archive: reports, now: () => at }).submit({
        matchID: id,
        reporterID,
        targetID: target!,
        reason,
      });
    try {
      await prisma.match.createMany({
        data: [
          { id: matchID, mode: 'matchmaking', endedAt },
          { id: otherMatch, mode: 'matchmaking', endedAt },
          { id: friendMatch, mode: 'friend', endedAt },
          { id: liveMatch, mode: 'matchmaking' },
        ],
      });
      await prisma.reputation.create({
        data: { playerId: target!, score: 45, completedMatches: 3 },
      });
      expect(await submit(first!)).toEqual({ ok: true });
      expect(await submit(first!)).toEqual({ ok: false, code: 'DUPLICATE' });
      expect(await submit(first!, otherMatch)).toEqual({ ok: true });
      expect(await submit(expired!, matchID, new Date(+now - 25 * hour))).toEqual({ ok: true });
      expect(await submit(friend!, friendMatch)).toEqual({ ok: true });
      expect(await submit(ongoing!, liveMatch, new Date(+now - hour))).toEqual({ ok: true });
      await prisma.match.update({ where: { id: liveMatch }, data: { endedAt: now } });
      expect(await submit(legacy!, 'legacy-match')).toEqual({ ok: true });
      expect(await submit(dismissed!)).toEqual({ ok: true });
      const [rejected] = await reports.list({ reporterID: dismissed });
      await reports.updateStatus(rejected!.id, { status: 'dismissed' });
      expect(await submit(second!, matchID, now, 'abusive')).toEqual({ ok: true });
      expect(await reputation.get(target!)).toMatchObject({ score: 45, level: 'regular' });

      expect(await submit(third!, matchID, now, 'cheating')).toEqual({ ok: true });
      expect(await reputation.get(target!)).toMatchObject({
        score: 35,
        level: 'low',
        completedMatches: 3,
      });
      const applied = await prisma.report.findMany({
        where: { targetId: target, reputationApplied: true },
      });
      expect(applied.map((row) => row.reporterId).sort()).toEqual([first, second, third].sort());
      const [confirmed] = await reports.list({ reporterID: third });
      await reports.updateStatus(confirmed!.id, { status: 'resolved' });
      expect(await reputation.get(target!)).toMatchObject({ score: 35 });
    } finally {
      await prisma.report.deleteMany({ where: { targetId: target } });
      await prisma.match.deleteMany({ where: { id: { in: matches } } });
      await prisma.player.deleteMany({ where: { id: { in: accounts.map(({ id }) => id) } } });
    }
  });

  it('并发提交和重复请求只扣一组，下一组必须再有 3 条未处罚的举报', async () => {
    const accounts = await prisma.player.createManyAndReturn({
      data: Array.from({ length: 7 }, (_, i) => ({ nickname: `并发举报${i}`, avatarSeed: 'test' })),
    });
    const [target, ...reporters] = accounts.map(({ id }) => id);
    const matchID = crypto.randomUUID();
    const reports = new PrismaReportArchive(prisma);
    const service = new ReportService({ archive: reports });
    const submit = (reporterID: string) =>
      service.submit({
        matchID,
        reporterID,
        targetID: target!,
        reason: 'cheating',
      });
    try {
      await prisma.match.create({
        data: { id: matchID, mode: 'matchmaking', endedAt: new Date() },
      });
      const submissions = await Promise.all([...reporters.slice(0, 4), reporters[0]!].map(submit));
      expect(submissions.filter(({ ok }) => ok)).toHaveLength(4);
      expect(submissions).toContainEqual({ ok: false, code: 'DUPLICATE' });
      expect(await reputation.get(target!)).toMatchObject({ score: 40 });
      const applied = await prisma.report.findMany({
        where: { targetId: target, reputationApplied: true },
      });
      expect(applied).toHaveLength(3);
      await Promise.all([
        reports.updateStatus(applied[0]!.id, { status: 'resolved' }),
        reports.updateStatus(applied[0]!.id, { status: 'resolved' }),
        submit(reporters[4]!),
      ]);
      expect(await reputation.get(target!)).toMatchObject({ score: 40 });
      expect(await submit(reporters[5]!)).toEqual({ ok: true });
      expect(await reputation.get(target!)).toMatchObject({ score: 30, level: 'low' });
      expect(
        await prisma.report.count({ where: { targetId: target, reputationApplied: true } }),
      ).toBe(6);
    } finally {
      await prisma.report.deleteMany({ where: { targetId: target } });
      await prisma.match.delete({ where: { id: matchID } });
      await prisma.player.deleteMany({ where: { id: { in: accounts.map(({ id }) => id) } } });
    }
  });
});
