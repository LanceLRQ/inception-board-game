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
import { StepArchiver } from './StepArchiver.js';
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
  private readonly archiver: StepArchiver;

  constructor(private readonly deps: MatchServiceDeps) {
    this.archiver = new StepArchiver(deps.archive, deps.timers);
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
        // 元信息走归档队列，写成功之前这一局的步骤不写；不等它，数据库不可用不该挡住开局
        this.archiver.enqueueStart(snapshot);

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
    this.archiver.discard(matchID);
    if (room) this.safely(matchID, 'room close', () => room.close());
    this.safely(matchID, 'bot dispose', () => this.deps.bot.disposeMatch(matchID));
    // 队列已丢弃，之后不会再有这局的新写入；把已经落库的旧步骤与座位清掉，
    // 免得同一个 id 再建局时旧时间线混进新的归档
    try {
      await this.deps.archive.resetMatch(matchID);
    } catch (err) {
      logger.error({ matchID, err }, 'archive reset failed');
    }
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
   * replacing 不为空时是替换一个已在运行（但内存状态不可信）的房间：Bot 管理器里的登记与座位在线记录原样保留；
   * 等待存储和归档期间这个房间若已被撤销或服务已关停，什么都不做，返回 'superseded'。
   * 快照里已经是结束状态时只走结束流程，返回 'finished'。
   */
  private async restoreOne(
    matchID: string,
    replacing?: MatchRoom,
  ): Promise<'mounted' | 'finished' | 'superseded'> {
    const inPlace = replacing !== undefined;
    const stillCurrent = (): boolean => !inPlace || this.rooms.get(matchID) === replacing;

    const snapshot = await this.deps.store.load(matchID);
    if (!stillCurrent()) return 'superseded';
    if (snapshot === null) throw new Error('快照不存在');
    if (!Array.isArray(snapshot.seats) || snapshot.seats.length === 0) {
      throw new Error('快照里没有座位表');
    }
    const state = matchFromSnapshot<SetupState>(snapshot.state, game);
    if (replacing === undefined) await this.checkArchiveTail(matchID, state.stateID);
    else await this.reconcileArchive(matchID, replacing.current().stateID, state.stateID);
    if (!stillCurrent()) return 'superseded';

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
   * 进程启动恢复时核对归档：归档的最大步号落后于快照版本，说明上次退出时有几步还没写进归档，
   * 它们已经无法补回，记一条缺口让回放接口如实告知。
   * 原地重新加载时进程一直在运行，队列还在补写，不做这个判断。
   */
  private async checkArchiveTail(matchID: string, stateID: number): Promise<void> {
    try {
      const last = await this.deps.archive.lastStepID(matchID);
      if (last < stateID) {
        logger.error({ matchID, lastArchived: last, stateID }, 'archive is behind snapshot');
        this.archiver.enqueueGap(matchID, last + 1, stateID);
      }
    } catch (err) {
      logger.error({ matchID, err }, 'archive tail check failed');
    }
  }

  /**
   * 原地重新加载时核对归档与库里版本的关系（旧房间的版本号是 previous，库里载入的是 loaded）：
   * - 库里比内存旧：归档里新于库的步骤属于另一条时间线，丢掉队列并删掉这些行；
   * - 库里比内存新：中间那几步没有进过归档，记一条缺口。
   * 清理失败只记日志，不挡住重新加载。
   */
  private async reconcileArchive(matchID: string, previous: number, loaded: number): Promise<void> {
    if (loaded < previous) {
      logger.error(
        { matchID, loaded, previous },
        'stored snapshot is older than the room, dropping archived steps beyond it',
      );
      this.archiver.discard(matchID);
      try {
        await this.deps.archive.truncateAfter(matchID, loaded);
      } catch (err) {
        logger.error({ matchID, loaded, err }, 'archive truncateAfter failed');
      }
    } else if (loaded > previous) {
      logger.warn({ matchID, loaded, previous }, 'stored snapshot is ahead of the room');
      this.archiver.enqueueGap(matchID, previous + 1, loaded);
    }
  }

  /** 进程关停时调用：等归档队列写完（最多 timeoutMs），然后停掉重试；返回没写完的条数 */
  async flushArchive(timeoutMs: number): Promise<number> {
    const remaining = await this.archiver.flush(timeoutMs);
    this.archiver.stop();
    return remaining;
  }

  /**
   * 写快照遇到真正的版本冲突：内存状态已不可信，从存储重新加载并原地换房间。
   * 重新加载失败才放弃：通知连接并断开，对局留在活跃集合里等进程重启恢复。
   */
  private async recoverFromConflict(matchID: string, stale: MatchRoom): Promise<void> {
    try {
      const result = await this.restoreOne(matchID, stale);
      if (result === 'superseded') return;
      if (result === 'finished') {
        // 库里的这一局已经结束，内存里的房间没有可继续的对局；让还连着的客户端知道
        this.removeRoom(matchID, stale);
        this.safely(matchID, 'abort notify', () => this.deps.onAborted?.(matchID));
        return;
      }
      this.deps.onResync?.(matchID);
    } catch (err) {
      logger.error({ matchID, err }, 'reload after persist conflict failed, aborting room');
      // 期间对局已被撤销或服务已关停：善后已由撤销方做完，不能再动同 id 的新登记
      if (this.rooms.get(matchID) !== stale) return;
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
        // 入队立即返回：归档在后台按序写、失败重试，不拖慢对局
        this.archiver.enqueue({
          matchID,
          stateID: output.state.stateID,
          request: output.request,
          events: output.events,
          at: new Date(deps.timers.now()),
        });
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
    // 先等这一局的步骤全部落库，再写结束信息，避免出现「已结束但缺步」的归档；
    // 等不到（超时）与写结束信息失败同样处理
    let archived = await this.archiver.drain(matchID);
    if (!archived) {
      logger.error({ matchID }, 'archive steps not fully written, keeping match active for retry');
    } else {
      try {
        await deps.archive.recordFinish(matchID, final, seats);
      } catch (err) {
        archived = false;
        logger.error(
          { matchID, err },
          'archive recordFinish failed, keeping match active for retry',
        );
      }
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
