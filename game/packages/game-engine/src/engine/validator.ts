// 请求校验：只挡「形状不对」和「过于频繁」的请求。
//
// 合法性判定（谁能在什么时候出什么牌、目标与资源是否成立）一律由对局运行器负责：
// 行动权表、待结算闸门、各 move 自己的守卫。这里不重复那些判定，
// 也不维护手写的 move 清单——move 名单在加载时从引擎的 move 表派生。
//
// 校验分三层：
//   1. 请求形状：{ move: string, args: unknown[], intentId?: string }，有长度与大小上限
//   2. move 是否属于当前阶段的名单（由 move 表派生，原型链上的名字不算）
//   3. 幂等与限流（RateGuard 由服务端提供实现）

import { InceptionCityGame } from '../game.js';

// === move 名单 ===

/** 阶段名 → move 名集合，加载时派生一次并冻结 */
const MOVE_TABLES: Readonly<Record<string, Readonly<Record<string, true>>>> = Object.freeze(
  Object.fromEntries(
    Object.entries(InceptionCityGame.phases).map(([phase, def]) => [
      phase,
      Object.freeze(
        Object.fromEntries(
          ('moves' in def ? Object.keys(def.moves) : []).map((name) => [name, true as const]),
        ),
      ),
    ]),
  ),
);

const MOVE_LISTS: Readonly<Record<string, readonly string[]>> = Object.freeze(
  Object.fromEntries(
    Object.entries(MOVE_TABLES).map(([phase, table]) => [phase, Object.freeze(Object.keys(table))]),
  ),
);

const EMPTY_LIST: readonly string[] = Object.freeze([]);

/** 某个阶段（'setup' / 'playing'）的全部 move 名；未知阶段返回空 */
export function knownMoves(phase: string): readonly string[] {
  return Object.hasOwn(MOVE_LISTS, phase) ? MOVE_LISTS[phase]! : EMPTY_LIST;
}

/** move 是否属于该阶段的名单 */
export function isKnownMove(phase: string, move: string): boolean {
  if (!Object.hasOwn(MOVE_TABLES, phase)) return false;
  return Object.hasOwn(MOVE_TABLES[phase]!, move);
}

// === 请求形状 ===

/** args 的最大长度 */
export const MAX_ARGS = 8;
/** 整个请求序列化后的最大字节数 */
export const MAX_REQUEST_BYTES = 4096;

export interface ValidatedRequest {
  readonly move: string;
  readonly args: unknown[];
  readonly intentId?: string;
}

export type RequestShapeCode =
  | 'not_object'
  | 'move_not_string'
  | 'args_not_array'
  | 'args_too_long'
  | 'request_too_large'
  | 'not_serializable'
  | 'unknown_move'
  | 'intent_id_not_string';

export type RequestShapeResult =
  | { readonly ok: true; readonly request: ValidatedRequest }
  | { readonly ok: false; readonly code: RequestShapeCode };

const shapeFail = (code: RequestShapeCode): RequestShapeResult => ({ ok: false, code });

/**
 * 校验不可信的原始请求。无论输入是什么都不会抛异常。
 * 只读取自有的数据属性；访问器属性（getter）与读取时抛错的对象一律按「无法序列化」拒绝。
 */
export function validateRequestShape(raw: unknown, phase: string): RequestShapeResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return shapeFail('not_object');
  }
  try {
    const read = (key: string): { readonly found: boolean; readonly value: unknown } => {
      const desc = Object.getOwnPropertyDescriptor(raw, key);
      if (desc === undefined) return { found: false, value: undefined };
      if (!('value' in desc)) throw new TypeError('accessor property');
      return { found: true, value: desc.value };
    };
    const move = read('move').value;
    const args = read('args').value;
    const intent = read('intentId');

    if (typeof move !== 'string') return shapeFail('move_not_string');
    if (!Array.isArray(args)) return shapeFail('args_not_array');
    if (args.length > MAX_ARGS) return shapeFail('args_too_long');
    if (intent.found && intent.value !== undefined && typeof intent.value !== 'string') {
      return shapeFail('intent_id_not_string');
    }

    const json = JSON.stringify(raw);
    if (new TextEncoder().encode(json).length > MAX_REQUEST_BYTES) {
      return shapeFail('request_too_large');
    }
    if (!isKnownMove(phase, move)) return shapeFail('unknown_move');

    const intentId = typeof intent.value === 'string' ? intent.value : undefined;
    return {
      ok: true,
      request:
        intentId === undefined ? { move, args: [...args] } : { move, args: [...args], intentId },
    };
  } catch {
    // 循环引用、BigInt、getter 抛错等：请求无法被安全地读取或序列化
    return shapeFail('not_serializable');
  }
}

// === 幂等与限流 ===

export type RateCode = 'RATE_INTENT_DUPLICATE' | 'RATE_LIMIT_EXCEEDED';

export interface RateOk {
  readonly ok: true;
}

export interface RateFail {
  readonly ok: false;
  readonly code: RateCode;
  readonly reason: string;
}

export type RateResult = RateOk | RateFail;

/** 服务端提供实现（Redis / 内存）；引擎层只定义接口 */
export interface RateGuard {
  isDuplicate(intentId: string): boolean;
  isRateLimited(playerID: string): boolean;
}

export interface RateContext {
  readonly playerID: string;
  readonly intentId?: string;
}

export function validateRate(ctx: RateContext, guard?: RateGuard): RateResult {
  if (!guard) return { ok: true };
  if (ctx.intentId && guard.isDuplicate(ctx.intentId)) {
    return {
      ok: false,
      code: 'RATE_INTENT_DUPLICATE',
      reason: `intent ${ctx.intentId} already processed`,
    };
  }
  if (guard.isRateLimited(ctx.playerID)) {
    return {
      ok: false,
      code: 'RATE_LIMIT_EXCEEDED',
      reason: `rate limit exceeded for ${ctx.playerID}`,
    };
  }
  return { ok: true };
}
