// LobbyService 测试 - mock Redis + Prisma + 对局服务

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { RoomState } from './LobbyService.js';
import { AppError } from '../infra/errors.js';

// --- Mock Redis ---
function createMockRedis() {
  const store = new Map<string, string>();
  return {
    store,
    redis: {
      get: (key: string) => Promise.resolve(store.get(key) ?? null),
      setex: (key: string, _ttl: number, val: string) => {
        store.set(key, val);
        return Promise.resolve('OK');
      },
      del: (key: string) => {
        store.delete(key);
        return Promise.resolve(1);
      },
      exists: (key: string) => Promise.resolve(store.has(key) ? 1 : 0),
      // 只支持 SET key value EX seconds NX
      set: vi.fn((key: string, val: string, ..._opts: unknown[]) => {
        if (store.has(key)) return Promise.resolve(null);
        store.set(key, val);
        return Promise.resolve('OK');
      }),
    },
  };
}

let mock: ReturnType<typeof createMockRedis>;

vi.mock('../infra/redis.js', () => ({
  createRedisClient: () => mock.redis,
}));

// --- Mock Prisma ---
// vi.hoisted 确保在 vi.mock 工厂中可用
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    player: { findUnique: vi.fn() },
    match: { create: vi.fn() },
  },
}));

vi.mock('../infra/postgres.js', () => ({
  prisma: prismaMock,
}));

vi.mock('../infra/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { LobbyService } from './LobbyService.js';

function makePlayer(id: string, nickname?: string) {
  return {
    id,
    nickname: nickname ?? `Nick-${id}`,
    avatarSeed: 'seed-123',
  };
}

describe('LobbyService', () => {
  let service: LobbyService;
  let matches: { createFromRoom: Mock<(room: RoomState) => Promise<string>> };

  beforeEach(() => {
    mock = createMockRedis();
    matches = { createFromRoom: vi.fn(async (room: RoomState) => room.id) };
    service = new LobbyService({ matches });
    vi.clearAllMocks();
  });

  describe('createRoom', () => {
    it('creates room with owner as first player', async () => {
      prismaMock.player.findUnique.mockResolvedValue(makePlayer('P1', 'Alice'));

      const room = await service.createRoom('P1');

      expect(room.ownerPlayerId).toBe('P1');
      expect(room.players).toHaveLength(1);
      expect(room.players[0]!.playerId).toBe('P1');
      expect(room.players[0]!.nickname).toBe('Alice');
      expect(room.players[0]!.seat).toBe(0);
      expect(room.status).toBe('waiting');
      expect(room.code).toHaveLength(6);
    });

    it('throws when owner not found', async () => {
      prismaMock.player.findUnique.mockResolvedValue(null);
      await expect(service.createRoom('MISSING')).rejects.toThrow('Player not found');
    });

    it('uses custom options', async () => {
      prismaMock.player.findUnique.mockResolvedValue(makePlayer('P1'));
      const room = await service.createRoom('P1', {
        maxPlayers: 8,
        ruleVariant: 'turbo',
        exCardsEnabled: true,
        expansionEnabled: true,
      });
      expect(room.maxPlayers).toBe(8);
      expect(room.ruleVariant).toBe('turbo');
      expect(room.exCardsEnabled).toBe(true);
      expect(room.expansionEnabled).toBe(true);
    });

    it('persists room to Redis', async () => {
      prismaMock.player.findUnique.mockResolvedValue(makePlayer('P1'));
      const room = await service.createRoom('P1');
      const stored = mock.store.get(`ico:room:${room.code}`);
      expect(stored).toBeDefined();
      expect(JSON.parse(stored!).id).toBe(room.id);
    });
  });

  describe('joinRoom', () => {
    async function createRoom() {
      prismaMock.player.findUnique.mockResolvedValueOnce(makePlayer('P1'));
      return service.createRoom('P1');
    }

    it('adds player to room', async () => {
      const room = await createRoom();
      prismaMock.player.findUnique.mockResolvedValueOnce(makePlayer('P2', 'Bob'));

      const updated = await service.joinRoom(room.code, 'P2');
      expect(updated.players).toHaveLength(2);
      expect(updated.players[1]!.playerId).toBe('P2');
      expect(updated.players[1]!.seat).toBe(1);
    });

    it('returns room unchanged if player already in room', async () => {
      const room = await createRoom();
      prismaMock.player.findUnique.mockResolvedValueOnce(makePlayer('P1'));
      const updated = await service.joinRoom(room.code, 'P1');
      expect(updated.players).toHaveLength(1);
    });

    it('throws when room not found', async () => {
      await expect(service.joinRoom('XXXXXX', 'P1')).rejects.toThrow('房间不存在');
    });

    it('throws when room is full', async () => {
      const room = await createRoom();
      // 填满房间
      const stored = mock.store.get(`ico:room:${room.code}`)!;
      const full: RoomState = {
        ...JSON.parse(stored),
        players: Array.from({ length: room.maxPlayers }, (_, i) => ({
          playerId: `P${i}`,
          seat: i,
          isBot: false,
          joinedAt: Date.now(),
        })),
      };
      mock.store.set(`ico:room:${room.code}`, JSON.stringify(full));

      prismaMock.player.findUnique.mockResolvedValue(makePlayer('PX'));
      await expect(service.joinRoom(room.code, 'PX')).rejects.toThrow('房间已满');
    });

    it('throws when game already started', async () => {
      const room = await createRoom();
      const stored = mock.store.get(`ico:room:${room.code}`)!;
      const playing: RoomState = { ...JSON.parse(stored), status: 'playing' };
      mock.store.set(`ico:room:${room.code}`, JSON.stringify(playing));

      await expect(service.joinRoom(room.code, 'PX')).rejects.toThrow('游戏已开始');
    });
  });

  describe('leaveRoom', () => {
    async function createTwoPlayerRoom() {
      prismaMock.player.findUnique.mockResolvedValueOnce(makePlayer('P1'));
      prismaMock.player.findUnique.mockResolvedValueOnce(makePlayer('P2'));
      const room = await service.createRoom('P1');
      await service.joinRoom(room.code, 'P2');
      return room.code;
    }

    it('removes player from room', async () => {
      const code = await createTwoPlayerRoom();
      await service.leaveRoom(code, 'P2');
      const room = await service.getRoom(code);
      expect(room!.players).toHaveLength(1);
      expect(room!.players[0]!.playerId).toBe('P1');
    });

    it('transfers ownership when owner leaves', async () => {
      const code = await createTwoPlayerRoom();
      await service.leaveRoom(code, 'P1');
      const room = await service.getRoom(code);
      expect(room!.ownerPlayerId).toBe('P2');
    });

    it('deletes room when last player leaves', async () => {
      const code = await createTwoPlayerRoom();
      await service.leaveRoom(code, 'P2');
      await service.leaveRoom(code, 'P1');
      const room = await service.getRoom(code);
      expect(room).toBeNull();
    });

    it('no-op when player not in room', async () => {
      const code = await createTwoPlayerRoom();
      // 不应抛错
      await service.leaveRoom(code, 'PX');
      const room = await service.getRoom(code);
      expect(room!.players).toHaveLength(2);
    });
  });

  describe('kickPlayer', () => {
    it('removes target player', async () => {
      prismaMock.player.findUnique.mockResolvedValueOnce(makePlayer('P1'));
      prismaMock.player.findUnique.mockResolvedValueOnce(makePlayer('P2'));
      const room = await service.createRoom('P1');
      await service.joinRoom(room.code, 'P2');

      const updated = await service.kickPlayer(room.code, 'P1', 'P2');
      expect(updated.players).toHaveLength(1);
    });

    it('throws when requester is not owner', async () => {
      prismaMock.player.findUnique.mockResolvedValueOnce(makePlayer('P1'));
      prismaMock.player.findUnique.mockResolvedValueOnce(makePlayer('P2'));
      const room = await service.createRoom('P1');
      await service.joinRoom(room.code, 'P2');

      await expect(service.kickPlayer(room.code, 'P2', 'P1')).rejects.toThrow('只有房主');
    });

    it('throws when target not in room', async () => {
      prismaMock.player.findUnique.mockResolvedValueOnce(makePlayer('P1'));
      const room = await service.createRoom('P1');

      await expect(service.kickPlayer(room.code, 'P1', 'PX')).rejects.toThrow('不在房间');
    });
  });

  describe('startGame', () => {
    /** 建一个房主为 P1、共 count 名玩家的房间（直接写入存储） */
    async function roomWith(count: number): Promise<RoomState> {
      prismaMock.player.findUnique.mockResolvedValue(makePlayer('P1'));
      const room = await service.createRoom('P1');
      const stored = mock.store.get(`ico:room:${room.code}`)!;
      const state: RoomState = JSON.parse(stored);
      for (let i = 1; i < count; i++) {
        state.players.push({
          playerId: `P${i + 1}`,
          nickname: `N${i + 1}`,
          avatarSeed: String(i),
          seat: i,
          isBot: false,
          joinedAt: Date.now(),
        });
      }
      mock.store.set(`ico:room:${room.code}`, JSON.stringify(state));
      return state;
    }

    it('starts game with 4+ players', async () => {
      const room = await roomWith(4);

      const matchId = await service.startGame(room.code, 'P1');
      expect(matchId).toBe(room.id);
      expect(matches.createFromRoom).toHaveBeenCalledOnce();
      expect(matches.createFromRoom.mock.calls[0]![0].id).toBe(room.id);
      expect(prismaMock.match.create).not.toHaveBeenCalled();
      expect((await service.getRoom(room.code))!.status).toBe('playing');
    });

    it('starts a game with robots filling the seats', async () => {
      const room = await roomWith(1);
      await service.fillAI(room.code, 'P1', 3);
      await expect(service.startGame(room.code, 'P1')).resolves.toBe(room.id);
    });

    it('throws when fewer than 4 players', async () => {
      const room = await roomWith(3);

      await expect(service.startGame(room.code, 'P1')).rejects.toThrow('至少需要 4 名玩家');
      expect(matches.createFromRoom).not.toHaveBeenCalled();
      expect((await service.getRoom(room.code))!.status).toBe('waiting');
    });

    it('throws when requester is not owner', async () => {
      prismaMock.player.findUnique.mockResolvedValue(makePlayer('P1'));
      const room = await service.createRoom('P1');

      await expect(service.startGame(room.code, 'PX')).rejects.toThrow('只有房主');
    });

    it('throws when the room does not exist or already started', async () => {
      await expect(service.startGame('XXXXXX', 'P1')).rejects.toThrow('房间不存在');

      const room = await roomWith(4);
      await service.startGame(room.code, 'P1');
      await expect(service.startGame(room.code, 'P1')).rejects.toMatchObject({
        code: 'ROOM_STARTED',
      });
    });

    it('keeps the room waiting, releases the lock and rethrows when the match cannot be created', async () => {
      const room = await roomWith(4);
      const failure = new AppError('CONFLICT', '该对局已存在');
      matches.createFromRoom.mockRejectedValueOnce(failure);

      await expect(service.startGame(room.code, 'P1')).rejects.toBe(failure);
      expect((await service.getRoom(room.code))!.status).toBe('waiting');
      expect(mock.store.has(`ico:room:${room.code}:starting`)).toBe(false);

      // 锁已释放，可以重试
      await expect(service.startGame(room.code, 'P1')).resolves.toBe(room.id);
    });

    it('takes a short start lock: SET NX EX 10', async () => {
      const room = await roomWith(4);
      await service.startGame(room.code, 'P1');
      expect(mock.redis.set).toHaveBeenCalledWith(
        `ico:room:${room.code}:starting`,
        '1',
        'EX',
        10,
        'NX',
      );
    });

    it('creates only one match when two starts race', async () => {
      const room = await roomWith(4);
      let release: () => void = () => {};
      matches.createFromRoom.mockImplementationOnce(
        (r: RoomState) =>
          new Promise<string>((resolve) => {
            release = () => resolve(r.id);
          }),
      );

      const first = service.startGame(room.code, 'P1');
      const second = service.startGame(room.code, 'P1');
      await expect(second).rejects.toMatchObject({ code: 'CONFLICT', message: '正在开始' });
      release();
      await expect(first).resolves.toBe(room.id);
      expect(matches.createFromRoom).toHaveBeenCalledTimes(1);
    });

    it('throws INTERNAL_ERROR when no match service is wired', async () => {
      const bare = new LobbyService();
      prismaMock.player.findUnique.mockResolvedValue(makePlayer('P1'));
      const room = await bare.createRoom('P1');
      const stored: RoomState = JSON.parse(mock.store.get(`ico:room:${room.code}`)!);
      for (let i = 1; i < 4; i++) {
        stored.players.push({ ...stored.players[0]!, playerId: `P${i + 1}`, seat: i });
      }
      mock.store.set(`ico:room:${room.code}`, JSON.stringify(stored));

      await expect(bare.startGame(room.code, 'P1')).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
        message: '对局服务未就绪',
      });
      expect((await bare.getRoom(room.code))!.status).toBe('waiting');
    });
  });

  describe('fillAI', () => {
    it('fills room with AI players', async () => {
      prismaMock.player.findUnique.mockResolvedValue(makePlayer('P1'));
      const room = await service.createRoom('P1');

      const updated = await service.fillAI(room.code, 'P1', 2);
      expect(updated.players).toHaveLength(3); // 1 human + 2 bots
      const bots = updated.players.filter((p) => p.isBot);
      expect(bots).toHaveLength(2);
      expect(bots[0]!.playerId).toMatch(/^bot-/);
    });

    it('respects maxPlayers limit', async () => {
      prismaMock.player.findUnique.mockResolvedValue(makePlayer('P1'));
      const room = await service.createRoom('P1', { maxPlayers: 4 });

      // 请求 10 个 AI，但只有 3 个空位
      const updated = await service.fillAI(room.code, 'P1', 10);
      expect(updated.players).toHaveLength(4);
    });

    it('throws when not owner', async () => {
      prismaMock.player.findUnique.mockResolvedValue(makePlayer('P1'));
      const room = await service.createRoom('P1');

      await expect(service.fillAI(room.code, 'PX')).rejects.toThrow('只有房主');
    });

    it('throws when game already started', async () => {
      prismaMock.player.findUnique.mockResolvedValue(makePlayer('P1'));
      const room = await service.createRoom('P1');
      const stored = mock.store.get(`ico:room:${room.code}`)!;
      mock.store.set(
        `ico:room:${room.code}`,
        JSON.stringify({ ...JSON.parse(stored), status: 'playing' }),
      );

      await expect(service.fillAI(room.code, 'P1')).rejects.toThrow('游戏已开始');
    });
  });

  describe('nextAvailableSeat', () => {
    it('assigns sequential seats with gaps', async () => {
      prismaMock.player.findUnique.mockResolvedValue(makePlayer('P1'));
      const room = await service.createRoom('P1');

      // 手动设置玩家占 seat 0 和 seat 2
      const stored = mock.store.get(`ico:room:${room.code}`)!;
      const state: RoomState = JSON.parse(stored);
      state.players.push({
        playerId: 'P2',
        nickname: 'B',
        avatarSeed: '2',
        seat: 2,
        isBot: false,
        joinedAt: Date.now(),
      });
      mock.store.set(`ico:room:${room.code}`, JSON.stringify(state));

      // 加入新玩家应获得 seat 1
      prismaMock.player.findUnique.mockResolvedValueOnce(makePlayer('P3'));
      const updated = await service.joinRoom(room.code, 'P3');
      expect(updated.players.find((p) => p.playerId === 'P3')!.seat).toBe(1);
    });
  });
});
