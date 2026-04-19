// WS 连接注册表（MVP：单实例内存版，Phase 5 多实例改 Redis）
// 对照：plans/design/07-backend-network.md §7.4.4 / §7.4.5
//
// 职责：
//   - socketId ↔ { playerID, matchID } 双向映射
//   - 支持按 matchID 广播、按 playerID 查 socket
//   - 断开时清理映射

export interface ConnectionMeta {
  readonly socketId: string;
  readonly playerID: string;
  readonly matchID: string;
  readonly connectedAt: number;
}

export class ConnectionRegistry {
  private readonly bySocket = new Map<string, ConnectionMeta>();
  // playerID → socketIds（同一玩家可能多设备，MVP 允许但不推荐）
  private readonly byPlayer = new Map<string, Set<string>>();
  // matchID → socketIds
  private readonly byMatch = new Map<string, Set<string>>();

  register(meta: ConnectionMeta): void {
    this.bySocket.set(meta.socketId, meta);

    if (!this.byPlayer.has(meta.playerID)) {
      this.byPlayer.set(meta.playerID, new Set());
    }
    this.byPlayer.get(meta.playerID)!.add(meta.socketId);

    if (!this.byMatch.has(meta.matchID)) {
      this.byMatch.set(meta.matchID, new Set());
    }
    this.byMatch.get(meta.matchID)!.add(meta.socketId);
  }

  unregister(socketId: string): ConnectionMeta | null {
    const meta = this.bySocket.get(socketId);
    if (!meta) return null;

    this.bySocket.delete(socketId);

    const playerSet = this.byPlayer.get(meta.playerID);
    if (playerSet) {
      playerSet.delete(socketId);
      if (playerSet.size === 0) this.byPlayer.delete(meta.playerID);
    }

    const matchSet = this.byMatch.get(meta.matchID);
    if (matchSet) {
      matchSet.delete(socketId);
      if (matchSet.size === 0) this.byMatch.delete(meta.matchID);
    }

    return meta;
  }

  getBySocket(socketId: string): ConnectionMeta | null {
    return this.bySocket.get(socketId) ?? null;
  }

  getSocketsByPlayer(playerID: string): string[] {
    const set = this.byPlayer.get(playerID);
    return set ? [...set] : [];
  }

  getSocketsByMatch(matchID: string): string[] {
    const set = this.byMatch.get(matchID);
    return set ? [...set] : [];
  }

  /** 返回指定对局内所有 (playerID, socketId) 对；同玩家多设备会返回多次 */
  listMatchConnections(matchID: string): ConnectionMeta[] {
    const set = this.byMatch.get(matchID);
    if (!set) return [];
    const out: ConnectionMeta[] = [];
    for (const sid of set) {
      const meta = this.bySocket.get(sid);
      if (meta) out.push(meta);
    }
    return out;
  }

  /** 全量玩家 ID（按对局去重） */
  getMatchPlayerIds(matchID: string): string[] {
    const metas = this.listMatchConnections(matchID);
    return [...new Set(metas.map((m) => m.playerID))];
  }

  size(): number {
    return this.bySocket.size;
  }

  clear(): void {
    this.bySocket.clear();
    this.byPlayer.clear();
    this.byMatch.clear();
  }
}
