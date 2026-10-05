import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  InceptionCityGame,
  eventsFor,
  parseClientMatchMessage,
  viewMatch,
} from '@icgame/game-engine';
import type { ClientMatchMessage, ServerMatchMessage } from '@icgame/game-engine';
import { BotManager } from '../services/BotManager.js';
import { MoveGateway } from '../services/MoveGateway.js';
import { InMemoryRateGuard } from '../services/RateGuardService.js';
import type { RoomPlayer, RoomState } from '../services/LobbyService.js';
import { InMemoryMatchArchive } from '../match/MatchArchive.js';
import { InMemoryMatchStore } from '../match/MatchStore.js';
import { MatchService } from '../match/MatchService.js';
import type { StepOutput } from '../match/MatchRoom.js';
import type { TimingConfig } from '../match/scheduling.js';
import { FakeTimers } from '../testing/fakeTimers.js';
import {
  authorizeHandshake,
  handleMatchMessage,
  seatInfos,
  snapshotFor,
  stateMessage,
  stepMessage,
} from './matchGateway.js';

const { log } = vi.hoisted(() => ({
  log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../infra/logger.js', () => ({ logger: log }));

const timing: TimingConfig = { botStepDelayMs: 10, pendingTimeoutMs: 5_000, turnTimeoutMs: 20_000 };
const SEED = 'cd'.repeat(32);

function makeRoom(n: number, humans: readonly number[]): RoomState {
  const players: RoomPlayer[] = Array.from({ length: n }, (_, i) => ({
    playerId: humans.includes(i) ? `acct-${i}` : `bot-${i}`,
    nickname: humans.includes(i) ? `真人${i}` : `AI${i}`,
    avatarSeed: 's',
    seat: i,
    isBot: !humans.includes(i),
    joinedAt: 0,
  }));
  return {
    id: 'room-1',
    code: 'ABCDEF',
    ownerPlayerId: 'acct-0',
    maxPlayers: 10,
    ruleVariant: 'classic',
    exCardsEnabled: false,
    expansionEnabled: false,
    status: 'waiting',
    players,
    createdAt: 0,
    expiresAt: 0,
  };
}

interface Harness {
  svc: MatchService;
  timers: FakeTimers;
  steps: StepOutput[];
}

async function makeMatch(): Promise<Harness> {
  const timers = new FakeTimers();
  const steps: StepOutput[] = [];
  const svc = new MatchService({
    store: new InMemoryMatchStore(),
    archive: new InMemoryMatchArchive(),
    bot: new BotManager({ now: timers.now }),
    timing,
    timers,
    randomSeed: () => SEED,
    onStep: (_id, output) => {
      steps.push(output);
    },
    onSeatsChanged: () => undefined,
    onGameOver: () => undefined,
  });
  await svc.createFromRoom(makeRoom(5, [0, 2]));
  return { svc, timers, steps };
}

async function runUntilStep(h: Harness, count = 1): Promise<void> {
  const room = h.svc.get('room-1')!;
  for (let i = 0; i < 500 && h.steps.length < count; i++) {
    await room.idle();
    if (!h.timers.fireNext()) break;
  }
  await room.idle();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('authorizeHandshake', () => {
  let h: Harness;
  const verify = (token: string): { playerId: string; nickname: string } => {
    if (token === 'good-0') return { playerId: 'acct-0', nickname: '真人0' };
    if (token === 'good-stranger') return { playerId: 'acct-x', nickname: '路人' };
    throw new Error('bad token');
  };
  beforeEach(async () => {
    h = await makeMatch();
  });
  const deps = () => ({ verifyToken: verify, matches: h.svc });

  it('accepts a member and returns the seat', () => {
    expect(authorizeHandshake({ token: 'good-0', matchID: 'room-1' }, deps())).toEqual({
      ok: true,
      playerID: 'acct-0',
      matchID: 'room-1',
      nickname: '真人0',
      seat: '0',
    });
  });

  it('rejects non-object auth or missing fields with AUTH_REQUIRED', () => {
    for (const auth of [undefined, null, 'x', 5, {}, { token: 'good-0' }, { matchID: 'room-1' }]) {
      expect(authorizeHandshake(auth, deps())).toEqual({ ok: false, error: 'AUTH_REQUIRED' });
    }
    expect(authorizeHandshake({ token: 'good-0', matchID: '' }, deps())).toEqual({
      ok: false,
      error: 'AUTH_REQUIRED',
    });
    expect(authorizeHandshake({ token: 'good-0', matchID: 'x'.repeat(65) }, deps())).toEqual({
      ok: false,
      error: 'AUTH_REQUIRED',
    });
    expect(authorizeHandshake({ token: 'good-0', matchID: 12 }, deps())).toEqual({
      ok: false,
      error: 'AUTH_REQUIRED',
    });
  });

  it('rejects an invalid token with AUTH_INVALID', () => {
    expect(authorizeHandshake({ token: 'nope', matchID: 'room-1' }, deps())).toEqual({
      ok: false,
      error: 'AUTH_INVALID',
    });
  });

  it('gives a non-member and a missing match the same error', () => {
    const stranger = authorizeHandshake({ token: 'good-stranger', matchID: 'room-1' }, deps());
    const missing = authorizeHandshake({ token: 'good-0', matchID: 'no-such-match' }, deps());
    expect(stranger).toEqual({ ok: false, error: 'NOT_IN_MATCH' });
    expect(missing).toEqual(stranger);
  });

  it('does not log the token on rejection', () => {
    authorizeHandshake({ token: 'secret-token-value', matchID: 'room-1' }, deps());
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('secret-token-value');
  });
});

describe('seatInfos', () => {
  it('marks bot seats connected and reflects human seat status', async () => {
    const h = await makeMatch();
    const room = h.svc.get('room-1')!;
    const infos = seatInfos(room, {
      isConnected: (seat) => seat === '0',
      isTakenOver: (seat) => seat === '2',
    });
    expect(infos).toHaveLength(5);
    expect(infos[0]).toMatchObject({ seat: '0', isBot: false, connected: true, takenOver: false });
    expect(infos[2]).toMatchObject({ seat: '2', isBot: false, connected: false, takenOver: true });
    expect(infos[1]).toMatchObject({ seat: '1', isBot: true, connected: true, takenOver: false });
  });
});

describe('state and step messages', () => {
  it('stateMessage carries protocol and the seat-specific view', async () => {
    const h = await makeMatch();
    const room = h.svc.get('room-1')!;
    const seats = seatInfos(room, { isConnected: () => true, isTakenOver: () => false });
    const msg = stateMessage(room, '2', seats);
    expect(msg.type).toBe('icg:state');
    expect(msg.protocol).toBe(1);
    expect(msg.seat).toBe('2');
    expect(msg.matchID).toBe('room-1');
    expect(msg.view).toEqual(viewMatch(InceptionCityGame, room.current(), '2'));
    expect(msg.seats).toEqual(seats);
  });

  it('snapshotFor uses viewMatch for the given seat', async () => {
    const h = await makeMatch();
    const room = h.svc.get('room-1')!;
    const snap = snapshotFor(room, '0', []);
    expect(snap.view).toEqual(viewMatch(InceptionCityGame, room.current(), '0'));
    expect(snap.deadlineAt).toBe(room.deadlineAt());
  });

  it('stepMessage gives every seat its own view and events, with no secrets leaking', async () => {
    const h = await makeMatch();
    await runUntilStep(h, 1);
    expect(h.steps.length).toBeGreaterThan(0);
    const output = h.steps[0]!;
    const room = h.svc.get('room-1')!;
    const seats = seatInfos(room, { isConnected: () => true, isTakenOver: () => false });

    for (const seat of ['0', '1', '2', '3', '4']) {
      const msg = stepMessage(room, output, seat, seats);
      expect(msg.type).toBe('icg:step');
      expect(msg.view).toEqual(viewMatch(InceptionCityGame, output.state, seat));
      expect(msg.events).toEqual(eventsFor(output.events, seat));
      expect(msg.deadlineAt).toBe(output.deadlineAt);

      const text = JSON.stringify(msg);
      expect(text).not.toContain('rngState');
      expect(text).not.toContain(SEED);

      const players = (msg.view.G as { players: Record<string, { hand: unknown }> }).players;
      for (const other of Object.keys(players)) {
        if (other !== seat) expect(players[other]!.hand).toBeNull();
      }
    }
  });
});

describe('handleMatchMessage', () => {
  const ctx = { matchID: 'room-1', playerID: 'acct-0', seat: '0' };
  const move = (over: Partial<Extract<ClientMatchMessage, { type: 'icg:move' }>> = {}) =>
    ({
      type: 'icg:move',
      move: 'endActionPhase',
      args: [],
      intentId: 'i-1',
      ...over,
    }) as ClientMatchMessage;

  it('icg:sync returns the viewer state', async () => {
    const h = await makeMatch();
    const out = await handleMatchMessage({ type: 'icg:sync' }, ctx, {
      matches: h.svc,
      moveGateway: new MoveGateway(new InMemoryRateGuard()),
      seatsFor: () => [],
    });
    expect(out.type).toBe('icg:state');
    expect((out as Extract<ServerMatchMessage, { type: 'icg:state' }>).seat).toBe('0');
  });

  it('icg:sync 与 move 共用限流计数，超限后回 RATE_LIMITED 且不发状态', async () => {
    const h = await makeMatch();
    const deps = {
      matches: h.svc,
      moveGateway: new MoveGateway(new InMemoryRateGuard({ maxPerWindow: 3 })),
      seatsFor: () => [],
    };
    const outs = [];
    for (let i = 0; i < 5; i++)
      outs.push(await handleMatchMessage({ type: 'icg:sync' }, ctx, deps));
    expect(outs.slice(0, 3).map((o) => o.type)).toEqual(['icg:state', 'icg:state', 'icg:state']);
    expect(outs[3]).toMatchObject({ type: 'icg:error', code: 'RATE_LIMITED' });
    expect(outs[4]).toMatchObject({ type: 'icg:error', code: 'RATE_LIMITED' });

    // 同一账号的 move 也已被同一计数器挡住
    const moveOut = await handleMatchMessage(move(), ctx, deps);
    expect(moveOut).toMatchObject({ ok: false, code: 'rate_limited' });
  });

  it('answers not_in_match when the room is gone', async () => {
    const h = await makeMatch();
    const out = await handleMatchMessage(
      move(),
      { ...ctx, matchID: 'ghost' },
      { matches: h.svc, moveGateway: new MoveGateway(new InMemoryRateGuard()), seatsFor: () => [] },
    );
    expect(out).toEqual({
      type: 'icg:moveResult',
      intentId: 'i-1',
      ok: false,
      code: 'not_in_match',
    });
  });

  it('maps a rate limit rejection and never calls room.submit', async () => {
    const submit = vi.fn();
    const matches = {
      get: () => ({ current: () => ({ ctx: { phase: 'playing' } }), submit }) as never,
    };
    const moveGateway = {
      accept: vi.fn().mockResolvedValue({ ok: false, code: 'RATE_LIMIT_EXCEEDED', reason: 'x' }),
      commit: vi.fn(),
      consumeRate: vi.fn(),
    };
    const out = await handleMatchMessage(move(), ctx, {
      matches,
      moveGateway,
      seatsFor: () => [],
    });
    expect(out).toEqual({
      type: 'icg:moveResult',
      intentId: 'i-1',
      ok: false,
      code: 'rate_limited',
    });
    expect(submit).not.toHaveBeenCalled();
    expect(moveGateway.commit).not.toHaveBeenCalled();
  });

  it('maps a duplicate-intent rejection and passes shape codes through', async () => {
    const matches = {
      get: () => ({ current: () => ({ ctx: { phase: 'playing' } }), submit: vi.fn() }) as never,
    };
    const run = async (code: string) =>
      handleMatchMessage(move(), ctx, {
        matches,
        moveGateway: {
          accept: vi.fn().mockResolvedValue({ ok: false, code, reason: 'x' }),
          commit: vi.fn(),
          consumeRate: vi.fn(),
        },
        seatsFor: () => [],
      });
    expect(await run('RATE_INTENT_DUPLICATE')).toMatchObject({ code: 'duplicate_intent' });
    expect(await run('unknown_move')).toMatchObject({ code: 'unknown_move' });
  });

  it('counts a malformed request against the rate limit', async () => {
    const commit = vi.fn();
    const out = await handleMatchMessage(move(), ctx, {
      matches: {
        get: () => ({ current: () => ({ ctx: { phase: 'playing' } }), submit: vi.fn() }) as never,
      },
      moveGateway: {
        accept: vi.fn().mockResolvedValue({ ok: false, code: 'unknown_move', reason: 'x' }),
        commit,
        consumeRate: vi.fn(),
      },
      seatsFor: () => [],
    });
    expect(out).toMatchObject({ ok: false, code: 'unknown_move' });
    expect(commit).toHaveBeenCalledWith({ playerID: 'acct-0' });
  });

  it('rejects an unknown move through the real gateway', async () => {
    const h = await makeMatch();
    const out = await handleMatchMessage(move({ move: 'noSuchMove' }), ctx, {
      matches: h.svc,
      moveGateway: new MoveGateway(new InMemoryRateGuard()),
      seatsFor: () => [],
    });
    expect(out).toEqual({
      type: 'icg:moveResult',
      intentId: 'i-1',
      ok: false,
      code: 'unknown_move',
    });
  });

  it('uses the authenticated seat, ignoring forged seat or player fields in the message', async () => {
    const submit = vi.fn().mockResolvedValue({ ok: true, stateID: 7 });
    const accept = vi.fn().mockImplementation(async (input: { request: unknown }) => ({
      ok: true,
      request: input.request,
      context: { playerID: 'acct-0' },
    }));
    const commit = vi.fn();
    const forged = parseClientMatchMessage('icg:move', {
      ...move(),
      seat: '4',
      playerID: 'acct-4',
      playerId: 'acct-4',
    })!;
    const out = await handleMatchMessage(forged, ctx, {
      matches: {
        get: () => ({ current: () => ({ ctx: { phase: 'playing' } }), submit }) as never,
      },
      moveGateway: { accept, commit, consumeRate: vi.fn() },
      seatsFor: () => [],
    });
    expect(out).toEqual({ type: 'icg:moveResult', intentId: 'i-1', ok: true, stateID: 7 });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]![0]).toBe('0');
    expect(accept.mock.calls[0]![0].playerID).toBe('acct-0');
    expect(accept.mock.calls[0]![0].intentId).toBeUndefined();
    expect(JSON.stringify(accept.mock.calls[0]![0].request)).not.toContain('acct-4');
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('counts the attempt against the rate limit even when the runner rejects', async () => {
    const commit = vi.fn();
    const out = await handleMatchMessage(move(), ctx, {
      matches: {
        get: () =>
          ({
            current: () => ({ ctx: { phase: 'playing' } }),
            submit: vi.fn().mockResolvedValue({ ok: false, code: 'stale_state' }),
          }) as never,
      },
      moveGateway: {
        accept: vi
          .fn()
          .mockResolvedValue({ ok: true, request: { move: 'm', args: [] }, context: {} }),
        commit,
        consumeRate: vi.fn(),
      },
      seatsFor: () => [],
    });
    expect(out).toMatchObject({ ok: false, code: 'stale_state' });
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('returns the same result for a repeated intentId without a second execution', async () => {
    const h = await makeMatch();
    const deps = {
      matches: h.svc,
      moveGateway: new MoveGateway(new InMemoryRateGuard()),
      seatsFor: () => [],
    };
    const room = h.svc.get('room-1')!;
    const before = room.current().stateID;
    // 座位 0 不一定轮到行动；无论被接受还是被拒绝，同一 intentId 的第二次结果必须与第一次相同
    const first = await handleMatchMessage(move({ intentId: 'dup-1' }), ctx, deps);
    const second = await handleMatchMessage(move({ intentId: 'dup-1' }), ctx, deps);
    expect(second).toEqual(first);
    expect(room.current().stateID).toBeLessThanOrEqual(before + 1);
  });

  it('answers internal_error without leaking the exception text', async () => {
    const out = await handleMatchMessage(move(), ctx, {
      matches: {
        get: () => {
          throw new Error('boom: secret detail');
        },
      },
      moveGateway: { accept: vi.fn(), commit: vi.fn(), consumeRate: vi.fn() },
      seatsFor: () => [],
    });
    expect(out).toEqual({
      type: 'icg:moveResult',
      intentId: 'i-1',
      ok: false,
      code: 'internal_error',
    });
    expect(JSON.stringify(out)).not.toContain('secret');
    expect(log.error).toHaveBeenCalled();
  });
});
