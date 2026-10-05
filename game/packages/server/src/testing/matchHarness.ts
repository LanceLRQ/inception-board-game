// 真实 socket 对局测试的装备：起一个监听随机端口的服务，用真实的 socket.io 客户端连上去
//
// 依赖全部走内存实现（快照存储、归档、限流、Redis 桩）；存储与归档由调用方传入，
// 这样关停后可以用同一份数据再起一个服务来验证重启恢复。
// 所有等待都是「等到条件成立或超时失败」，不使用固定时长的 sleep。

import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import {
  InceptionCityGame,
  type ClientMatchMessage,
  type MatchViewState,
  type MoveRejectCode,
  type ServerMatchMessage,
} from '@icgame/game-engine';
import type { SetupState } from '@icgame/game-engine/setup';
import {
  applyMove,
  createMatch,
  type MatchEvent,
  type MatchState,
} from '@icgame/game-engine/runner';
import type { IdentityPrisma } from '../api/identity.js';
import { buildRealtime, type Realtime } from '../bootstrap.js';
import { signToken } from '../infra/jwt.js';
import { InMemoryMatchArchive, type MatchArchive } from '../match/MatchArchive.js';
import { InMemoryMatchStore, type MatchStore } from '../match/MatchStore.js';
import type { TimingConfig } from '../match/scheduling.js';
import { InMemoryBanChecker } from '../services/BanChecker.js';
import { BotManager, type BotManagerOptions } from '../services/BotManager.js';
import type { RoomPlayer, RoomState } from '../services/LobbyService.js';
import { InMemoryRateGuard, type RateGuardMutable } from '../services/RateGuardService.js';

/** 测试用的短时长：Bot 步 1 毫秒，各类截止 40 毫秒 */
export const FAST_TIMING: TimingConfig = {
  botStepDelayMs: 1,
  pendingTimeoutMs: 40,
  turnTimeoutMs: 40,
  responseTimeoutCapMs: 40,
};

/** 弃牌阶段的手牌上限 */
export const HAND_LIMIT = 5;

export interface ServerOptions {
  store?: MatchStore;
  archive?: MatchArchive;
  timing?: Partial<TimingConfig>;
  rateGuard?: RateGuardMutable;
  bans?: InMemoryBanChecker;
  /** 身份与运营接口读写的数据库；测试用内存实现，不给时用全局数据库 */
  identityPrisma?: IdentityPrisma;
  bot?: BotManagerOptions;
  /** 起来后立即从存储恢复活跃对局 */
  restore?: boolean;
}

export interface TestServer {
  rt: Realtime;
  url: string;
  store: MatchStore;
  archive: MatchArchive;
  /** 服务端正在使用的排程时长对象；改它再让房间重新排程即可调整节奏 */
  timing: TimingConfig;
  /** 服务端使用的封禁查询器 */
  bans: InMemoryBanChecker;
  stop(): Promise<void>;
}

export async function startServer(opts: ServerOptions = {}): Promise<TestServer> {
  const store = opts.store ?? new InMemoryMatchStore();
  const archive = opts.archive ?? new InMemoryMatchArchive();
  const timing: TimingConfig = { ...FAST_TIMING, ...opts.timing };
  const bans = opts.bans ?? new InMemoryBanChecker();
  const noop = async (): Promise<null> => null;
  const rt = buildRealtime({
    store,
    archive,
    lobbyRedis: {
      get: noop,
      setex: async () => 'OK',
      set: async () => 'OK',
      del: async () => 1,
      exists: async () => 0,
    },
    heartbeatRedis: { get: noop, setex: async () => 'OK', del: async () => 1 },
    rateGuard: opts.rateGuard ?? new InMemoryRateGuard({ maxPerWindow: 1_000_000 }),
    bans,
    ...(opts.identityPrisma ? { identityPrisma: opts.identityPrisma } : {}),
    timing,
    // 周期 tick 在测试里没有意义：接管由测试手动调用 tick() 推进
    bot: new BotManager({ tickIntervalMs: 3_600_000, ...opts.bot }),
    httpRateLimit: async (_ctx, next) => {
      await next();
    },
  });
  const port = await rt.start(0);
  if (opts.restore === true) await rt.matches.restoreAll();
  return {
    rt,
    url: `http://127.0.0.1:${port}`,
    store,
    archive,
    timing,
    bans,
    stop: () => rt.stop(),
  };
}

export interface RoomAccount {
  playerId: string;
  nickname: string;
  seat: string;
}

/** 直接构造一个房间状态：真人在前、Bot 在后，座位号依次为 '0'..'n-1' */
export function makeRoom(opts: { humans: number; bots: number }): {
  room: RoomState;
  accounts: RoomAccount[];
} {
  const total = opts.humans + opts.bots;
  const now = Date.now();
  const players: RoomPlayer[] = [];
  const accounts: RoomAccount[] = [];
  for (let i = 0; i < total; i++) {
    const isBot = i >= opts.humans;
    const playerId = isBot ? `bot-${i}` : randomUUID();
    const nickname = isBot ? `Bot${i}` : `Human${i}`;
    players.push({ playerId, nickname, avatarSeed: `seed-${i}`, seat: i, isBot, joinedAt: now });
    if (!isBot) accounts.push({ playerId, nickname, seat: String(i) });
  }
  const room: RoomState = {
    id: `e2e-${randomUUID()}`,
    code: 'E2E000',
    ownerPlayerId: accounts[0]!.playerId,
    maxPlayers: total,
    ruleVariant: 'standard',
    exCardsEnabled: false,
    expansionEnabled: false,
    status: 'playing',
    players,
    createdAt: now,
    expiresAt: now + 3_600_000,
  };
  return { room, accounts };
}

// ---------------------------------------------------------------------------
// 等待
// ---------------------------------------------------------------------------

/** 等到条件成立；超时抛错并带上说明。条件在每个轮询点重新计算，不依赖固定时长的休眠 */
export async function waitUntil(
  cond: () => boolean | Promise<boolean>,
  what: string,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await cond()) return;
    if (Date.now() > deadline) throw new Error(`等待超时：${what}`);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

// ---------------------------------------------------------------------------
// 客户端
// ---------------------------------------------------------------------------

export type MoveResult = Extract<ServerMatchMessage, { type: 'icg:moveResult' }>;
type StateLike = Extract<ServerMatchMessage, { type: 'icg:state' | 'icg:step' }>;

export interface ReceivedEvent {
  event: string;
  payload: unknown;
}

/** 按视图决定真人客户端此刻该发的 move；不是自己的回合返回 null。只依据自己收到的视图 */
export function decideMove(
  view: MatchViewState,
  seat: string,
): { move: string; args: unknown[] } | null {
  const G = view.G as {
    turnPhase?: string;
    currentPlayerID?: string;
    players?: Record<string, { hand: string[] | null }>;
  };
  if (view.ctx.gameover !== undefined || view.ctx.phase !== 'playing') return null;
  if (G.currentPlayerID !== seat) return null;
  switch (G.turnPhase) {
    case 'draw':
      return { move: 'doDraw', args: [] };
    case 'action':
      return { move: 'endActionPhase', args: [] };
    case 'discard': {
      const hand = G.players?.[seat]?.hand ?? [];
      if (hand.length > HAND_LIMIT) {
        return { move: 'doDiscard', args: [hand.slice(HAND_LIMIT)] };
      }
      return { move: 'skipDiscard', args: [] };
    }
    default:
      return null;
  }
}

export class TestClient {
  readonly received: ReceivedEvent[] = [];
  /** 本客户端收到的、带视图的消息（icg:state 与 icg:step），按到达顺序 */
  readonly views: StateLike[] = [];
  readonly results: MoveResult[] = [];
  readonly seatTables: Array<Extract<ServerMatchMessage, { type: 'icg:seats' }>> = [];
  /** 自己发出并被接受的 move 数 */
  acceptedCount = 0;
  seat: string | null = null;

  private autoPlay = false;
  private lastActedStateID = -1;
  private seq = 0;

  constructor(
    readonly socket: Socket,
    readonly playerId: string,
  ) {
    socket.onAny((event: string, payload: unknown) => {
      this.received.push({ event, payload });
      if (event === 'icg:state' || event === 'icg:step') {
        const msg = payload as StateLike;
        this.views.push(msg);
        this.seat = msg.seat;
        this.maybeAct();
      } else if (event === 'icg:moveResult') {
        const msg = payload as MoveResult;
        this.results.push(msg);
        if (msg.ok) this.acceptedCount += 1;
      } else if (event === 'icg:seats') {
        this.seatTables.push(payload as Extract<ServerMatchMessage, { type: 'icg:seats' }>);
      }
    });
  }

  get connected(): boolean {
    return this.socket.connected;
  }

  latestView(): MatchViewState | null {
    return this.views.at(-1)?.view ?? null;
  }

  latestStateID(): number {
    return this.latestView()?.stateID ?? -1;
  }

  isGameOver(): boolean {
    return this.latestView()?.ctx.gameover !== undefined;
  }

  /** 开启自动出牌：轮到自己时按 decideMove 发 move，其余等服务端超时代发 */
  startAutoPlay(): void {
    this.autoPlay = true;
    this.maybeAct();
  }

  stopAutoPlay(): void {
    this.autoPlay = false;
  }

  private maybeAct(): void {
    if (!this.autoPlay || this.seat === null || !this.socket.connected) return;
    const view = this.latestView();
    if (view === null || view.stateID === this.lastActedStateID) return;
    const decision = decideMove(view, this.seat);
    if (decision === null) return;
    this.lastActedStateID = view.stateID;
    this.socket.emit('icg:move', {
      type: 'icg:move',
      move: decision.move,
      args: decision.args,
      intentId: this.nextIntentId(),
      stateID: view.stateID,
    });
  }

  nextIntentId(): string {
    this.seq += 1;
    return `${this.playerId.slice(0, 8)}-${this.seq}`;
  }

  waitFor(pred: (c: TestClient) => boolean, what: string, timeoutMs = 15_000): Promise<void> {
    return waitUntil(() => pred(this), what, timeoutMs);
  }

  /** 发一个 icg:move，等对应 intentId 的结果；extra 里的字段原样并入 payload（用来伪造） */
  async send(
    move: string,
    args: unknown[],
    extra: Record<string, unknown> = {},
  ): Promise<MoveResult> {
    const intentId = typeof extra.intentId === 'string' ? extra.intentId : this.nextIntentId();
    const before = this.results.length;
    this.socket.emit('icg:move', { type: 'icg:move', move, args, intentId, ...extra });
    return this.resultAfter(before, intentId);
  }

  /** 原样发任意事件与载荷（畸形请求），等下一条 moveResult */
  async sendRaw(event: string, payload: unknown): Promise<MoveResult> {
    const before = this.results.length;
    this.socket.emit(event, payload);
    return this.resultAfter(before, null);
  }

  private async resultAfter(before: number, intentId: string | null): Promise<MoveResult> {
    let found: MoveResult | undefined;
    await waitUntil(
      () => {
        found = this.results
          .slice(before)
          .find((r) => intentId === null || r.intentId === intentId);
        return found !== undefined;
      },
      `等待 moveResult（intentId=${intentId ?? '任意'}）`,
      5_000,
    );
    return found!;
  }

  /** 主动请求同步，返回收到的下一条 icg:state */
  async sync(
    extra: Record<string, unknown> = {},
  ): Promise<Extract<ServerMatchMessage, { type: 'icg:state' }>> {
    const before = this.received.length;
    this.socket.emit('icg:sync', { type: 'icg:sync', ...extra } as ClientMatchMessage);
    let found: Extract<ServerMatchMessage, { type: 'icg:state' }> | undefined;
    await waitUntil(
      () => {
        const hit = this.received.slice(before).find((r) => r.event === 'icg:state');
        found = hit?.payload as typeof found;
        return found !== undefined;
      },
      '等待 icg:state',
      5_000,
    );
    return found!;
  }

  close(): void {
    this.autoPlay = false;
    this.socket.removeAllListeners();
    this.socket.disconnect();
  }
}

export type ConnectOutcome = { ok: true; client: TestClient } | { ok: false; reason: string };

/** 用任意令牌与对局 id 连接；握手被拒时返回 connect_error 的原因码 */
export function tryConnect(
  url: string,
  token: string,
  matchID: string,
  playerId = '',
): Promise<ConnectOutcome> {
  return new Promise((resolve) => {
    const socket = io(url, {
      path: '/ws',
      auth: { token, matchID },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    // 先挂上记录，避免漏掉连上后立即发来的 icg:state
    const client = new TestClient(socket, playerId);
    socket.once('connect', () => resolve({ ok: true, client }));
    socket.once('connect_error', (err: Error) => {
      socket.close();
      resolve({ ok: false, reason: err.message });
    });
  });
}

/** 以某个账号连接这局；被拒时抛错 */
export async function connect(
  server: TestServer,
  account: Pick<RoomAccount, 'playerId' | 'nickname'>,
  matchID: string,
): Promise<TestClient> {
  const token = signToken({ playerId: account.playerId, nickname: account.nickname });
  const out = await tryConnect(server.url, token, matchID, account.playerId);
  if (!out.ok) throw new Error(`握手被拒：${out.reason}`);
  return out.client;
}

// ---------------------------------------------------------------------------
// 重建
// ---------------------------------------------------------------------------

export interface RebuiltMatch {
  /** 各版本的完整状态，下标即版本号 */
  states: MatchState<SetupState>[];
  /** 各版本对应那一步的完整事件，下标即版本号（0 号为空） */
  events: MatchEvent[][];
}

/**
 * 用快照里的建局参数与归档的逐步请求，在测试里重建每个版本的完整状态与完整事件。
 * 同时验证了「归档足以重放出同一局」：任何一步被拒绝都会抛错。
 */
export async function rebuildMatch(
  store: MatchStore,
  archive: MatchArchive,
  matchID: string,
): Promise<{ rebuilt: RebuiltMatch; seed: string }> {
  const snapshot = await store.load(matchID);
  if (snapshot === null) throw new Error('快照不存在');
  const { numPlayers, setupData, seed } = snapshot.setup;
  const steps = await archive.listSteps(matchID);
  let state = createMatch(InceptionCityGame, { numPlayers, setupData, seed });
  const states: MatchState<SetupState>[] = [state];
  const events: MatchEvent[][] = [[]];
  for (const step of steps) {
    const out = applyMove(InceptionCityGame, state, step.request);
    if (!out.ok) throw new Error(`重放第 ${step.stateID} 步被拒绝：${out.reason}`);
    if (out.state.stateID !== step.stateID) {
      throw new Error(`归档版本号不连续：期望 ${out.state.stateID}，实际 ${step.stateID}`);
    }
    state = out.state;
    states.push(state);
    events.push(out.events);
  }
  return { rebuilt: { states, events }, seed };
}

export type { MoveRejectCode };
