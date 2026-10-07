// 本地人机对局的存档编排：开局时恢复或新建、状态变化时落盘、终局时清除
//
// 纯逻辑，不含 Worker / Comlink / DOM；存档后端由 LocalMatchSaves 注入。
// 完整的引擎状态只在这里和 Worker 之间流动，界面线程拿不到。

import { LocalMatchSession, buildMatchSeed, type SessionView } from './localMatchSession.js';
import { LOCAL_HUMAN_SEAT } from './localSeat.js';
import type { LocalMatchSaves } from '../lib/localMatchSave.js';

/** 日志出口：Worker 里用 console，测试里用桩 */
export interface PersistenceLog {
  flow(msg: string, ctx?: unknown): void;
  warn(msg: string, ctx?: unknown): void;
}

export interface StartLocalMatchRequest {
  playerCount: number;
  matchID?: string;
  /** 是否把这局存档（/local 页为 true；好友房的本地模式为 false） */
  persist: boolean;
  /** 优先从存档恢复 */
  resume: boolean;
  /** 固定种子（端到端与走查用）；不给就按房间号与当前时刻生成。恢复存档时不起作用 */
  seed?: string;
}

export interface StartLocalMatchResult {
  session: LocalMatchSession;
  /** 这局是从存档恢复的 */
  resumed: boolean;
  /** 要求恢复但存档不可用（没有、版本不匹配、损坏），已丢弃并开了新局 */
  fellBack: boolean;
}

/** 建局：要求恢复就先试存档，不行就开新局；开新局且需要存档时先清掉旧存档 */
export async function startLocalMatch(
  request: StartLocalMatchRequest,
  saves: LocalMatchSaves,
  log: PersistenceLog,
  now: () => number = Date.now,
): Promise<StartLocalMatchResult> {
  let fellBack = false;
  if (request.resume) {
    const record = await saves.load();
    if (record !== null) {
      try {
        const session = LocalMatchSession.fromSnapshot(record.state, {
          playerCount: record.playerCount,
          seed: buildMatchSeed(request.matchID, now()),
          humanPlayerID: LOCAL_HUMAN_SEAT,
        });
        log.flow('local match restored', {
          playerCount: record.playerCount,
          turn: record.turn,
          stateID: record.stateID,
        });
        return { session, resumed: true, fellBack: false };
      } catch (err) {
        log.warn('saved match could not be restored, starting a new one', err);
        await saves.clear();
      }
    }
    fellBack = true;
  } else if (request.persist) {
    await saves.clear();
  }

  const session = new LocalMatchSession({
    playerCount: request.playerCount,
    seed: request.seed ?? buildMatchSeed(request.matchID, now()),
    humanPlayerID: LOCAL_HUMAN_SEAT,
  });
  return { session, resumed: false, fellBack };
}

/** 一次落盘动作 */
type SaveJob = () => Promise<void>;

/**
 * 合并写入：同一时刻只有一次写入在进行，期间的新请求只保留最新的一个，
 * 写完再接着做它。Bot 每百毫秒走一步，不合并的话写入会越积越多。
 */
export function createCoalescingWriter(): {
  request(job: SaveJob): void;
  /** 等当前写入与排队的那一次都写完 */
  idle(): Promise<void>;
} {
  let running: Promise<void> | null = null;
  let queued: SaveJob | null = null;

  const drain = async (first: SaveJob): Promise<void> => {
    let job: SaveJob | null = first;
    while (job !== null) {
      try {
        await job();
      } catch {
        /* 存档层自己吞掉并记日志；这里兜底，防止队列停转 */
      }
      job = queued;
      queued = null;
    }
    running = null;
  };

  return {
    request(job) {
      if (running === null) running = drain(job);
      else queued = job;
    },
    idle: async () => {
      while (running !== null) await running;
    },
  };
}

/** 会话里与存档有关的那部分，便于测试时替换 */
export interface PersistableSession {
  view(): SessionView;
  snapshot(): unknown;
}

export interface MatchPersistence {
  /** 状态变了：终局清除存档，否则落盘当前状态。isCurrent 为假（这局已被新局替换）时放弃写入 */
  onChange(session: PersistableSession, isCurrent: () => boolean): void;
  idle(): Promise<void>;
}

export function createMatchPersistence(
  saves: LocalMatchSaves,
  playerCount: number,
  log: PersistenceLog,
): MatchPersistence {
  const writer = createCoalescingWriter();
  return {
    onChange(session, isCurrent) {
      writer.request(async () => {
        if (!isCurrent()) return;
        const { G, ctx, stateID } = session.view();
        if (ctx.gameover !== undefined) {
          await saves.clear();
          log.flow('local match finished, save cleared');
          return;
        }
        // 取状态要放在写入时刻：排队期间状态可能又往前走了
        await saves.save({
          playerCount,
          // 与对局界面「回合 N」显示的是同一个数（G.turnNumber，不是引擎的 ctx.turn）
          turn: G.turnNumber,
          stateID,
          state: session.snapshot(),
        });
      });
    },
    idle: () => writer.idle(),
  };
}
