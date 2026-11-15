import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import { AppError } from '../infra/errors.js';
import { logger } from '../infra/logger.js';
import { RedisKeys } from '../infra/redisKeys.js';
import type { MatchService } from '../match/MatchService.js';
import type { BanChecker } from './BanChecker.js';
import type { DeviceFingerprintService } from './DeviceFingerprintService.js';
import type { LobbyPrisma } from './LobbyService.js';
import {
  computeReputationLevel,
  type ReputationRecord,
  type ReputationService,
} from './ReputationService.js';

const TICKET_TTL = 60;
const ASSIGNMENT_TTL = 86_400;
const NOVICE_MATCHES = 3;
const LINKED_BAN_SCORE_CAP = 30;

type MatchmakingStatus =
  | { status: 'idle' }
  | { status: 'queued' | 'matching'; playerCount: number; ticketId: number; lowReputation?: true }
  | { status: 'matched'; matchId: string };

interface Ticket {
  queue: string;
  playerCount: number;
  order: number;
  matchId?: string;
  queuedUntil?: number;
}

function queueKey(
  playerCount: number,
  { level, score, completedMatches }: ReputationRecord,
  linkedToBan: boolean,
): string {
  const effectiveLevel = linkedToBan
    ? computeReputationLevel(Math.min(score, LINKED_BAN_SCORE_CAP), completedMatches)
    : level;
  const pool = completedMatches < NOVICE_MATCHES ? 'novice' : effectiveLevel;
  return `${playerCount}:classic:${pool}`;
}

// 同一账号的票据跨队列唯一；用自增序号保持同一毫秒入队时的先后顺序。
const ENQUEUE = `
local key = KEYS[1] .. ':ticket:' .. ARGV[1]
local current = redis.call('GET', key)
if current then return current end
local order = redis.call('INCR', KEYS[1] .. ':order')
local ticket = cjson.encode({queue = ARGV[2], playerCount = tonumber(ARGV[3]), order = order})
local queue = KEYS[1] .. ':queue:' .. ARGV[2]
redis.call('SET', key, ticket, 'EX', ARGV[4])
redis.call('ZADD', queue, order, ARGV[1])
redis.call('EXPIRE', queue, ARGV[4])
return ticket
`;

// 续期、迁移和取消检查当前票据，避免过时请求影响同一账号的新票据。
const UPDATE_TICKET = `
local key = KEYS[1] .. ':ticket:' .. ARGV[1]
local current = redis.call('GET', key)
if not current then return false end
local ticket = cjson.decode(current)
local queue = KEYS[1] .. ':queue:' .. ticket.queue
if ARGV[2] == 'refresh' and not ticket.matchId then
  redis.call('EXPIRE', key, ARGV[3])
  redis.call('EXPIRE', queue, ARGV[3])
elseif ARGV[2] == 'move' and not ticket.matchId and ticket.order == tonumber(ARGV[3])
  and ticket.queue == ARGV[5] and ticket.queue ~= ARGV[6] then
  redis.call('ZREM', queue, ARGV[1])
  ticket.queue = ARGV[6]
  local destination = KEYS[1] .. ':queue:' .. ticket.queue
  current = cjson.encode(ticket)
  redis.call('SET', key, current, 'EX', ARGV[4])
  redis.call('ZADD', destination, ticket.order, ARGV[1])
  redis.call('EXPIRE', destination, ARGV[4])
elseif ARGV[2] == 'cancel' and not ticket.matchId
  and (ARGV[3] == '' or ticket.order == tonumber(ARGV[3])) then
  redis.call('ZREM', queue, ARGV[1])
  redis.call('DEL', key)
  return false
elseif ARGV[2] == 'clear' and ticket.matchId == ARGV[3] then
  redis.call('DEL', key)
  return false
elseif ARGV[2] == 'restore' and ticket.matchId == ARGV[3] then
  local remaining = (ticket.queuedUntil or 0) - tonumber(redis.call('TIME')[1])
  if remaining <= 0 then
    redis.call('DEL', key)
    return false
  end
  ticket.matchId = nil
  ticket.queuedUntil = nil
  current = cjson.encode(ticket)
  redis.call('SET', key, current, 'EX', remaining)
  redis.call('ZADD', queue, ticket.order, ARGV[1])
  redis.call('EXPIRE', queue, ARGV[4])
end
return current
`;

// 清掉失效队员，原子转移一整桌。任何一个入队或轮询请求都可以触发配桌。
const CLAIM = `
local tickets = KEYS[1] .. ':ticket:'
local queue = KEYS[1] .. ':queue:' .. ARGV[2]
if not redis.call('ZSCORE', queue, ARGV[1]) then return {} end
local count = tonumber(ARGV[3])
local players = {}
local claimed = {}
for _, id in ipairs(redis.call('ZRANGE', queue, 0, count * 4 - 1)) do
  local raw = redis.call('GET', tickets .. id)
  local ticket = raw and cjson.decode(raw)
  if not ticket or ticket.matchId or ticket.queue ~= ARGV[2] then
    redis.call('ZREM', queue, id)
  else
    players[#players + 1] = id
    claimed[#claimed + 1] = ticket
    if #players == count then break end
  end
end
if #players < count then return {} end
local now = tonumber(redis.call('TIME')[1])
for i, id in ipairs(players) do
  local ticket = claimed[i]
  ticket.queuedUntil = now + redis.call('TTL', tickets .. id)
  ticket.matchId = ARGV[4]
  redis.call('SET', tickets .. id, cjson.encode(ticket), 'EX', ARGV[5])
end
redis.call('ZREM', queue, unpack(players))
return players
`;

// 按原顺序将有效票据放入各自当前的分池。
const REQUEUE = `
local destinations = cjson.decode(ARGV[3])
for _, id in ipairs(cjson.decode(ARGV[4])) do
  local key = KEYS[1] .. ':ticket:' .. id
  local raw = redis.call('GET', key)
  if raw then
    local ticket = cjson.decode(raw)
    if ticket.matchId == ARGV[1] then
      if destinations[id] then
        ticket.queue = destinations[id]
        local queue = KEYS[1] .. ':queue:' .. ticket.queue
        ticket.matchId = nil
        ticket.queuedUntil = nil
        redis.call('SET', key, cjson.encode(ticket), 'EX', ARGV[2])
        redis.call('ZADD', queue, ticket.order, id)
        redis.call('EXPIRE', queue, ARGV[2])
      else
        redis.call('DEL', key)
      end
    end
  end
end
`;

export class MatchmakingService {
  // 对局由当前实时进程执行，启动时先恢复快照，再接受配桌查询。
  private readonly forming = new Set<string>();

  constructor(
    private readonly deps: {
      redis: Pick<Redis, 'eval'>;
      reputation: Pick<ReputationService, 'getMany'>;
      fingerprints?: Pick<DeviceFingerprintService, 'linkedToActiveBans'>;
      prisma: LobbyPrisma;
      bans: Pick<BanChecker, 'isBanned'>;
      matches: Pick<
        MatchService,
        | 'createMatchedMatch'
        | 'get'
        | 'matchSettlement'
        | 'seatOf'
        | 'leaveMatch'
        | 'discardMatch'
        | 'isPlayerInActiveMatch'
      >;
    },
  ) {}

  async enqueue(playerId: string, playerCount: number): Promise<MatchmakingStatus> {
    const current = await this.updateTicket(playerId, 'refresh');
    if (current) {
      const status = await this.advance(playerId, current, true);
      if (status.status !== 'idle') return status;
    }
    if (this.deps.matches.isPlayerInActiveMatch(playerId)) {
      throw new AppError('CONFLICT', '你还有一场进行中的对局');
    }
    const queue = await this.queueFor(playerId, playerCount);
    const raw = await this.run(ENQUEUE, playerId, queue, playerCount, TICKET_TTL);
    return this.advance(playerId, JSON.parse(raw as string) as Ticket, true);
  }

  async poll(playerId: string): Promise<MatchmakingStatus> {
    const ticket = await this.updateTicket(playerId, 'refresh');
    return ticket ? this.advance(playerId, ticket) : { status: 'idle' };
  }

  async cancel(playerId: string, ticketId?: number): Promise<MatchmakingStatus> {
    const ticket = await this.updateTicket(playerId, 'cancel', ticketId ?? '');
    let status = await this.toStatus(playerId, ticket);
    // 进程重启后恢复的预约可能在本次取消期间刚回到队列。
    if (ticket?.matchId && status.status === 'queued') {
      status = await this.toStatus(
        playerId,
        await this.updateTicket(playerId, 'cancel', ticketId ?? ''),
      );
    }
    return status;
  }

  async switchToRoom(playerId: string): Promise<void> {
    const ticket = await this.cancel(playerId);
    if (ticket.status !== 'idle') {
      throw new AppError('CONFLICT', '快速匹配已配桌，请先返回匹配对局');
    }
  }

  async leave(matchId: string, playerId: string): Promise<void> {
    const room = this.deps.matches.get(matchId);
    if (room?.mode !== 'matchmaking' || !room.seats().some((seat) => seat.playerId === playerId)) {
      throw new AppError('FORBIDDEN', '你不在这场匹配对局中');
    }
    if (room.current().ctx.gameover !== undefined) return;
    await this.deps.matches.leaveMatch(matchId, playerId);
    if (this.deps.matches.seatOf(matchId, playerId) === null) {
      await this.updateTicket(playerId, 'clear', matchId);
    }
  }

  private async advance(
    playerId: string,
    ticket: Ticket,
    joining = false,
  ): Promise<MatchmakingStatus> {
    if (ticket.matchId) {
      const status = await this.toStatus(playerId, ticket, joining);
      if (status.status !== 'queued') return status;
      const restored = await this.updateTicket(playerId, 'refresh');
      if (!restored || restored.matchId) return this.toStatus(playerId, restored);
      ticket = restored;
    }
    const queue = await this.queueFor(playerId, ticket.playerCount);
    if (ticket.queue !== queue) {
      const raw = await this.run(
        UPDATE_TICKET,
        playerId,
        'move',
        ticket.order,
        TICKET_TTL,
        ticket.queue,
        queue,
      );
      if (!raw) return { status: 'idle' };
      ticket = JSON.parse(raw as string) as Ticket;
      if (ticket.matchId) return this.toStatus(playerId, ticket);
    }
    await this.tryMatch(playerId, ticket);
    return this.toStatus(playerId, await this.updateTicket(playerId, 'refresh'));
  }

  private async queueFor(playerId: string, playerCount: number): Promise<string> {
    return (await this.queuesFor(playerCount, [playerId]))[playerId]!;
  }

  private async queuesFor(
    playerCount: number,
    playerIds: readonly string[],
  ): Promise<Record<string, string>> {
    const [reputations, linked] = await Promise.all([
      this.deps.reputation.getMany(playerIds),
      this.deps.fingerprints?.linkedToActiveBans(playerIds).catch(() => {
        logger.warn('device fingerprint association lookup failed');
        return undefined;
      }),
    ]);
    return Object.fromEntries(
      reputations.map((record) => [
        record.playerId,
        queueKey(playerCount, record, linked?.has(record.playerId) ?? false),
      ]),
    );
  }

  private async tryMatch(playerId: string, ticket: Ticket): Promise<void> {
    const id = randomUUID();
    this.forming.add(id);
    try {
      const players = (await this.run(
        CLAIM,
        playerId,
        ticket.queue,
        ticket.playerCount,
        id,
        ASSIGNMENT_TTL,
      )) as string[];
      if (!players.length) return;

      let destinations = Object.fromEntries(players.map((id) => [id, ticket.queue]));
      let creating = false;
      let started = false;
      try {
        const profiles = await Promise.all(
          players.map(async (id, seat) => {
            const [profile, banned] = await Promise.all([
              this.deps.prisma.player.findUnique({ where: { id } }),
              this.deps.bans.isBanned(id),
            ]);
            if (!profile || banned) return null;
            return {
              playerId: id,
              nickname: profile.nickname,
              avatarSeed: profile.avatarSeed,
              seat,
              isBot: false,
              joinedAt: Date.now(),
            };
          }),
        );
        // 账号检查后，批量复核整桌候选人的分池。
        const candidates = profiles.filter((profile) => profile !== null);
        destinations = await this.queuesFor(
          ticket.playerCount,
          candidates.map(({ playerId }) => playerId),
        );
        const verified = candidates.filter(({ playerId }) => {
          if (!this.deps.matches.isPlayerInActiveMatch(playerId)) return true;
          delete destinations[playerId];
          return false;
        });
        if (
          verified.length === players.length &&
          verified.every(({ playerId }) => destinations[playerId] === ticket.queue)
        ) {
          creating = true;
          await this.deps.matches.createMatchedMatch(id, verified);
          started = true;
        }
      } finally {
        if (!started) {
          if (creating) await this.deps.matches.discardMatch(id);
          await this.run(
            REQUEUE,
            id,
            TICKET_TTL,
            JSON.stringify(destinations),
            JSON.stringify(players),
          );
        }
      }
    } finally {
      this.forming.delete(id);
    }
  }

  private async toStatus(
    playerId: string,
    ticket: Ticket | null,
    joining = false,
  ): Promise<MatchmakingStatus> {
    if (!ticket) return { status: 'idle' };
    const { matchId, playerCount, order, queue } = ticket;
    const details = {
      playerCount,
      ticketId: order,
      ...(queue.endsWith(':low') && { lowReputation: true as const }),
    };
    if (!matchId) return { status: 'queued', ...details };
    if (this.forming.has(matchId)) {
      return { status: 'matching', ...details };
    }
    const match = this.deps.matches.get(matchId);
    if (
      match &&
      match.current().ctx.gameover === undefined &&
      this.deps.matches.seatOf(matchId, playerId) !== null
    ) {
      return { status: 'matched', matchId };
    }
    const settlement = await this.deps.matches.matchSettlement(matchId);
    if (settlement === 'pending') {
      // 成绩和信誉一起入库后，玩家才能用最新的完成局数重新排队。
      if (joining) throw new AppError('CONFLICT', '上一场匹配正在结算，请稍后再试');
      return { status: 'idle' };
    }
    if (!match && settlement === null && ticket.queuedUntil !== undefined) {
      const recovered = await this.updateTicket(playerId, 'restore', matchId);
      return recovered ? this.toStatus(playerId, recovered, joining) : { status: 'idle' };
    }
    const latest = await this.updateTicket(playerId, 'clear', matchId);
    return latest ? this.toStatus(playerId, latest, joining) : { status: 'idle' };
  }

  private async updateTicket(
    playerId: string,
    action: 'refresh' | 'cancel' | 'clear' | 'restore',
    value: number | string = TICKET_TTL,
  ): Promise<Ticket | null> {
    const raw = await this.run(UPDATE_TICKET, playerId, action, value, TICKET_TTL);
    return raw ? (JSON.parse(raw as string) as Ticket) : null;
  }

  private run(script: string, ...args: Array<string | number>): Promise<unknown> {
    return this.deps.redis.eval(script, 1, RedisKeys.matchmaking(), ...args);
  }
}
