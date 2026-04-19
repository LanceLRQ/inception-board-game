// MatchEventService - 对局事件归档（回放持久化 MVP，不含播放器）
// 对照：plans/design/03-data-model.md §3.8 MatchEvent / plans/design/07-backend-network.md §7.10 回放
//
// 设计要点：
//   - 抽象 MatchEventStore（Prisma 实现 + 内存实现便于测试）
//   - append：按 (matchId, moveCounter) 幂等，重复写入返回 DUPLICATE（不抛错）
//   - listByMatch：返回按 moveCounter 升序排序
//   - clearMatch：单局清理（结束后压缩等）
//   - sanitizeEventForStorage：纯函数，剥除临时内部字段（_ 开头的 key）
//   - 存储原始 payload（与 PlayerView 过滤解耦，回放播放时再按观察者重算）

export interface MatchEventRecord {
  readonly matchID: string;
  readonly moveCounter: number;
  readonly eventKind: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface MatchEventAppendInput {
  readonly matchID: string;
  readonly moveCounter: number;
  readonly eventKind: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt?: Date;
}

export interface MatchEventStore {
  append(input: MatchEventRecord): Promise<'OK' | 'DUPLICATE'>;
  listByMatch(matchID: string): Promise<MatchEventRecord[]>;
  clearMatch(matchID: string): Promise<number>;
  countByMatch(matchID: string): Promise<number>;
}

export type MatchEventAppendResult =
  | { readonly ok: true; readonly record: MatchEventRecord }
  | { readonly ok: false; readonly code: 'DUPLICATE' | 'INVALID_INPUT' };

export interface MatchEventServiceOptions {
  readonly now?: () => Date;
  /** 存储前钩子（用于接入 logger 等），可选 */
  readonly onAppended?: (record: MatchEventRecord) => void;
}

/**
 * 纯函数：落库前剥除 payload 中以 `_` 开头的内部临时字段。
 * 返回新对象（不修改入参），保证可序列化（Prisma Json 列）。
 */
export function sanitizeEventForStorage(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key.startsWith('_')) continue;
    out[key] = value;
  }
  return out;
}

/** 纯函数：输入合法性校验（便于测试） */
export function isValidAppendInput(input: MatchEventAppendInput): boolean {
  if (!input.matchID || typeof input.matchID !== 'string') return false;
  if (!Number.isInteger(input.moveCounter) || input.moveCounter < 0) return false;
  if (!input.eventKind || typeof input.eventKind !== 'string') return false;
  if (input.eventKind.length > 30) return false; // 对齐 schema VarChar(30)
  return true;
}

export class MatchEventService {
  private readonly now: () => Date;
  private readonly onAppended: ((record: MatchEventRecord) => void) | undefined;

  constructor(
    private readonly store: MatchEventStore,
    opts: MatchEventServiceOptions = {},
  ) {
    this.now = opts.now ?? (() => new Date());
    this.onAppended = opts.onAppended;
  }

  async append(input: MatchEventAppendInput): Promise<MatchEventAppendResult> {
    if (!isValidAppendInput(input)) {
      return { ok: false, code: 'INVALID_INPUT' };
    }
    const record: MatchEventRecord = {
      matchID: input.matchID,
      moveCounter: input.moveCounter,
      eventKind: input.eventKind,
      payload: sanitizeEventForStorage(input.payload),
      createdAt: input.createdAt ?? this.now(),
    };
    const status = await this.store.append(record);
    if (status === 'DUPLICATE') {
      return { ok: false, code: 'DUPLICATE' };
    }
    this.onAppended?.(record);
    return { ok: true, record };
  }

  list(matchID: string): Promise<MatchEventRecord[]> {
    return this.store.listByMatch(matchID);
  }

  clear(matchID: string): Promise<number> {
    return this.store.clearMatch(matchID);
  }

  count(matchID: string): Promise<number> {
    return this.store.countByMatch(matchID);
  }
}

/**
 * 广播事件适配：把 game-engine 的 BroadcastEvent 转成归档输入。
 * 纯函数，便于测试；注意 payload 必须是 JSON 友好的对象。
 */
export function broadcastEventToAppendInput(event: {
  readonly matchId: string;
  readonly seq: number;
  readonly eventKind: string;
  readonly payload: Record<string, unknown>;
}): MatchEventAppendInput {
  return {
    matchID: event.matchId,
    moveCounter: event.seq,
    eventKind: event.eventKind,
    payload: event.payload,
  };
}

/** 内存实现（单测与本地 Dev 用）。按 (matchID, moveCounter) 去重。 */
export class InMemoryMatchEventStore implements MatchEventStore {
  private readonly byMatch = new Map<string, Map<number, MatchEventRecord>>();

  async append(record: MatchEventRecord): Promise<'OK' | 'DUPLICATE'> {
    let m = this.byMatch.get(record.matchID);
    if (!m) {
      m = new Map();
      this.byMatch.set(record.matchID, m);
    }
    if (m.has(record.moveCounter)) return 'DUPLICATE';
    m.set(record.moveCounter, record);
    return 'OK';
  }

  async listByMatch(matchID: string): Promise<MatchEventRecord[]> {
    const m = this.byMatch.get(matchID);
    if (!m) return [];
    return Array.from(m.values()).sort((a, b) => a.moveCounter - b.moveCounter);
  }

  async clearMatch(matchID: string): Promise<number> {
    const m = this.byMatch.get(matchID);
    if (!m) return 0;
    const n = m.size;
    this.byMatch.delete(matchID);
    return n;
  }

  async countByMatch(matchID: string): Promise<number> {
    return this.byMatch.get(matchID)?.size ?? 0;
  }
}
