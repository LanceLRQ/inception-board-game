import { describe, it, expect, vi } from 'vitest';
import type { MoveRequest, MatchEvent } from '@icgame/game-engine/runner';
import { makeTestSnapshot, makeTestState } from './MatchStore.contract.js';
import {
  InMemoryMatchArchive,
  PrismaMatchArchive,
  type PrismaArchiveClient,
  type StepRow,
} from './MatchArchive.js';

const request: MoveRequest = { move: 'endActionPhase', args: [], playerID: '0' } as MoveRequest;
const publicEv: MatchEvent = { stateID: 1, index: 0, kind: 'x', actor: '0', data: { a: 1 } };
const secretEv: MatchEvent = {
  stateID: 1,
  index: 1,
  kind: 'y',
  actor: null,
  data: {},
  secret: { to: ['1'], data: { card: 'secret-card' } },
};

function step(stateID: number): StepRow {
  return {
    matchID: 'm1',
    stateID,
    request,
    events: [publicEv, secretEv],
    at: new Date('2026-10-05T00:00:00Z'),
  };
}

describe('InMemoryMatchArchive', () => {
  it('listSteps 按版本号升序返回，且不与内部共享引用', async () => {
    const a = new InMemoryMatchArchive();
    await a.appendStep(step(3));
    await a.appendStep(step(2));
    const rows = await a.listSteps('m1');
    expect(rows.map((r) => r.stateID)).toEqual([2, 3]);
    rows[0]!.events.length = 0;
    expect((await a.listSteps('m1'))[0]!.events).toHaveLength(2);
  });

  it('重复的版本号视为已写过，不重复记录也不抛', async () => {
    const a = new InMemoryMatchArchive();
    await a.appendStep(step(2));
    await a.appendStep(step(2));
    expect(await a.listSteps('m1')).toHaveLength(1);
  });

  it('其他对局的步骤互不可见；recordStart / recordFinish 可调用', async () => {
    const a = new InMemoryMatchArchive();
    const snap = makeTestSnapshot('m1');
    await a.recordStart(snap);
    await a.recordStart(snap);
    await a.appendStep(step(2));
    await a.recordFinish('m1', snap.state, snap.seats);
    expect(await a.listSteps('other')).toEqual([]);
    expect(a.finished.get('m1')).toBeDefined();
  });

  it('matchInfo：对局不存在返回 null', async () => {
    expect(await new InMemoryMatchArchive().matchInfo('nope')).toBeNull();
  });

  it('matchInfo：开局后给出座位与账号，Bot 座位账号为 null，尚未结束', async () => {
    const a = new InMemoryMatchArchive();
    await a.recordStart(makeTestSnapshot('m1'));
    const info = await a.matchInfo('m1');
    expect(info?.endedAt).toBeNull();
    expect(info?.seats).toEqual([
      { seat: '0', playerId: 'account-0' },
      { seat: '1', playerId: null },
      { seat: '2', playerId: null },
      { seat: '3', playerId: null },
    ]);
  });

  it('matchInfo：recordFinish 之后有结束时间', async () => {
    const a = new InMemoryMatchArchive();
    const snap = makeTestSnapshot('m1');
    await a.recordStart(snap);
    await a.recordFinish('m1', snap.state, snap.seats);
    expect((await a.matchInfo('m1'))?.endedAt).toBeInstanceOf(Date);
  });
});

function makeStub() {
  const stub = {
    match: {
      upsert: vi.fn(async (_arg: unknown) => ({})),
      update: vi.fn(async (_arg: unknown) => ({})),
      findUnique: vi.fn(async (_arg: unknown) => null as { endedAt: Date | null } | null),
    },
    matchPlayer: {
      createMany: vi.fn(async (_arg: unknown) => ({ count: 0 })),
      update: vi.fn(async (_arg: unknown) => ({})),
      findMany: vi.fn(
        async (_arg: unknown) => [] as Array<{ seat: number; playerId: string | null }>,
      ),
    },
    matchEvent: {
      create: vi.fn(async (_arg: unknown) => ({})),
      findMany: vi.fn(async (_arg: unknown) => [] as unknown[]),
      findFirst: vi.fn(async (_arg: unknown) => null as { moveCounter: number } | null),
    },
  };
  return stub;
}

describe('PrismaMatchArchive', () => {
  it('recordStart：upsert 对局行，种子只存 sha256 且原文不出现在任何写入里', async () => {
    const stub = makeStub();
    const archive = new PrismaMatchArchive(stub as unknown as PrismaArchiveClient);
    const snap = makeTestSnapshot('11111111-1111-1111-1111-111111111111');
    snap.setup.seed = 'SUPER-SECRET-SEED-VALUE';
    snap.setup.setupData = { rngSeed: 'SUPER-SECRET-SEED-VALUE', ruleVariant: 'classic' };
    await archive.recordStart(snap);

    const arg = stub.match.upsert.mock.calls[0]![0] as {
      where: { id: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(arg.where).toEqual({ id: snap.matchID });
    expect(arg.create.id).toBe(snap.matchID);
    expect(arg.create.roomId).toBe(snap.matchID);
    expect(arg.create.playerCount).toBe(4);
    expect(arg.create.rngSeed).toMatch(/^[0-9a-f]{64}$/);
    expect(arg.create.metadata).toMatchObject({
      roomCode: 'ROOM01',
      setup: { numPlayers: 4 },
    });
    const all =
      JSON.stringify(stub.match.upsert.mock.calls) +
      JSON.stringify(stub.matchPlayer.createMany.mock.calls);
    expect(all).not.toContain('SUPER-SECRET-SEED-VALUE');
    // 元数据里的座位不含账号 id
    expect(JSON.stringify(arg.create.metadata)).not.toContain('account-0');
  });

  it('recordStart：写各座位，Bot 无账号，重复调用用 skipDuplicates', async () => {
    const stub = makeStub();
    const archive = new PrismaMatchArchive(stub as unknown as PrismaArchiveClient);
    const snap = makeTestSnapshot('m1');
    await archive.recordStart(snap);
    const arg = stub.matchPlayer.createMany.mock.calls[0]![0] as {
      data: Array<Record<string, unknown>>;
      skipDuplicates: boolean;
    };
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data).toHaveLength(4);
    const p0 = arg.data[0]!;
    const p1 = arg.data[1]!;
    expect(p0).toMatchObject({ matchId: 'm1', seat: 0, playerId: 'account-0', isBot: false });
    expect(p0.botLevel).toBeNull();
    expect(p1).toMatchObject({ seat: 1, playerId: null, isBot: true, botLevel: 'L0' });
    const player = snap.state.G.players['1']!;
    expect(p1.role).toBe(player.faction);
    expect(p1.finalFaction).toBe(player.faction);
    expect(p1.characterId).toBe(player.characterId || 'unknown');
  });

  it('appendStep：一步一行，moveCounter 为版本号，payload 含完整事件', async () => {
    const stub = makeStub();
    const archive = new PrismaMatchArchive(stub as unknown as PrismaArchiveClient);
    await archive.appendStep(step(7));
    expect(stub.matchEvent.create).toHaveBeenCalledWith({
      data: {
        matchId: 'm1',
        moveCounter: 7,
        eventKind: 'step',
        payload: { request, events: [publicEv, secretEv] },
        createdAt: new Date('2026-10-05T00:00:00Z'),
      },
    });
  });

  it('appendStep：唯一键冲突（P2002）视为已写过，不抛', async () => {
    const stub = makeStub();
    stub.matchEvent.create.mockRejectedValueOnce(
      Object.assign(new Error('dup'), { code: 'P2002' }),
    );
    const archive = new PrismaMatchArchive(stub as unknown as PrismaArchiveClient);
    await expect(archive.appendStep(step(7))).resolves.toBeUndefined();
  });

  it('appendStep：其他错误照抛', async () => {
    const stub = makeStub();
    stub.matchEvent.create.mockRejectedValueOnce(new Error('connection lost'));
    const archive = new PrismaMatchArchive(stub as unknown as PrismaArchiveClient);
    await expect(archive.appendStep(step(7))).rejects.toThrow('connection lost');
  });

  it('recordFinish：写 endedAt / winner / winReason（截断）与各座位终局阵营和胜负', async () => {
    const stub = makeStub();
    const archive = new PrismaMatchArchive(stub as unknown as PrismaArchiveClient);
    const snap = makeTestSnapshot('m1');
    const final = structuredClone(snap.state);
    // 胜负由运行器记在 ctx.gameover 里，状态里的同名字段保持为空
    final.ctx.gameover = { winner: 'thief', reason: 'x'.repeat(150) };
    await archive.recordFinish('m1', final, snap.seats);

    const m = stub.match.update.mock.calls[0]![0] as {
      where: { id: string };
      data: { endedAt: Date; winner: string | null; winReason: string | null };
    };
    expect(m.where).toEqual({ id: 'm1' });
    expect(m.data.endedAt).toBeInstanceOf(Date);
    expect(m.data.winner).toBe('thief');
    expect(m.data.winReason).toHaveLength(100);

    expect(stub.matchPlayer.update).toHaveBeenCalledTimes(4);
    for (const call of stub.matchPlayer.update.mock.calls) {
      const c = call[0] as {
        where: { matchId_seat: { matchId: string; seat: number } };
        data: { finalFaction: string; won: boolean | null };
      };
      const faction = final.G.players[String(c.where.matchId_seat.seat)]!.faction;
      expect(c.where.matchId_seat.matchId).toBe('m1');
      expect(c.data.finalFaction).toBe(faction);
      expect(c.data.won).toBe(faction === 'thief');
    }
  });

  it('recordFinish：没有获胜方时 won 为 null', async () => {
    const stub = makeStub();
    const archive = new PrismaMatchArchive(stub as unknown as PrismaArchiveClient);
    const snap = makeTestSnapshot('m1');
    const final = makeTestState(4);
    final.G.winner = null;
    final.G.winReason = null;
    await archive.recordFinish('m1', final, snap.seats);
    expect(
      (stub.match.update.mock.calls[0]![0] as { data: { winner: unknown } }).data.winner,
    ).toBeNull();
    for (const call of stub.matchPlayer.update.mock.calls) {
      expect((call[0] as { data: { won: unknown } }).data.won).toBeNull();
    }
  });

  it('listSteps：只取 step 行并按版本号升序，形状不对的行跳过', async () => {
    const stub = makeStub();
    stub.matchEvent.findMany.mockResolvedValueOnce([
      {
        matchId: 'm1',
        moveCounter: 2,
        eventKind: 'step',
        payload: { request, events: [publicEv] },
        createdAt: new Date(5),
      },
      {
        matchId: 'm1',
        moveCounter: 3,
        eventKind: 'step',
        payload: { nope: true },
        createdAt: new Date(6),
      },
      { matchId: 'm1', moveCounter: 4, eventKind: 'step', payload: null, createdAt: new Date(7) },
    ]);
    const archive = new PrismaMatchArchive(stub as unknown as PrismaArchiveClient);
    const rows = await archive.listSteps('m1');
    expect(stub.matchEvent.findMany).toHaveBeenCalledWith({
      where: { matchId: 'm1', eventKind: 'step' },
      orderBy: { moveCounter: 'asc' },
    });
    expect(rows).toEqual([
      { matchID: 'm1', stateID: 2, request, events: [publicEv], at: new Date(5) },
    ]);
  });

  it('listSteps：eventKind 不是 step 的行即使形状碰巧像步骤也忽略', async () => {
    const stub = makeStub();
    stub.matchEvent.findMany.mockResolvedValueOnce([
      {
        matchId: 'm1',
        moveCounter: 2,
        eventKind: 'move.unlock',
        payload: { request, events: [publicEv] },
        createdAt: new Date(5),
      },
    ]);
    const archive = new PrismaMatchArchive(stub as unknown as PrismaArchiveClient);
    expect(await archive.listSteps('m1')).toEqual([]);
  });

  it('matchInfo：对局不存在返回 null', async () => {
    const stub = makeStub();
    const archive = new PrismaMatchArchive(stub as unknown as PrismaArchiveClient);
    expect(await archive.matchInfo('nope')).toBeNull();
  });

  it('matchInfo：读结束时间与座位，座位号转成字符串并按座位号升序', async () => {
    const stub = makeStub();
    const endedAt = new Date(9);
    stub.match.findUnique.mockResolvedValueOnce({ endedAt });
    stub.matchPlayer.findMany.mockResolvedValueOnce([
      { seat: 0, playerId: 'acc-0' },
      { seat: 1, playerId: null },
    ]);
    const archive = new PrismaMatchArchive(stub as unknown as PrismaArchiveClient);
    const info = await archive.matchInfo('m1');
    expect(stub.match.findUnique).toHaveBeenCalledWith({
      where: { id: 'm1' },
      select: { endedAt: true },
    });
    expect(stub.matchPlayer.findMany).toHaveBeenCalledWith({
      where: { matchId: 'm1' },
      select: { seat: true, playerId: true },
      orderBy: { seat: 'asc' },
    });
    expect(info).toEqual({
      endedAt,
      seats: [
        { seat: '0', playerId: 'acc-0' },
        { seat: '1', playerId: null },
      ],
    });
  });

  it('recordGap：缺口写成 gap 行，moveCounter 取结束版本号；唯一键冲突视为已记录', async () => {
    const stub = makeStub();
    const archive = new PrismaMatchArchive(stub as unknown as PrismaArchiveClient);
    await archive.recordGap('m1', 6, 8);
    expect(stub.matchEvent.create).toHaveBeenCalledWith({
      data: { matchId: 'm1', moveCounter: 8, eventKind: 'gap', payload: { from: 6, to: 8 } },
    });
    stub.matchEvent.create.mockRejectedValueOnce(
      Object.assign(new Error('dup'), { code: 'P2002' }),
    );
    await expect(archive.recordGap('m1', 6, 8)).resolves.toBeUndefined();
    stub.matchEvent.create.mockRejectedValueOnce(new Error('connection lost'));
    await expect(archive.recordGap('m1', 6, 8)).rejects.toThrow('connection lost');
  });

  it('listGaps：只读 gap 行，按结束版本号升序，跳过格式不对的 payload', async () => {
    const stub = makeStub();
    stub.matchEvent.findMany.mockResolvedValueOnce([
      { matchId: 'm1', moveCounter: 3, eventKind: 'gap', payload: { from: 2, to: 3 } },
      { matchId: 'm1', moveCounter: 9, eventKind: 'gap', payload: 'bad' },
      { matchId: 'm1', moveCounter: 12, eventKind: 'gap', payload: { from: 10, to: 12 } },
    ]);
    const archive = new PrismaMatchArchive(stub as unknown as PrismaArchiveClient);
    expect(await archive.listGaps('m1')).toEqual([
      { from: 2, to: 3 },
      { from: 10, to: 12 },
    ]);
    expect(stub.matchEvent.findMany).toHaveBeenCalledWith({
      where: { matchId: 'm1', eventKind: 'gap' },
      orderBy: { moveCounter: 'asc' },
    });
  });

  it('lastStepID：取步骤行里最大的 moveCounter，没有步返回 0', async () => {
    const stub = makeStub();
    const archive = new PrismaMatchArchive(stub as unknown as PrismaArchiveClient);
    expect(await archive.lastStepID('m1')).toBe(0);
    expect(stub.matchEvent.findFirst).toHaveBeenCalledWith({
      where: { matchId: 'm1', eventKind: 'step' },
      orderBy: { moveCounter: 'desc' },
      select: { moveCounter: true },
    });
    stub.matchEvent.findFirst.mockResolvedValueOnce({ moveCounter: 17 });
    expect(await archive.lastStepID('m1')).toBe(17);
  });
});

describe('InMemoryMatchArchive 缺口', () => {
  it('recordGap 同一结束版本号只记一次；lastStepID 取最大步号，没有为 0', async () => {
    const archive = new InMemoryMatchArchive();
    expect(await archive.lastStepID('m1')).toBe(0);
    await archive.recordGap('m1', 4, 6);
    await archive.recordGap('m1', 4, 6);
    await archive.recordGap('m1', 9, 9);
    expect(await archive.listGaps('m1')).toEqual([
      { from: 4, to: 6 },
      { from: 9, to: 9 },
    ]);
    expect(await archive.listGaps('other')).toEqual([]);
  });
});
