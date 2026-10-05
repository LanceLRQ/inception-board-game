// 网关里可单独测试的纯逻辑：握手校验、按座位生成消息、入站对局消息处理
//
// 信息不对称由这里守住：发给某条连接的对局状态只来自 viewMatch，事件只来自 eventsFor，
// 座位只来自握手时的鉴权结果，永远不取自消息内容。

import {
  InceptionCityGame,
  MATCH_PROTOCOL_VERSION,
  eventsFor,
  viewMatch,
  type ClientMatchMessage,
  type MatchSnapshotForViewer,
  type MoveRejectCode,
  type SeatInfo,
  type ServerMatchMessage,
} from '@icgame/game-engine';
import { logger } from '../infra/logger.js';
import type { MatchRoom, StepOutput } from '../match/MatchRoom.js';
import type { MatchService } from '../match/MatchService.js';
import type { MoveGateway } from '../services/MoveGateway.js';

export type HandshakeError = 'AUTH_REQUIRED' | 'AUTH_INVALID' | 'NOT_IN_MATCH';

export type HandshakeResult =
  | { ok: true; playerID: string; matchID: string; nickname: string; seat: string }
  | { ok: false; error: HandshakeError };

export interface HandshakeDeps {
  verifyToken(token: string): { playerId: string; nickname: string };
  matches: Pick<MatchService, 'seatOf'>;
}

const MATCH_ID_MAX_LENGTH = 64;

/** 握手校验：令牌有效，且账号是这局的真人成员。对局不存在与非成员不作区分 */
export function authorizeHandshake(auth: unknown, deps: HandshakeDeps): HandshakeResult {
  if (auth === null || typeof auth !== 'object') return { ok: false, error: 'AUTH_REQUIRED' };
  const { token, matchID } = auth as { token?: unknown; matchID?: unknown };
  if (typeof token !== 'string' || token === '') return { ok: false, error: 'AUTH_REQUIRED' };
  if (typeof matchID !== 'string' || matchID.length < 1 || matchID.length > MATCH_ID_MAX_LENGTH) {
    return { ok: false, error: 'AUTH_REQUIRED' };
  }

  let payload: { playerId: string; nickname: string };
  try {
    payload = deps.verifyToken(token);
  } catch {
    logger.warn({ matchID, reason: 'AUTH_INVALID' }, 'ws handshake rejected');
    return { ok: false, error: 'AUTH_INVALID' };
  }

  const seat = deps.matches.seatOf(matchID, payload.playerId);
  if (seat === null) {
    logger.warn({ matchID, reason: 'NOT_IN_MATCH' }, 'ws handshake rejected');
    return { ok: false, error: 'NOT_IN_MATCH' };
  }
  return { ok: true, playerID: payload.playerId, matchID, nickname: payload.nickname, seat };
}

type RoomView = Pick<MatchRoom, 'matchID' | 'current' | 'deadlineAt' | 'seats'>;

export interface SeatStatusSource {
  isConnected(seat: string): boolean;
  isTakenOver(seat: string): boolean;
}

/** 座位表：Bot 座位恒为在线且未被接管 */
export function seatInfos(room: Pick<MatchRoom, 'seats'>, status: SeatStatusSource): SeatInfo[] {
  return room.seats().map((s) => ({
    seat: s.seat,
    nickname: s.nickname,
    isBot: s.isBot,
    connected: s.isBot ? true : status.isConnected(s.seat),
    takenOver: s.isBot ? false : status.isTakenOver(s.seat),
  }));
}

function buildSnapshot(
  matchID: string,
  state: ReturnType<MatchRoom['current']>,
  deadlineAt: number | null,
  seat: string,
  seats: SeatInfo[],
): MatchSnapshotForViewer {
  return {
    matchID,
    seat,
    seats,
    view: viewMatch(InceptionCityGame, state, seat),
    deadlineAt,
  };
}

/** 某个座位此刻看到的对局快照 */
export function snapshotFor(
  room: RoomView,
  seat: string,
  seats: SeatInfo[],
): MatchSnapshotForViewer {
  return buildSnapshot(room.matchID, room.current(), room.deadlineAt(), seat, seats);
}

export function stateMessage(
  room: RoomView,
  seat: string,
  seats: SeatInfo[],
): Extract<ServerMatchMessage, { type: 'icg:state' }> {
  return { type: 'icg:state', protocol: MATCH_PROTOCOL_VERSION, ...snapshotFor(room, seat, seats) };
}

/** 一步完成后发给某个座位的消息：视图与事件都来自这一步的输出，保证版本一致 */
export function stepMessage(
  room: Pick<MatchRoom, 'matchID'>,
  output: StepOutput,
  seat: string,
  seats: SeatInfo[],
): Extract<ServerMatchMessage, { type: 'icg:step' }> {
  return {
    type: 'icg:step',
    events: eventsFor(output.events, seat),
    ...buildSnapshot(room.matchID, output.state, output.deadlineAt, seat, seats),
  };
}

export interface MatchMessageContext {
  readonly matchID: string;
  /** 账号 id，来自握手 */
  readonly playerID: string;
  /** 座位号，来自握手 */
  readonly seat: string;
}

export interface MatchMessageDeps {
  matches: Pick<MatchService, 'get'>;
  moveGateway: Pick<MoveGateway, 'accept' | 'commit' | 'consumeRate'>;
  seatsFor(room: MatchRoom): SeatInfo[];
}

/** 回给连接的消息：对局消息，或限流这类与具体 move 无关的错误 */
export type MatchReply = ServerMatchMessage | { type: 'icg:error'; code: string; message: string };

function rejected(intentId: string, code: MoveRejectCode): ServerMatchMessage {
  return { type: 'icg:moveResult', intentId, ok: false, code };
}

/** 处理一条已通过形状解析的入站对局消息，返回要回给这条连接的那一条消息 */
export async function handleMatchMessage(
  msg: ClientMatchMessage,
  ctx: MatchMessageContext,
  deps: MatchMessageDeps,
): Promise<MatchReply> {
  const intentId = msg.type === 'icg:move' ? msg.intentId : '';
  try {
    const room = deps.matches.get(ctx.matchID);
    if (msg.type === 'icg:sync') {
      // 每次同步都要重算整份视图，与 move 共用限流计数
      if (!(await deps.moveGateway.consumeRate(ctx.playerID))) {
        return { type: 'icg:error', code: 'RATE_LIMITED', message: 'Too many requests' };
      }
      if (room === null) return rejected('', 'not_in_match');
      return stateMessage(room, ctx.seat, deps.seatsFor(room));
    }
    if (room === null) return rejected(intentId, 'not_in_match');

    // 幂等完全交给房间：这里不传 intentId，网关只负责形状与限流
    const accepted = await deps.moveGateway.accept({
      phase: room.current().ctx.phase ?? '',
      playerID: ctx.playerID,
      request: { move: msg.move, args: msg.args },
    });
    if (!accepted.ok) {
      logger.warn({ matchID: ctx.matchID, seat: ctx.seat, code: accepted.code }, 'move rejected');
      if (accepted.code === 'RATE_LIMIT_EXCEEDED') return rejected(intentId, 'rate_limited');
      if (accepted.code === 'RATE_INTENT_DUPLICATE') return rejected(intentId, 'duplicate_intent');
      // 形状不对的请求同样消耗配额，否则可以无限发送而不被限流
      await deps.moveGateway.commit({ playerID: ctx.playerID });
      return rejected(intentId, accepted.code as MoveRejectCode);
    }

    // 每次尝试都计入限流，不论随后是否被运行器接受：被拒的请求同样要跑一遍合法性判定
    await deps.moveGateway.commit(accepted.context);

    const result = await room.submit(ctx.seat, {
      move: accepted.request.move,
      args: accepted.request.args,
      intentId,
      stateID: msg.stateID,
    });
    if (!result.ok) return rejected(intentId, result.code);
    return { type: 'icg:moveResult', intentId, ok: true, stateID: result.stateID };
  } catch (err) {
    logger.error({ err, matchID: ctx.matchID, seat: ctx.seat }, 'handle match message failed');
    return rejected(intentId, 'internal_error');
  }
}
