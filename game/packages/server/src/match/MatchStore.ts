// 对局快照存储：完整对局状态 + 座位表 + 建局参数
//
// 内存实现用于测试与无 Redis 的开发环境；Redis 实现用于正式运行。
// 写入带版本比较：只有库里的版本号等于调用方期望的版本号才写入，
// 用来发现「同一局有两个写入者」这类错误。

import type Redis from 'ioredis';
import type { SetupState } from '@icgame/game-engine/setup';
import type { MatchState } from '@icgame/game-engine/runner';
import { RedisKeys, RedisTTL } from '../infra/redisKeys.js';
import type { RoomSeat } from './MatchRoom.js';

export interface MatchSnapshot {
  matchID: string;
  roomCode: string;
  seats: RoomSeat[];
  /** 建局参数：重放与排查用，永不外发 */
  setup: { numPlayers: number; seed: string; setupData: Record<string, unknown> };
  state: MatchState<SetupState>;
  createdAt: number;
  updatedAt: number;
}

export interface MatchStore {
  /** 新建；已存在则抛错 */
  create(snapshot: MatchSnapshot): Promise<void>;
  /** 仅当库里的版本号等于 expectedStateID 时写入 */
  save(
    matchID: string,
    state: MatchState<SetupState>,
    expectedStateID: number,
    now: number,
  ): Promise<'ok' | 'conflict'>;
  load(matchID: string): Promise<MatchSnapshot | null>;
  listActive(): Promise<string[]>;
  /** 对局结束：移出活跃集合，快照保留一段时间 */
  finish(matchID: string): Promise<void>;
}

export class InMemoryMatchStore implements MatchStore {
  private readonly snapshots = new Map<string, MatchSnapshot>();
  private readonly active = new Set<string>();

  async create(snapshot: MatchSnapshot): Promise<void> {
    if (this.snapshots.has(snapshot.matchID)) {
      throw new Error(`对局快照已存在：${snapshot.matchID}`);
    }
    this.snapshots.set(snapshot.matchID, structuredClone(snapshot));
    this.active.add(snapshot.matchID);
  }

  async save(
    matchID: string,
    state: MatchState<SetupState>,
    expectedStateID: number,
    now: number,
  ): Promise<'ok' | 'conflict'> {
    const cur = this.snapshots.get(matchID);
    if (!cur || cur.state.stateID !== expectedStateID) return 'conflict';
    this.snapshots.set(matchID, { ...cur, state: structuredClone(state), updatedAt: now });
    return 'ok';
  }

  async load(matchID: string): Promise<MatchSnapshot | null> {
    const cur = this.snapshots.get(matchID);
    return cur ? structuredClone(cur) : null;
  }

  async listActive(): Promise<string[]> {
    return [...this.active];
  }

  async finish(matchID: string): Promise<void> {
    this.active.delete(matchID);
  }
}

/**
 * 比较并交换：库里的值恰好等于调用方读到的旧值才写入新值，保留原有过期时间。
 * 版本号的比较在调用方读出旧快照时已做；脚本负责保证从读到写之间没有别人改过。
 */
export const SAVE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL')
  return 'ok'
end
return 'conflict'
`;

export class RedisMatchStore implements MatchStore {
  constructor(private readonly redis: Redis) {}

  async create(snapshot: MatchSnapshot): Promise<void> {
    const ok = await this.redis.set(
      RedisKeys.matchSnapshot(snapshot.matchID),
      JSON.stringify(snapshot),
      'NX',
    );
    if (ok !== 'OK') throw new Error(`对局快照已存在：${snapshot.matchID}`);
    await this.redis.sadd(RedisKeys.matchActive(), snapshot.matchID);
  }

  async save(
    matchID: string,
    state: MatchState<SetupState>,
    expectedStateID: number,
    now: number,
  ): Promise<'ok' | 'conflict'> {
    const key = RedisKeys.matchSnapshot(matchID);
    const raw = await this.redis.get(key);
    if (raw === null) return 'conflict';
    const cur = JSON.parse(raw) as MatchSnapshot;
    if (cur.state.stateID !== expectedStateID) return 'conflict';
    const next: MatchSnapshot = { ...cur, state, updatedAt: now };
    const res = await this.redis.eval(SAVE_SCRIPT, 1, key, raw, JSON.stringify(next));
    return res === 'ok' ? 'ok' : 'conflict';
  }

  async load(matchID: string): Promise<MatchSnapshot | null> {
    const raw = await this.redis.get(RedisKeys.matchSnapshot(matchID));
    return raw === null ? null : (JSON.parse(raw) as MatchSnapshot);
  }

  async listActive(): Promise<string[]> {
    return this.redis.smembers(RedisKeys.matchActive());
  }

  async finish(matchID: string): Promise<void> {
    await this.redis.srem(RedisKeys.matchActive(), matchID);
    await this.redis.expire(RedisKeys.matchSnapshot(matchID), RedisTTL.MATCH_FINISHED);
  }
}
