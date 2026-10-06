// 对局服务：房间点开始后建立权威对局，管理内存里的对局房间，进程重启后从快照恢复
//
// 创建顺序：生成种子 → 建局 → 写快照 → 写归档 → 登记 Bot 管理器 → 建房间并开始排程。
// 对局种子只出现在快照与归档入参里：不写日志，也没有任何公开方法返回它。

import { randomBytes } from 'node:crypto';
import { InceptionCityGame } from '@icgame/game-engine';
import type { SetupState } from '@icgame/game-engine/setup';
import {
  createMatch,
  matchFromSnapshot,
  type GameDef,
  type MatchState,
} from '@icgame/game-engine/runner';
import { AppError } from '../infra/errors.js';
import { logger } from '../infra/logger.js';
import type { BotManager } from '../services/BotManager.js';
import type { RoomState } from '../services/LobbyService.js';
import type { MatchArchive } from './MatchArchive.js';
import { MatchRoom, type RoomDeps, type RoomSeat, type StepOutput } from './MatchRoom.js';
import type { MatchSnapshot, MatchStore } from './MatchStore.js';
import { buildSeats, buildSetup } from './seats.js';
import type { TimingConfig } from './scheduling.js';

/** 对局结束后房间在注册表里多留一小段时间，让最后一条消息发完 */
export const FINISHED_ROOM_LINGER_MS = 5_000;

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 10;

const game: GameDef<SetupState> = InceptionCityGame;

export interface MatchServiceDeps {
  store: MatchStore;
  archive: MatchArchive;
  bot: BotManager;
  timing: TimingConfig;
  timers: RoomDeps['timers'];
  /** 默认 randomBytes(32) 的十六进制 */
  randomSeed?(): string;
  /** 一步完成后的发送钩子，由网关注入 */
  onStep(matchID: string, output: StepOutput): void | Promise<void>;
  onSeatsChanged(matchID: string): void;
  onGameOver(matchID: string, state: MatchState<SetupState>): void | Promise<void>;
  /** 快照存储在不可用与正常之间切换，由网关转成对连接的提示 */
  onStorageHealth?(matchID: string, healthy: boolean): void;
  /** 房间被从存储重新加载的新房间原地替换：连接需要重发一份完整视图 */
  onResync?(matchID: string): void;
  /** 对局无法继续（重新加载失败）：通知这一局的连接并断开 */
  onAborted?(matchID: string): void;
}

export class MatchService {
  private readonly rooms = new Map<string, MatchRoom>();
  /** 正在建局的 id，防止并发建出两局 */
  private readonly creating = new Set<string>();
  private readonly lingerTimers = new Set<unknown>();
  private readonly unsubscribe: Array<() => void> = [];

  constructor(private readonly deps: MatchServiceDeps) {
    this.unsubscribe.push(
      deps.bot.onTakeover((matchID) => this.seatsChanged(matchID)),
      deps.bot.onAbandon((matchID) => this.seatsChanged(matchID)),
    );
  }

  /** 房间点开始：建立权威对局，返回 matchID（= 房间 id） */
  async createFromRoom(room: RoomState): Promise<string> {
    const matchID = room.id;
    if (this.rooms.has(matchID) || this.creating.has(matchID)) {
      throw new AppError('CONFLICT', '该对局已存在');
    }
    if (room.players.length < MIN_PLAYERS || room.players.length > MAX_PLAYERS) {
      throw new AppError('CONFLICT', '需要 4–10 名玩家');
    }

    this.creating.add(matchID);
    try {
      const seed = this.deps.randomSeed?.() ?? randomBytes(32).toString('hex');
      const seats = buildSeats(room.players);
      const setup = buildSetup(room, seats, seed);
      const state = createMatch(game, setup);
      const now = this.deps.timers.now();
      const snapshot: MatchSnapshot = {
        matchID,
        roomCode: room.code,
        seats,
        setup,
        state,
        createdAt: now,
        updatedAt: now,
      };

      // 快照写入之后到返回之前任何一步失败都要回滚，否则存储里留下无人管理的快照
      const outcome = await this.deps.store.create(snapshot);
      try {
        if (outcome === 'replaced') {
          // 本进程没有这一局在跑，撞上的只会是建局中途失败的残留或已结束的上一局
          logger.warn({ matchID }, 'match snapshot replaced an existing one');
        }
        try {
          await this.deps.archive.recordStart(snapshot);
        } catch (err) {
          logger.error({ matchID, err }, 'archive recordStart failed');
        }

        this.deps.bot.registerMatch(matchID);
        this.mount(matchID, seats, state);
      } catch (err) {
        await this.teardown(matchID);
        throw err;
      }
      logger.info(
        {
          matchID,
          roomCode: room.code,
          numPlayers: seats.length,
          bots: seats.filter((s) => s.isBot).length,
        },
        'match created',
      );
      return matchID;
    } finally {
      this.creating.delete(matchID);
    }
  }

  /**
   * 撤销一局：关闭房间、清掉 Bot 管理器登记、删存储里的快照。
   * 供建局之后的后续步骤失败时调用；每一步独立容错，不抛错。
   */
  async discardMatch(matchID: string): Promise<void> {
    await this.teardown(matchID);
  }

  private async teardown(matchID: string): Promise<void> {
    const room = this.rooms.get(matchID);
    this.rooms.delete(matchID);
    if (room) this.safely(matchID, 'room close', () => room.close());
    this.safely(matchID, 'bot dispose', () => this.deps.bot.disposeMatch(matchID));
    try {
      await this.deps.store.discard(matchID);
    } catch (err) {
      logger.error({ matchID, err }, 'store discard failed');
    }
  }

  get(matchID: string): MatchRoom | null {
    return this.rooms.get(matchID) ?? null;
  }

  /** 账号在这局里的座位；只认真人座位，不在返回 null */
  seatOf(matchID: string, playerId: string): string | null {
    if (playerId === '') return null;
    const room = this.rooms.get(matchID);
    if (!room) return null;
    const hit = room.seats().find((s) => !s.isBot && s.playerId === playerId);
    return hit?.seat ?? null;
  }

  /** 座位的在线或接管状态变了：房间重新排程，并通知发送层 */
  seatsChanged(matchID: string): void {
    const room = this.rooms.get(matchID);
    if (!room) return;
    room.reschedule();
    this.deps.onSeatsChanged(matchID);
  }

  /** 进程启动时调用：把活跃集合里的对局逐个恢复；单个失败不影响其余 */
  async restoreAll(): Promise<{ restored: number; failed: string[] }> {
    const ids = await this.deps.store.listActive();
    let restored = 0;
    const failed: string[] = [];

    for (const matchID of ids) {
      if (this.rooms.has(matchID) || this.creating.has(matchID)) continue;
      try {
        if ((await this.restoreOne(matchID)) === 'mounted') restored += 1;
      } catch (err) {
        failed.push(matchID);
        logger.error({ matchID, err }, 'match restore failed');
      }
    }
    return { restored, failed };
  }

  /**
   * 从存储恢复单局：读快照 → 还原状态 → 挂房间。
   * inPlace 为真时是替换一个已在运行（但内存状态不可信）的房间：Bot 管理器里的登记与座位在线记录原样保留。
   * 快照里已经是结束状态时只走结束流程，返回 'finished'。
   */
  private async restoreOne(matchID: string, inPlace = false): Promise<'mounted' | 'finished'> {
    const snapshot = await this.deps.store.load(matchID);
    if (snapshot === null) throw new Error('快照不存在');
    if (!Array.isArray(snapshot.seats) || snapshot.seats.length === 0) {
      throw new Error('快照里没有座位表');
    }
    const state = matchFromSnapshot<SetupState>(snapshot.state, game);

    if (state.ctx.gameover !== undefined) {
      logger.info({ matchID, stateID: state.stateID }, 'restored match already over');
      await this.finishMatch(matchID, state, snapshot.seats);
      return 'finished';
    }

    if (!inPlace) this.deps.bot.registerMatch(matchID);
    this.mount(matchID, snapshot.seats, state, inPlace);
    logger.info(
      { matchID, stateID: state.stateID, numPlayers: snapshot.seats.length, inPlace },
      'match restored',
    );
    return 'mounted';
  }

  /**
   * 写快照遇到真正的版本冲突：内存状态已不可信，从存储重新加载并原地换房间。
   * 重新加载失败才放弃：通知连接并断开，对局留在活跃集合里等进程重启恢复。
   */
  private async recoverFromConflict(matchID: string, stale: MatchRoom): Promise<void> {
    try {
      const result = await this.restoreOne(matchID, true);
      if (result === 'finished') {
        this.removeRoom(matchID, stale);
        return;
      }
      this.deps.onResync?.(matchID);
    } catch (err) {
      logger.error({ matchID, err }, 'reload after persist conflict failed, aborting room');
      this.removeRoom(matchID, stale);
      this.safely(matchID, 'bot dispose', () => this.deps.bot.disposeMatch(matchID));
      this.safely(matchID, 'abort notify', () => this.deps.onAborted?.(matchID));
    }
  }

  private removeRoom(matchID: string, room: MatchRoom): void {
    if (this.rooms.get(matchID) === room) this.rooms.delete(matchID);
  }

  /** 关闭所有房间、清掉延迟移除的计时器、清空注册表；不动存储 */
  shutdown(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
    for (const handle of this.lingerTimers) this.deps.timers.clearTimeout(handle);
    this.lingerTimers.clear();
    for (const room of this.rooms.values()) room.close();
    this.rooms.clear();
  }

  // ---------------------------------------------------------------------------

  /** 建房间、登记到注册表并开始排程 */
  private mount(
    matchID: string,
    seats: readonly RoomSeat[],
    state: MatchState<SetupState>,
    inPlace = false,
  ): void {
    const { deps } = this;
    const room: MatchRoom = new MatchRoom(matchID, seats, state, {
      game,
      persist: (next, expectedStateID) =>
        deps.store.save(matchID, next, expectedStateID, deps.timers.now()),
      onStep: async (output) => {
        try {
          await deps.archive.appendStep({
            matchID,
            stateID: output.state.stateID,
            request: output.request,
            events: output.events,
            at: new Date(deps.timers.now()),
          });
        } catch (err) {
          logger.error(
            { matchID, stateID: output.state.stateID, err },
            'archive appendStep failed',
          );
        }
        await deps.onStep(matchID, output);
      },
      onGameOver: (final): Promise<void> => this.finishMatch(matchID, final, seats, room),
      isTakenOver: (seat) => deps.bot.isBotControlled(matchID, seat),
      loadStoredVersion: async () => (await deps.store.load(matchID))?.state.stateID ?? null,
      onStorageHealth: (healthy) => deps.onStorageHealth?.(matchID, healthy),
      onFatal: (reason) => {
        logger.error({ matchID, reason }, 'room closed after snapshot version conflict');
        void this.recoverFromConflict(matchID, room);
      },
      timing: deps.timing,
      timers: deps.timers,
    });
    this.rooms.set(matchID, room);
    // 真人座位先记为离线：没连上来的座位（建局后不来、重启后不回来）也能走到接管阈值；
    // 连接建立时的 onReconnect 会清掉这条记录
    // （原地替换时座位的在线记录仍然有效，不重置）
    if (!inPlace) {
      for (const s of seats) {
        if (!s.isBot) deps.bot.onDisconnect(matchID, s.seat);
      }
    }
    room.start();
  }

  /** 对局结束：归档 → 存储 → Bot 管理器 → 通知；每一步失败只记 ERROR 并继续 */
  private async finishMatch(
    matchID: string,
    final: MatchState<SetupState>,
    seats: readonly RoomSeat[],
    room?: MatchRoom,
  ): Promise<void> {
    const { deps } = this;
    let archived = true;
    try {
      await deps.archive.recordFinish(matchID, final, seats);
    } catch (err) {
      archived = false;
      logger.error({ matchID, err }, 'archive recordFinish failed, keeping match active for retry');
    }
    // 归档失败时对局留在活跃集合里，下次进程启动恢复到「已结束的快照」时会再走一遍结束流程
    if (archived) {
      try {
        await deps.store.finish(matchID);
      } catch (err) {
        logger.error({ matchID, err }, 'store finish failed');
      }
    }
    this.safely(matchID, 'bot dispose', () => deps.bot.disposeMatch(matchID));
    try {
      await deps.onGameOver(matchID, final);
    } catch (err) {
      logger.error({ matchID, err }, 'onGameOver failed');
    }

    if (room !== undefined) {
      const handle = deps.timers.setTimeout(() => {
        this.lingerTimers.delete(handle);
        if (this.rooms.get(matchID) === room) this.rooms.delete(matchID);
        room.close();
      }, FINISHED_ROOM_LINGER_MS);
      this.lingerTimers.add(handle);
    }
  }

  private safely(matchID: string, what: string, fn: () => void): void {
    try {
      fn();
    } catch (err) {
      logger.error({ matchID, err }, `${what} failed`);
    }
  }
}
