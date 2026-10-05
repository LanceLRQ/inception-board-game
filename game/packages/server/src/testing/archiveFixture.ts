// 接口测试用的固定对局：四个座位（两名真人、两名 Bot），已结束与未结束各一局，
// 每一步都带有只给点名座位看的内容和私密的 move 参数。

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import Koa from 'koa';
import type Router from '@koa/router';
import type { MatchEvent } from '@icgame/game-engine/runner';
import { signToken } from '../infra/jwt.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { InMemoryMatchArchive, type StepRow } from '../match/MatchArchive.js';
import type { MatchMetaRow } from '../api/matchMeta.js';
import { makeTestSnapshot } from '../match/MatchStore.contract.js';

export const FINISHED_ID = '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c01';
export const RUNNING_ID = '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c02';
export const STEP_COUNT = 5;

export const ACCOUNT_SEAT0 = 'account-seat0';
export const ACCOUNT_SEAT1 = 'account-seat1';
export const ACCOUNT_OUTSIDER = 'account-outsider';

/** 私密内容的标记：只应出现在 secret.to 点名的座位的响应里 */
export const SEAT1_SECRET = 'SECRET-CARD-FOR-SEAT-1';
/** move 参数里的标记：任何响应里都不应出现 */
export const ARGS_SECRET = 'ARGS-SECRET-VALUE';

export function tokenFor(playerId: string): string {
  return signToken({ playerId, nickname: playerId });
}

function stepRow(matchID: string, stateID: number): StepRow {
  const events: MatchEvent[] = [
    {
      stateID,
      index: 0,
      kind: 'move',
      actor: '0',
      data: { move: 'playCard', player: '0' },
      secret: { to: ['0'], data: { args: [ARGS_SECRET] } },
    },
    {
      stateID,
      index: 1,
      kind: 'cards_drawn',
      actor: '1',
      data: { player: '1', count: 1 },
      secret: { to: ['1'], data: { cards: [`${SEAT1_SECRET}-${stateID}`] } },
    },
  ];
  return {
    matchID,
    stateID,
    request: { playerID: '0', move: 'playCard', args: [ARGS_SECRET] },
    events,
    at: new Date(Date.UTC(2026, 9, 5, 0, 0, stateID)),
  };
}

/** 建一个归档：FINISHED_ID 已结束、RUNNING_ID 进行中，两局都有 5 步 */
export async function seedArchive(): Promise<InMemoryMatchArchive> {
  const archive = new InMemoryMatchArchive();
  for (const matchID of [FINISHED_ID, RUNNING_ID]) {
    const snap = makeTestSnapshot(matchID);
    snap.seats = [
      { seat: '0', playerId: ACCOUNT_SEAT0, nickname: 'A', isBot: false },
      { seat: '1', playerId: ACCOUNT_SEAT1, nickname: 'B', isBot: false },
      { seat: '2', playerId: null, nickname: 'Bot2', isBot: true },
      { seat: '3', playerId: null, nickname: 'Bot3', isBot: true },
    ];
    await archive.recordStart(snap);
    for (let i = 1; i <= STEP_COUNT; i++) await archive.appendStep(stepRow(matchID, i));
    if (matchID === FINISHED_ID) await archive.recordFinish(matchID, snap.state, snap.seats);
  }
  return archive;
}

/** 响应体里测试关心的字段；其他字段按需断言 */
export interface JsonBody {
  data: Array<{ stateID: number; at: string; events: Array<{ kind: string }> }>;
  nextCursor: string | null;
  hasMore: boolean;
  viewerID: string | null;
  steps: unknown[];
  matchID: string;
  winner: string | null;
  winReason: string | null;
  players: Array<Record<string, unknown>>;
}

export interface TestServer {
  get(path: string, token?: string): Promise<{ status: number; text: string; json: JsonBody }>;
  close(): Promise<void>;
}

function parseJson(text: string): JsonBody {
  try {
    return JSON.parse(text) as JsonBody;
  } catch {
    return {} as JsonBody;
  }
}

/** 起一个只挂给定路由的服务，返回简易 GET 客户端 */
export async function serveRouter(router: Router): Promise<TestServer> {
  const app = new Koa();
  app.use(errorHandler);
  app.use(router.routes());
  const server: Server = createServer(app.callback());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    async get(path, token) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      const text = await res.text();
      return { status: res.status, text, json: parseJson(text) };
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** 对局元信息夹具：结束的 FINISHED_ID 带阵营与胜负，进行中的 RUNNING_ID 也带，用来验证路由会不会漏出去 */
export function fixtureMatchMeta(id: string): MatchMetaRow | null {
  if (id !== FINISHED_ID && id !== RUNNING_ID) return null;
  const finished = id === FINISHED_ID;
  return {
    id,
    roomId: null,
    ruleVariant: 'classic',
    exEnabled: false,
    expansionEnabled: false,
    playerCount: 2,
    startedAt: new Date(0),
    endedAt: finished ? new Date(1000) : null,
    winner: 'thief',
    winReason: 'vault_opened',
    matchPlayers: [
      {
        seat: 0,
        nickname: 'A',
        isBot: false,
        role: 'master',
        finalFaction: 'master',
        won: false,
        abandoned: false,
      },
      {
        seat: 1,
        nickname: 'B',
        isBot: false,
        role: 'thief',
        finalFaction: 'thief',
        won: true,
        abandoned: false,
      },
    ],
  };
}
