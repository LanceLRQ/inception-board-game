// LobbyService 测试 - mock Redis + Prisma

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RoomState } from './LobbyService.js';

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

  beforeEach(() => {
    mock = createMockRedis();
    service = new LobbyService();
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
    it('starts game with 3+ players', async () => {
      prismaMock.player.findUnique.mockResolvedValue(makePlayer('P1'));
      const room = await service.createRoom('P1');

      // 添加额外玩家到 store
      const stored = mock.store.get(`ico:room:${room.code}`)!;
      const state: RoomState = JSON.parse(stored);
      state.players.push(
        {
          playerId: 'P2',
          nickname: 'B',
          avatarSeed: '2',
          seat: 1,
          isBot: false,
          joinedAt: Date.now(),
        },
        {
          playerId: 'P3',
          nickname: 'C',
          avatarSeed: '3',
          seat: 2,
          isBot: false,
          joinedAt: Date.now(),
        },
      );
      mock.store.set(`ico:room:${room.code}`, JSON.stringify(state));

      prismaMock.match.create.mockResolvedValue({ id: room.id });

      const matchId = await service.startGame(room.code, 'P1');
      expect(matchId).toBe(room.id);
      expect(prismaMock.match.create).toHaveBeenCalledOnce();
    });

    it('throws when fewer than 3 players', async () => {
      prismaMock.player.findUnique.mockResolvedValue(makePlayer('P1'));
      const room = await service.createRoom('P1');

      await expect(service.startGame(room.code, 'P1')).rejects.toThrow('至少需要 3 名玩家');
    });

    it('throws when requester is not owner', async () => {
      prismaMock.player.findUnique.mockResolvedValue(makePlayer('P1'));
      const room = await service.createRoom('P1');

      await expect(service.startGame(room.code, 'PX')).rejects.toThrow('只有房主');
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
