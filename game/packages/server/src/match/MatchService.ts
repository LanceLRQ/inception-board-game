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

      await this.deps.store.create(snapshot);
      try {
        await this.deps.archive.recordStart(snapshot);
      } catch (err) {
        logger.error({ matchID, err }, 'archive recordStart failed');
      }

      this.deps.bot.registerMatch(matchID);
      this.mount(matchID, seats, state);
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
        const snapshot = await this.deps.store.load(matchID);
        if (snapshot === null) throw new Error('快照不存在');
        if (!Array.isArray(snapshot.seats) || snapshot.seats.length === 0) {
          throw new Error('快照里没有座位表');
        }
        const state = matchFromSnapshot<SetupState>(snapshot.state, game);

        if (state.ctx.gameover !== undefined) {
          logger.info({ matchID, stateID: state.stateID }, 'restored match already over');
          await this.finishMatch(matchID, state, snapshot.seats);
          continue;
        }

        this.deps.bot.registerMatch(matchID);
        this.mount(matchID, snapshot.seats, state);
        restored += 1;
        logger.info(
          { matchID, stateID: state.stateID, numPlayers: snapshot.seats.length },
          'match restored',
        );
      } catch (err) {
        failed.push(matchID);
        logger.error({ matchID, err }, 'match restore failed');
      }
    }
    return { restored, failed };
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
  private mount(matchID: string, seats: readonly RoomSeat[], state: MatchState<SetupState>): void {
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
      onFatal: (reason) => {
        logger.error({ matchID, reason }, 'room closed after snapshot write failure');
        this.safely(matchID, 'bot dispose', () => deps.bot.disposeMatch(matchID));
        this.rooms.delete(matchID);
      },
      timing: deps.timing,
      timers: deps.timers,
    });
    this.rooms.set(matchID, room);
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
    try {
      await deps.archive.recordFinish(matchID, final, seats);
    } catch (err) {
      logger.error({ matchID, err }, 'archive recordFinish failed');
    }
    try {
      await deps.store.finish(matchID);
    } catch (err) {
      logger.error({ matchID, err }, 'store finish failed');
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
