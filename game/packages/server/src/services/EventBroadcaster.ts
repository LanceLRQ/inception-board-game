// EventBroadcaster - 服务端零信任广播桥
// 对照：plans/design/07-backend-network.md §7.9b
//
// 使用方式：
//   const broadcaster = new EventBroadcaster(io, redisPub);
//   broadcaster.publish(event, ctx);
//
// 该服务包装 game-engine 的 distribute() 函数，
// 将 per-recipient 事件通过 Socket.io 推送给对应玩家。

import type { Redis } from 'ioredis';
import { distribute, type BroadcastContext, type BroadcastEvent } from '@icgame/game-engine';
import { logger } from '../infra/logger.js';

// 抽象 IO 发射器 - 避免直依赖 socket.io 具体类型
export interface SocketEmitter {
  to(socketId: string): { emit(event: string, data: unknown): unknown };
}

export interface SocketRegistry {
  /** 根据 matchId + playerId 查找 socket 列表（支持多端） */
  socketsOf(matchId: string, playerId: string): string[];
}

export class EventBroadcaster {
  constructor(
    private readonly io: SocketEmitter,
    private readonly registry: SocketRegistry,
    private readonly redisPub?: Redis,
  ) {}

  /**
   * 将一个游戏事件广播给合法接收者。
   * - 直连 socket：通过 io.to(socketId).emit
   * - 跨实例：通过 Redis Pub/Sub 广播到其他 pod（由 SocketRegistry 或 adapter 兜底）
   */
  publish(event: BroadcastEvent, ctx: BroadcastContext): void {
    const copies = distribute(event, ctx);

    if (copies.length === 0) {
      logger.debug({ eventKind: event.eventKind, matchId: event.matchId }, 'no recipients');
      return;
    }

    for (const { recipient, event: rewritten } of copies) {
      const sockets = this.registry.socketsOf(event.matchId, recipient);
      if (sockets.length === 0) {
        // 玩家不在线：写入 Redis 队列（由其他模块处理落地）
        this.enqueueOffline(event.matchId, recipient, rewritten);
        continue;
      }
      for (const sid of sockets) {
        this.io.to(sid).emit('icg:event', {
          matchID: event.matchId,
          event: {
            moveCounter: event.seq,
            eventKind: rewritten.eventKind,
            payload: rewritten.payload,
            timestamp: rewritten.timestamp,
          },
        });
      }
    }

    logger.debug(
      {
        eventKind: event.eventKind,
        matchId: event.matchId,
        recipients: copies.map((c) => c.recipient),
      },
      'broadcast filtered',
    );
  }

  /** 离线玩家：事件挂起到 Redis 队列，重连时拉取 */
  private enqueueOffline(matchId: string, playerId: string, event: BroadcastEvent): void {
    if (!this.redisPub) return;
    const key = `ico:ws:queue:${matchId}:${playerId}`;
    void this.redisPub.rpush(key, JSON.stringify(event)).then(
      () => this.redisPub!.expire(key, 300),
      (err) => logger.warn({ err, key }, 'failed to enqueue offline event'),
    );
  }
}

// === 简单内存 registry（单实例开发/测试用）===

export class InMemorySocketRegistry implements SocketRegistry {
  private readonly map = new Map<string, Set<string>>();

  private key(matchId: string, playerId: string): string {
    return `${matchId}:${playerId}`;
  }

  register(matchId: string, playerId: string, socketId: string): void {
    const k = this.key(matchId, playerId);
    const set = this.map.get(k) ?? new Set<string>();
    set.add(socketId);
    this.map.set(k, set);
  }

  unregister(matchId: string, playerId: string, socketId: string): void {
    const k = this.key(matchId, playerId);
    this.map.get(k)?.delete(socketId);
  }

  socketsOf(matchId: string, playerId: string): string[] {
    return [...(this.map.get(this.key(matchId, playerId)) ?? [])];
  }
}
