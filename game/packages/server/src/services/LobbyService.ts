// 大厅服务：房间创建/加入/踢人/开始（参照设计文档 §7.3.2.3）

import crypto from 'crypto';
import { Redis } from 'ioredis';
import { createRedisClient } from '../infra/redis.js';
import { RedisKeys, RedisTTL } from '../infra/redisKeys.js';
import { prisma } from '../infra/postgres.js';
import { AppError } from '../infra/errors.js';
import { logger } from '../infra/logger.js';

// 避开 0/O/1/I 的可用字符集
const ROOM_CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const ROOM_CODE_LENGTH = 6;

export interface RoomState {
  id: string;
  code: string;
  ownerPlayerId: string;
  maxPlayers: number;
  ruleVariant: string;
  exCardsEnabled: boolean;
  expansionEnabled: boolean;
  status: 'waiting' | 'playing' | 'finished';
  players: RoomPlayer[];
  createdAt: number;
  expiresAt: number;
}

export interface RoomPlayer {
  playerId: string;
  nickname: string;
  avatarSeed: string;
  seat: number;
  isBot: boolean;
  joinedAt: number;
}

export class LobbyService {
  private redis: Redis;

  constructor() {
    this.redis = createRedisClient();
  }

  private generateRoomCode(): string {
    let code = '';
    const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
    for (const b of bytes) {
      code += ROOM_CODE_CHARS[b % ROOM_CODE_CHARS.length];
    }
    return code;
  }

  async createRoom(
    ownerId: string,
    options: {
      maxPlayers?: number;
      ruleVariant?: string;
      exCardsEnabled?: boolean;
      expansionEnabled?: boolean;
    } = {},
  ): Promise<RoomState> {
    const code = await this.generateUniqueCode();
    const now = Date.now();
    const id = crypto.randomUUID();

    const owner = await prisma.player.findUnique({ where: { id: ownerId } });
    if (!owner) throw new AppError('NOT_FOUND', 'Player not found');

    const room: RoomState = {
      id,
      code,
      ownerPlayerId: ownerId,
      maxPlayers: options.maxPlayers ?? 6,
      ruleVariant: options.ruleVariant ?? 'classic',
      exCardsEnabled: options.exCardsEnabled ?? false,
      expansionEnabled: options.expansionEnabled ?? false,
      status: 'waiting',
      players: [
        {
          playerId: ownerId,
          nickname: owner.nickname,
          avatarSeed: owner.avatarSeed,
          seat: 0,
          isBot: false,
          joinedAt: now,
        },
      ],
      createdAt: now,
      expiresAt: now + RedisTTL.ROOM_TTL * 1000,
    };

    await this.redis.setex(RedisKeys.roomState(code), RedisTTL.ROOM_TTL, JSON.stringify(room));

    logger.info({ roomId: id, code, ownerId }, 'Room created');
    return room;
  }

  async joinRoom(code: string, playerId: string): Promise<RoomState> {
    const room = await this.getRoom(code);
    if (!room) throw new AppError('NOT_FOUND', '房间不存在或已过期');
    if (room.status !== 'waiting') throw new AppError('ROOM_STARTED', '游戏已开始');
    if (room.players.length >= room.maxPlayers) throw new AppError('ROOM_FULL', '房间已满');

    // 已在房间则直接返回
    if (room.players.some((p) => p.playerId === playerId)) {
      return room;
    }

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new AppError('NOT_FOUND', 'Player not found');

    const seat = this.nextAvailableSeat(room);
    room.players.push({
      playerId,
      nickname: player.nickname,
      avatarSeed: player.avatarSeed,
      seat,
      isBot: false,
      joinedAt: Date.now(),
    });

    await this.saveRoom(room);
    logger.info({ roomId: room.id, playerId, seat }, 'Player joined room');
    return room;
  }

  async leaveRoom(code: string, playerId: string): Promise<void> {
    const room = await this.getRoom(code);
    if (!room) throw new AppError('NOT_FOUND', '房间不存在或已过期');

    const idx = room.players.findIndex((p) => p.playerId === playerId);
    if (idx === -1) return;

    room.players.splice(idx, 1);

    if (room.players.length === 0) {
      await this.redis.del(RedisKeys.roomState(code));
      logger.info({ roomId: room.id }, 'Room deleted (empty)');
      return;
    }

    // 房主离开则转让
    if (room.ownerPlayerId === playerId && room.players[0]) {
      room.ownerPlayerId = room.players[0].playerId;
    }

    await this.saveRoom(room);
    logger.info({ roomId: room.id, playerId }, 'Player left room');
  }

  async kickPlayer(code: string, requesterId: string, targetId: string): Promise<RoomState> {
    const room = await this.getRoom(code);
    if (!room) throw new AppError('NOT_FOUND', '房间不存在或已过期');
    if (room.ownerPlayerId !== requesterId) throw new AppError('FORBIDDEN', '只有房主才能踢人');

    const idx = room.players.findIndex((p) => p.playerId === targetId);
    if (idx === -1) throw new AppError('NOT_FOUND', '目标玩家不在房间内');

    room.players.splice(idx, 1);
    await this.saveRoom(room);
    return room;
  }

  async startGame(code: string, requesterId: string): Promise<string> {
    const room = await this.getRoom(code);
    if (!room) throw new AppError('NOT_FOUND', '房间不存在或已过期');
    if (room.ownerPlayerId !== requesterId) throw new AppError('FORBIDDEN', '只有房主才能开始');
    if (room.players.length < 3) throw new AppError('CONFLICT', '至少需要 3 名玩家');
    if (room.status !== 'waiting') throw new AppError('ROOM_STARTED', '游戏已开始');

    room.status = 'playing';
    await this.saveRoom(room);

    // 创建 Match 记录
    const match = await prisma.match.create({
      data: {
        id: room.id,
        roomId: room.id,
        ruleVariant: room.ruleVariant,
        exEnabled: room.exCardsEnabled,
        expansionEnabled: room.expansionEnabled,
        playerCount: room.players.length,
      },
    });

    logger.info({ roomId: room.id, matchId: match.id }, 'Game started');
    return match.id;
  }

  async getRoom(code: string): Promise<RoomState | null> {
    const raw = await this.redis.get(RedisKeys.roomState(code));
    if (!raw) return null;
    return JSON.parse(raw) as RoomState;
  }

  async fillAI(code: string, requesterId: string, count?: number): Promise<RoomState> {
    const room = await this.getRoom(code);
    if (!room) throw new AppError('NOT_FOUND', '房间不存在');
    if (room.ownerPlayerId !== requesterId) throw new AppError('FORBIDDEN', '只有房主才能添加 AI');
    if (room.status !== 'waiting') throw new AppError('ROOM_STARTED', '游戏已开始');

    const slots = count ?? room.maxPlayers - room.players.length;
    const actual = Math.min(slots, room.maxPlayers - room.players.length);

    for (let i = 0; i < actual; i++) {
      const seat = this.nextAvailableSeat(room);
      room.players.push({
        playerId: `bot-${crypto.randomUUID().slice(0, 8)}`,
        nickname: `AI Lv.1-${i + 1}`,
        avatarSeed: crypto.randomInt(1, 100000).toString(),
        seat,
        isBot: true,
        joinedAt: Date.now(),
      });
    }

    await this.saveRoom(room);
    return room;
  }

  private async generateUniqueCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = this.generateRoomCode();
      const exists = await this.redis.exists(RedisKeys.roomState(code));
      if (!exists) return code;
    }
    throw new AppError('INTERNAL_ERROR', '无法生成唯一房间码');
  }

  private nextAvailableSeat(room: RoomState): number {
    const taken = new Set(room.players.map((p) => p.seat));
    for (let s = 0; s < room.maxPlayers; s++) {
      if (!taken.has(s)) return s;
    }
    return room.players.length;
  }

  private async saveRoom(room: RoomState): Promise<void> {
    await this.redis.setex(RedisKeys.roomState(room.code), RedisTTL.ROOM_TTL, JSON.stringify(room));
  }
}
