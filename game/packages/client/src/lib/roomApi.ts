// 房间 API 抽象层
// - 优先走真实后端（`/rooms/...`）
// - 若 VITE_USE_MOCK_API=1 或真实请求失败（网络/5xx/未部署），退化为 LocalStorage 本地实现
// - 1 人类 + N AI 好友房模式下，Mock 路径即可覆盖完整流程
//
// 对照：plans/design/07-backend-network.md §7.3.2.3

import { api, ApiRequestError } from './api';
import { logger } from './logger';

export interface RoomPlayer {
  playerId: string;
  nickname: string;
  avatarSeed: string;
  seat: number;
  isBot: boolean;
  joinedAt: number;
}

export interface RoomState {
  id: string;
  code: string;
  ownerPlayerId: string;
  maxPlayers: number;
  ruleVariant: string;
  status: 'waiting' | 'playing' | 'finished';
  players: RoomPlayer[];
}

export interface CreateRoomResponse {
  id: string;
  code: string;
  ownerPlayerId: string;
  maxPlayers: number;
  currentPlayers: number;
  status: 'waiting' | 'playing' | 'finished';
}

export interface CreateRoomOptions {
  maxPlayers?: number;
  ruleVariant?: string;
}

export interface IdentityInfo {
  playerId: string;
  nickname: string;
  avatarSeed: string;
}

const MOCK_FLAG = (import.meta.env.VITE_USE_MOCK_API ?? '').toString() === '1';
const STORAGE_ROOMS = 'icgame-mock-rooms';
const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function randomCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

function loadMockRooms(): Record<string, RoomState> {
  try {
    const raw = localStorage.getItem(STORAGE_ROOMS);
    return raw ? (JSON.parse(raw) as Record<string, RoomState>) : {};
  } catch {
    return {};
  }
}

function saveMockRooms(rooms: Record<string, RoomState>): void {
  localStorage.setItem(STORAGE_ROOMS, JSON.stringify(rooms));
}

// ---------- Mock 实现 ----------

const mockRoomApi = {
  async createRoom(owner: IdentityInfo, opts: CreateRoomOptions = {}): Promise<CreateRoomResponse> {
    const rooms = loadMockRooms();
    let code = randomCode();
    while (rooms[code]) code = randomCode();
    const id = `mock-${Date.now()}`;
    const room: RoomState = {
      id,
      code,
      ownerPlayerId: owner.playerId,
      maxPlayers: opts.maxPlayers ?? 6,
      ruleVariant: opts.ruleVariant ?? 'classic',
      status: 'waiting',
      players: [
        {
          playerId: owner.playerId,
          nickname: owner.nickname,
          avatarSeed: owner.avatarSeed,
          seat: 0,
          isBot: false,
          joinedAt: Date.now(),
        },
      ],
    };
    rooms[code] = room;
    saveMockRooms(rooms);
    logger.flow('room', 'mock createRoom', { code, owner: owner.playerId });
    return {
      id,
      code,
      ownerPlayerId: owner.playerId,
      maxPlayers: room.maxPlayers,
      currentPlayers: 1,
      status: 'waiting',
    };
  },

  async joinRoom(code: string, me: IdentityInfo): Promise<RoomState> {
    const rooms = loadMockRooms();
    const room = rooms[code.toUpperCase()];
    if (!room) throw new ApiRequestError(404, 'NOT_FOUND', '房间不存在或已过期');
    if (room.status !== 'waiting') throw new ApiRequestError(409, 'ROOM_STARTED', '游戏已开始');
    if (!room.players.some((p) => p.playerId === me.playerId)) {
      if (room.players.length >= room.maxPlayers)
        throw new ApiRequestError(409, 'ROOM_FULL', '房间已满');
      room.players.push({
        playerId: me.playerId,
        nickname: me.nickname,
        avatarSeed: me.avatarSeed,
        seat: room.players.length,
        isBot: false,
        joinedAt: Date.now(),
      });
      rooms[room.code] = room;
      saveMockRooms(rooms);
    }
    return room;
  },

  async fillAI(code: string): Promise<RoomState> {
    const rooms = loadMockRooms();
    const room = rooms[code.toUpperCase()];
    if (!room) throw new ApiRequestError(404, 'NOT_FOUND', '房间不存在');
    const slots = room.maxPlayers - room.players.length;
    for (let i = 0; i < slots; i++) {
      room.players.push({
        playerId: `bot-${Math.random().toString(36).slice(2, 10)}`,
        nickname: `AI Lv.1-${room.players.length + 1}`,
        avatarSeed: Math.floor(Math.random() * 100000).toString(),
        seat: room.players.length,
        isBot: true,
        joinedAt: Date.now(),
      });
    }
    rooms[room.code] = room;
    saveMockRooms(rooms);
    logger.flow('room', 'mock fillAI', { code, filled: slots });
    return room;
  },

  async startGame(code: string): Promise<{ matchId: string }> {
    const rooms = loadMockRooms();
    const room = rooms[code.toUpperCase()];
    if (!room) throw new ApiRequestError(404, 'NOT_FOUND', '房间不存在');
    if (room.players.length < 3) throw new ApiRequestError(409, 'CONFLICT', '至少需要 3 名玩家');
    room.status = 'playing';
    saveMockRooms(rooms);
    logger.flow('room', 'mock startGame', { code, players: room.players.length });
    return { matchId: room.id };
  },

  async leaveRoom(code: string, playerId: string): Promise<void> {
    const rooms = loadMockRooms();
    const room = rooms[code.toUpperCase()];
    if (!room) return;
    const idx = room.players.findIndex((p) => p.playerId === playerId);
    if (idx >= 0) room.players.splice(idx, 1);
    if (room.players.length === 0) delete rooms[room.code];
    else rooms[room.code] = room;
    saveMockRooms(rooms);
  },
};

// ---------- 真实 API ----------

const realRoomApi = {
  async createRoom(_owner: IdentityInfo, opts: CreateRoomOptions): Promise<CreateRoomResponse> {
    return api.post<CreateRoomResponse>('/rooms', opts);
  },
  async joinRoom(code: string): Promise<RoomState> {
    const res = await api.post<{ room: RoomState }>(`/rooms/${code}/join`);
    return res.room;
  },
  async fillAI(code: string): Promise<RoomState> {
    const res = await api.post<{ room: RoomState }>(`/rooms/${code}/fill-ai`);
    return res.room;
  },
  async startGame(code: string): Promise<{ matchId: string }> {
    return api.post<{ matchId: string }>(`/rooms/${code}/start`);
  },
  async leaveRoom(code: string): Promise<void> {
    await api.post(`/rooms/${code}/leave`);
  },
};

// ---------- 统一导出：带后端自动退化 ----------

let fallbackToMock = MOCK_FLAG;

function isNetworkOrServerDown(err: unknown): boolean {
  if (err instanceof ApiRequestError) {
    // 401/403/404/409 是业务错，不降级
    return err.status >= 500 || err.status === 0;
  }
  // TypeError: Failed to fetch → 网络不通，降级
  return true;
}

async function withFallback<T>(real: () => Promise<T>, mock: () => Promise<T>): Promise<T> {
  if (fallbackToMock) return mock();
  try {
    return await real();
  } catch (err) {
    if (isNetworkOrServerDown(err)) {
      // 后端不可达 → 一次性切到 mock 模式（后续调用全走 localStorage）
      logger.warn('room', 'backend unavailable, fallback to mock');
      fallbackToMock = true;
      return mock();
    }
    logger.error('room', 'api error', err);
    throw err;
  }
}

export const roomApi = {
  createRoom: (owner: IdentityInfo, opts: CreateRoomOptions = {}) =>
    withFallback(
      () => realRoomApi.createRoom(owner, opts),
      () => mockRoomApi.createRoom(owner, opts),
    ),
  joinRoom: (code: string, me: IdentityInfo) =>
    withFallback(
      () => realRoomApi.joinRoom(code),
      () => mockRoomApi.joinRoom(code, me),
    ),
  fillAI: (code: string) =>
    withFallback(
      () => realRoomApi.fillAI(code),
      () => mockRoomApi.fillAI(code),
    ),
  startGame: (code: string) =>
    withFallback(
      () => realRoomApi.startGame(code),
      () => mockRoomApi.startGame(code),
    ),
  leaveRoom: (code: string, playerId: string) =>
    withFallback(
      () => realRoomApi.leaveRoom(code),
      () => mockRoomApi.leaveRoom(code, playerId),
    ),
};

export function isMockMode(): boolean {
  return fallbackToMock;
}
