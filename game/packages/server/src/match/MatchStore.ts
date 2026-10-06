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
  /**
   * 新建一局：一次原子写入，同时写快照、去掉过期时间、加入活跃集合。
   * 同 id 已有旧快照时覆盖（返回 'replaced'）：只有一个进程在写，走到这里还撞上旧快照，
   * 只可能是建局中途失败的残留或已结束的上一局，留着只会让房间永远开不了局。
   */
  create(snapshot: MatchSnapshot): Promise<'created' | 'replaced'>;
  /** 原子地删掉快照并移出活跃集合；不存在也算成功 */
  discard(matchID: string): Promise<void>;
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

  async create(snapshot: MatchSnapshot): Promise<'created' | 'replaced'> {
    const replaced = this.snapshots.has(snapshot.matchID);
    this.snapshots.set(snapshot.matchID, structuredClone(snapshot));
    this.active.add(snapshot.matchID);
    return replaced ? 'replaced' : 'created';
  }

  async discard(matchID: string): Promise<void> {
    this.snapshots.delete(matchID);
    this.active.delete(matchID);
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

/**
 * 建局：快照与活跃集合在同一个脚本里写入。
 * 不带 NX 的 SET 会覆盖旧值并清掉过期时间（上一局结束时设的 1 天过期不会残留到新一局）。
 * KEYS[1]=快照键，KEYS[2]=活跃集合；ARGV[1]=快照 JSON，ARGV[2]=对局 id。
 */
export const CREATE_SCRIPT = `
local existed = redis.call('EXISTS', KEYS[1])
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SADD', KEYS[2], ARGV[2])
if existed == 1 then
  return 'replaced'
end
return 'created'
`;

/** 丢弃：删快照并移出活跃集合，一个脚本内完成。KEYS[1]=快照键，KEYS[2]=活跃集合；ARGV[1]=对局 id */
export const DISCARD_SCRIPT = `
redis.call('DEL', KEYS[1])
redis.call('SREM', KEYS[2], ARGV[1])
return 'ok'
`;

export class RedisMatchStore implements MatchStore {
  constructor(private readonly redis: Redis) {}

  async create(snapshot: MatchSnapshot): Promise<'created' | 'replaced'> {
    const res = await this.redis.eval(
      CREATE_SCRIPT,
      2,
      RedisKeys.matchSnapshot(snapshot.matchID),
      RedisKeys.matchActive(),
      JSON.stringify(snapshot),
      snapshot.matchID,
    );
    return res === 'replaced' ? 'replaced' : 'created';
  }

  async discard(matchID: string): Promise<void> {
    await this.redis.eval(
      DISCARD_SCRIPT,
      2,
      RedisKeys.matchSnapshot(matchID),
      RedisKeys.matchActive(),
      matchID,
    );
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
