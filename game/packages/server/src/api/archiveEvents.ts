// 回放与对局事件接口共用：从归档读已结束对局的逐步记录，并按观察者的座位裁剪
//
// 归档里的事件含只给点名座位的私密内容，所以读出来必须过 eventsFor；
// 每步的请求（move 参数是私密的）一律不返回，move 名与发起者已在第一条 move 事件的公开部分里。

import { eventsFor, type MatchEvent } from '@icgame/game-engine/runner';
import { AppError } from '../infra/errors.js';
import { extractBearerToken, verifyToken } from '../infra/jwt.js';
import type { MatchArchive, StepRow } from '../match/MatchArchive.js';

/** 返回给客户端的一步 */
export interface StepView {
  stateID: number;
  at: Date;
  events: MatchEvent[];
}

/** 可选地识别身份：令牌有效返回账号 id，没有或无效都返回 null，不报错 */
export function optionalAccountId(authorization: string | undefined): string | null {
  const token = extractBearerToken(authorization);
  if (!token) return null;
  try {
    return verifyToken(token).playerId;
  } catch {
    return null;
  }
}

/** 把一步按观察者裁剪；只带版本号、时间与事件 */
export function toStepView(row: StepRow, viewer: string | null): StepView {
  return { stateID: row.stateID, at: row.at, events: eventsFor(row.events, viewer) };
}

export interface FinishedMatchSteps {
  /** 观察者的座位号；不是这局的真人座位成员则为 null（旁观者） */
  viewer: string | null;
  /** 全部步骤，未裁剪；调用方必须用 toStepView 输出 */
  steps: StepRow[];
}

/**
 * 读一局已结束对局的全部步骤，并确定观察者座位。
 * 对局不存在 → 404；未结束 → 409（不读取任何步骤）。
 */
export async function loadFinishedMatch(
  archive: MatchArchive,
  matchID: string,
  accountId: string | null,
): Promise<FinishedMatchSteps> {
  const info = await archive.matchInfo(matchID);
  if (!info) throw new AppError('NOT_FOUND', 'Match not found');
  if (info.endedAt === null) throw new AppError('CONFLICT', 'Match not finished');
  const seat =
    accountId === null ? undefined : info.seats.find((s) => s.playerId === accountId)?.seat;
  const steps = await archive.listSteps(matchID);
  return { viewer: seat ?? null, steps };
}
