// 大厅服务：房间创建/加入/踢人/开始
//
// 开始游戏时由对局服务建立权威对局，成功后房间才进入 playing；
// 开始锁保证同一房间并发两次开始只会建一局。

import crypto from 'crypto';
import { generateBatch } from '@icgame/shared';
import { createRedisClient } from '../infra/redis.js';
import { RedisKeys, RedisTTL } from '../infra/redisKeys.js';
import { prisma as defaultPrisma } from '../infra/postgres.js';
import { AppError } from '../infra/errors.js';
import { logger } from '../infra/logger.js';
import { decodeCursor, encodeCursor, type PageResult } from '../infra/pagination.js';
import type { MatchService } from '../match/MatchService.js';
import type { RoomMatchResult } from '../match/MatchArchive.js';

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
  isPublic?: boolean;
  status: 'waiting' | 'playing' | 'finished';
  /** 开始游戏后写入：权威对局的编号 */
  matchId?: string;
  seriesLength?: number;
  series?: RoomSeries;
  players: RoomPlayer[];
  createdAt: number;
  expiresAt: number;
}

interface RoomSeries {
  played: number;
  limit: number | null;
  scores: RoomMatchResult['scores'];
}

export interface RoomPlayer {
  playerId: string;
  nickname: string;
  avatarSeed: string;
  seat: number;
  isBot: boolean;
  joinedAt: number;
}

/** 开始锁的有效期（秒）：覆盖一次建局的耗时，进程崩溃后自动释放 */
const START_LOCK_SECONDS = 10;
/** 房间可开始游戏的最少人数 */
const MIN_START_PLAYERS = 4;

/** LobbyService 实际用到的 Redis 命令 */
export interface LobbyRedis {
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<unknown>;
  set(key: string, value: string, ex: 'EX', seconds: number, nx: 'NX'): Promise<string | null>;
  del(key: string): Promise<unknown>;
  exists(key: string): Promise<number>;
  zadd?(key: string, score: number, member: string): Promise<number>;
  zrevrangebylex?(
    key: string,
    max: string,
    min: string,
    limit: 'LIMIT',
    offset: number,
    count: number,
  ): Promise<string[]>;
  zrem?(key: string, ...members: string[]): Promise<number>;
  eval?(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
}

interface PublicRoom {
  code: string;
  currentPlayers: number;
  maxPlayers: number;
}

const PUBLIC_ROOM_ENTRY = /^\d{13}:[A-Z0-9]{6}$/;

function publicRoomEntry(room: RoomState): string {
  return `${String(room.createdAt).padStart(13, '0')}:${room.code}`;
}

/** LobbyService 实际用到的 Prisma 查询 */
export interface LobbyPrisma {
  player: {
    findUnique(args: {
      where: { id: string };
    }): Promise<{ nickname: string; avatarSeed: string } | null>;
  };
}

export interface LobbyDeps {
  redis?: LobbyRedis;
  prisma?: LobbyPrisma;
  matches?: Pick<
    MatchService,
    'createFromRoom' | 'discardMatch' | 'isRunning' | 'stopMatch' | 'leaveMatch'
  >;
  /** 房间内容变了（成员增减、补 Bot、开始游戏）并已保存之后调用；它抛错不影响请求 */
  onRoomChange?: (room: RoomState) => void;
  roomResults?: (roomId: string) => Promise<RoomMatchResult[]>;
}

/** 房间推送给成员的内容：只含房间本身的公开信息，没有任何对局内的隐藏信息 */
export interface RoomPayload {
  id: string;
  code: string;
  ownerPlayerId: string;
  maxPlayers: number;
  ruleVariant: string;
  status: RoomState['status'];
  matchId?: string;
  series?: RoomSeries;
  players: RoomPlayer[];
}

/** 房间状态 → 推送内容 */
export function toRoomPayload(room: RoomState): RoomPayload {
  return {
    id: room.id,
    code: room.code,
    ownerPlayerId: room.ownerPlayerId,
    maxPlayers: room.maxPlayers,
    ruleVariant: room.ruleVariant,
    status: room.status,
    ...(room.matchId !== undefined ? { matchId: room.matchId } : {}),
    ...(room.series !== undefined ? { series: room.series } : {}),
    players: room.players.map((p) => ({
      playerId: p.playerId,
      nickname: p.nickname,
      avatarSeed: p.avatarSeed,
      seat: p.seat,
      isBot: p.isBot,
      joinedAt: p.joinedAt,
    })),
  };
}

export class LobbyService {
  private readonly redis: LobbyRedis;
  private readonly prisma: LobbyPrisma;
  private readonly matches:
    | Pick<
        MatchService,
        'createFromRoom' | 'discardMatch' | 'isRunning' | 'stopMatch' | 'leaveMatch'
      >
    | undefined;
  private readonly onRoomChange: ((room: RoomState) => void) | undefined;
  private readonly roomResults: LobbyDeps['roomResults'];

  constructor(deps: LobbyDeps = {}) {
    this.redis = deps.redis ?? createRedisClient();
    this.prisma = deps.prisma ?? defaultPrisma;
    this.matches = deps.matches;
    this.onRoomChange = deps.onRoomChange;
    this.roomResults = deps.roomResults;
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
      isPublic?: boolean;
      seriesLength?: number;
    } = {},
  ): Promise<RoomState> {
    const code = await this.generateUniqueCode();
    const now = Date.now();
    const id = crypto.randomUUID();

    const owner = await this.prisma.player.findUnique({ where: { id: ownerId } });
    if (!owner) throw new AppError('NOT_FOUND', 'Player not found');

    const room: RoomState = {
      id,
      code,
      ownerPlayerId: ownerId,
      maxPlayers: options.maxPlayers ?? 6,
      ruleVariant: options.ruleVariant ?? 'classic',
      exCardsEnabled: options.exCardsEnabled ?? false,
      expansionEnabled: options.expansionEnabled ?? false,
      ...(options.isPublic && { isPublic: true }),
      status: 'waiting',
      ...(options.seriesLength !== undefined && { seriesLength: options.seriesLength }),
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
    if (room.isPublic) {
      try {
        if (!this.redis.zadd) throw new Error('公开房间索引未就绪');
        await this.redis.zadd(RedisKeys.roomPublic(), 0, publicRoomEntry(room));
      } catch (err) {
        await this.redis.del(RedisKeys.roomState(code));
        throw err;
      }
    }

    logger.info({ roomId: id, code, ownerId }, 'Room created');
    return room;
  }

  async listPublicRooms({
    limit,
    cursor,
    maxPlayers,
  }: {
    limit: number;
    cursor?: string;
    maxPlayers?: number;
  }): Promise<PageResult<PublicRoom>> {
    const entry = cursor === undefined ? '' : decodeCursor(cursor).entry;
    if (cursor !== undefined && (typeof entry !== 'string' || !PUBLIC_ROOM_ENTRY.test(entry))) {
      throw new AppError('VALIDATION_ERROR', 'invalid cursor');
    }
    if (!this.redis.zrevrangebylex || !this.redis.zrem) {
      throw new AppError('INTERNAL_ERROR', '公开房间索引未就绪');
    }
    const key = RedisKeys.roomPublic();
    const page: { entry: string; room: PublicRoom }[] = [];
    let upper = cursor === undefined ? '+' : `(${entry}`;
    const batchSize = Math.max(20, limit + 1);
    while (page.length <= limit) {
      const entries = await this.redis.zrevrangebylex(key, upper, '-', 'LIMIT', 0, batchSize);
      if (entries.length === 0) break;
      const rooms = await Promise.all(entries.map((item) => this.getRoom(item.slice(-6))));
      const stale: string[] = [];
      for (const [i, item] of entries.entries()) {
        const room = rooms[i];
        if (!room?.isPublic || room.status !== 'waiting' || publicRoomEntry(room) !== item) {
          stale.push(item);
        } else if (
          page.length <= limit &&
          room.players.length < room.maxPlayers &&
          (maxPlayers === undefined || room.maxPlayers === maxPlayers)
        ) {
          page.push({
            entry: item,
            room: {
              code: room.code,
              currentPlayers: room.players.length,
              maxPlayers: room.maxPlayers,
            },
          });
        }
      }
      if (stale.length) await this.redis.zrem(key, ...stale);
      if (entries.length < batchSize) break;
      upper = `(${entries.at(-1)!}`;
    }
    const hasMore = page.length > limit;
    if (hasMore) page.pop();
    return {
      data: page.map(({ room }) => room),
      nextCursor: hasMore ? encodeCursor({ entry: page.at(-1)!.entry }) : null,
      hasMore,
    };
  }

  joinRoom(code: string, playerId: string): Promise<RoomState> {
    return this.mutateRoom(code, async (room) => {
      // 已在房间则直接返回
      if (room.players.some((p) => p.playerId === playerId)) {
        return room;
      }
      if (room.status === 'playing') throw new AppError('ROOM_STARTED', '游戏已开始');
      if (room.players.length >= room.maxPlayers) throw new AppError('ROOM_FULL', '房间已满');

      const player = await this.prisma.player.findUnique({ where: { id: playerId } });
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
    });
  }

  leaveRoom(code: string, playerId: string): Promise<void> {
    return this.mutateRoom(code, async (room) => {
      const idx = room.players.findIndex((p) => p.playerId === playerId);
      if (idx === -1) return;

      if (room.status === 'playing') {
        if (room.ownerPlayerId === playerId) {
          throw new AppError('CONFLICT', '房主请使用结束本局');
        }
        if (!this.matches || !room.matchId) throw new AppError('INTERNAL_ERROR', '对局服务未就绪');
        await this.matches.leaveMatch(room.matchId, playerId);
      }
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
    });
  }

  endGame(code: string, requesterId: string): Promise<void> {
    return this.mutateRoom(
      code,
      async (room) => {
        if (room.ownerPlayerId !== requesterId)
          throw new AppError('FORBIDDEN', '只有房主才能结束本局');
        if (room.status === 'finished') return;
        if (room.status !== 'playing' || !room.matchId)
          throw new AppError('CONFLICT', '游戏尚未开始');
        if (!this.matches) throw new AppError('INTERNAL_ERROR', '对局服务未就绪');
        await this.matches.stopMatch(room.matchId);
        room.status = 'finished';
        await this.saveRoom(room);
        logger.info({ roomId: room.id, requesterId }, 'Room match ended');
      },
      false,
    );
  }

  kickPlayer(code: string, requesterId: string, targetId: string): Promise<RoomState> {
    return this.mutateRoom(
      code,
      async (room) => {
        if (room.ownerPlayerId !== requesterId) throw new AppError('FORBIDDEN', '只有房主才能踢人');

        const idx = room.players.findIndex((p) => p.playerId === targetId);
        if (idx === -1) throw new AppError('NOT_FOUND', '目标玩家不在房间内');

        room.players.splice(idx, 1);
        await this.saveRoom(room);
        return room;
      },
      false,
    );
  }

  async startGame(code: string, requesterId: string): Promise<string> {
    const room = await this.getRoomForDisplay(code);
    if (!room) throw new AppError('NOT_FOUND', '房间不存在或已过期');
    if (room.ownerPlayerId !== requesterId) throw new AppError('FORBIDDEN', '只有房主才能开始');
    if (room.players.length < MIN_START_PLAYERS) {
      throw new AppError('CONFLICT', `至少需要 ${MIN_START_PLAYERS} 名玩家`);
    }
    if (room.status === 'playing') throw new AppError('ROOM_STARTED', '游戏已开始');
    if (!this.matches) throw new AppError('INTERNAL_ERROR', '对局服务未就绪');

    const matches = this.matches;
    return this.withRoomLock(code, room.isPublic, '正在开始', async () => {
      const current = await this.getRoomForDisplay(code);
      if (!current || current.status === 'playing') {
        throw new AppError('ROOM_STARTED', '游戏已开始');
      }
      if (current.ownerPlayerId !== requesterId) {
        throw new AppError('FORBIDDEN', '只有房主才能开始');
      }
      if (current.players.length < MIN_START_PLAYERS) {
        throw new AppError('CONFLICT', `至少需要 ${MIN_START_PLAYERS} 名玩家`);
      }
      if (
        current.seriesLength !== undefined &&
        current.series &&
        current.series.played >= current.seriesLength
      ) {
        throw new AppError('CONFLICT', '系列赛已结束');
      }
      const nextID = current.matchId ? crypto.randomUUID() : current.id;
      // 首局仍可复用撤销后留下的编号；已经结束并入档的局始终保留。
      if (matches.isRunning(nextID)) {
        logger.warn({ roomId: room.id }, 'discarding leftover match before start');
        await matches.discardMatch(nextID);
      }
      const matchId = await matches.createFromRoom(current, nextID);
      current.status = 'playing';
      current.matchId = matchId;
      try {
        await this.saveRoom(current);
      } catch (err) {
        // 房间仍是 waiting，对局却已在运行；不撤销的话再点开始只会得到「已存在」
        await matches.discardMatch(matchId);
        throw err;
      }
      logger.info({ roomId: room.id, matchId }, 'Game started');
      return matchId;
    });
  }

  async getRoom(code: string): Promise<RoomState | null> {
    const raw = await this.redis.get(RedisKeys.roomState(code));
    if (!raw) return null;
    return JSON.parse(raw) as RoomState;
  }

  /** 从已落库结算投影房间状态，重试或重启都不会重复加分。 */
  async getRoomForDisplay(code: string): Promise<RoomState | null> {
    const room = await this.getRoom(code);
    if (!room) return null;
    if (!room.matchId && room.seriesLength === undefined) return room;
    const results = room.matchId ? ((await this.roomResults?.(room.id)) ?? []) : [];
    const totals = new Map<string, RoomMatchResult['scores'][number]>();
    let played = 0;
    for (const result of results) {
      if (result.id === room.matchId) room.status = 'finished';
      if (result.scored) played++;
      for (const score of result.scores) {
        const previous = totals.get(score.playerId)?.score ?? 0;
        totals.set(score.playerId, { ...score, score: previous + score.score });
      }
    }
    room.series = {
      played,
      limit: room.seriesLength ?? null,
      scores: [...totals.values()].sort((a, b) => b.score - a.score),
    };
    return room;
  }

  fillAI(code: string, requesterId: string, count?: number): Promise<RoomState> {
    return this.mutateRoom(code, async (room) => {
      if (room.ownerPlayerId !== requesterId)
        throw new AppError('FORBIDDEN', '只有房主才能添加 AI');
      if (room.status === 'playing') throw new AppError('ROOM_STARTED', '游戏已开始');

      const slots = count ?? room.maxPlayers - room.players.length;
      const actual = Math.min(slots, room.maxPlayers - room.players.length);

      // 开局前还不知道阵营，用中立名字池；房间里已有的昵称（含真人）不重复
      const names = generateBatch(Math.max(0, actual), {
        faction: 'neutral',
        initialExisting: new Set(room.players.map((p) => p.nickname)),
      });
      for (let i = 0; i < actual; i++) {
        const seat = this.nextAvailableSeat(room);
        room.players.push({
          playerId: `bot-${crypto.randomUUID().slice(0, 8)}`,
          nickname: names[i]!.nickname,
          avatarSeed: crypto.randomInt(1, 100000).toString(),
          seat,
          isBot: true,
          joinedAt: Date.now(),
        });
      }

      await this.saveRoom(room);
      return room;
    });
  }

  private async mutateRoom<T>(
    code: string,
    update: (room: RoomState) => Promise<T>,
    project = true,
  ): Promise<T> {
    const read = () => (project ? this.getRoomForDisplay(code) : this.getRoom(code));
    const room = await read();
    if (!room) throw new AppError('NOT_FOUND', '房间不存在或已过期');
    if (!room.isPublic) return update(room);
    return this.withRoomLock(code, true, '房间正在更新，请重试', async () => {
      const current = await read();
      if (!current) throw new AppError('NOT_FOUND', '房间不存在或已过期');
      return update(current);
    });
  }

  private async withRoomLock<T>(
    code: string,
    isPublic: boolean | undefined,
    busyMessage: string,
    update: () => Promise<T>,
  ): Promise<T> {
    const lockKey = RedisKeys.roomStarting(code);
    const token = isPublic ? crypto.randomUUID() : '1';
    const locked = await this.redis.set(lockKey, token, 'EX', START_LOCK_SECONDS, 'NX');
    if (locked !== 'OK') throw new AppError('CONFLICT', busyMessage);
    try {
      return await update();
    } finally {
      const unlock =
        isPublic && this.redis.eval
          ? this.redis.eval(
              "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end",
              1,
              lockKey,
              token,
            )
          : this.redis.del(lockKey);
      await unlock.catch((err) => logger.warn({ err, code }, 'room lock cleanup failed'));
    }
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
    try {
      this.onRoomChange?.(room);
    } catch (err) {
      logger.warn({ err, code: room.code }, 'room change listener failed');
    }
  }
}
