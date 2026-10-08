// 请求校验测试：move 名单由引擎的 move 表派生 · 请求形状 · 幂等与限流
// 合法性判定（身份、阶段、资源、目标、规则）由对局运行器负责，见 runner/matchRunner.test.ts 与 actionRights.test.ts

import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from '../game.js';
import {
  knownMoves,
  isKnownMove,
  validateRequestShape,
  validateRate,
  MAX_ARGS,
  MAX_REQUEST_BYTES,
  type RateGuard,
} from './validator.js';

describe('knownMoves', () => {
  it('对局阶段的名单与 move 表的键完全一致', () => {
    const expected = Object.keys(InceptionCityGame.phases.playing.moves).sort();
    expect([...knownMoves('playing')].sort()).toEqual(expected);
    expect(expected.length).toBe(89);
  });

  it('布置阶段的名单与 move 表的键完全一致', () => {
    const expected = Object.keys(InceptionCityGame.phases.setup.moves).sort();
    expect([...knownMoves('setup')].sort()).toEqual(expected);
    expect(expected.length).toBe(2);
  });

  it('未知阶段返回空，包括原型链上的名字', () => {
    expect(knownMoves('nope')).toEqual([]);
    expect(knownMoves('constructor')).toEqual([]);
    expect(knownMoves('__proto__')).toEqual([]);
  });

  it('名单被冻结', () => {
    expect(Object.isFrozen(knownMoves('playing'))).toBe(true);
  });

  it('isKnownMove 不认原型链上的名字', () => {
    expect(isKnownMove('playing', 'doDraw')).toBe(true);
    for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(isKnownMove('playing', name)).toBe(false);
    }
    expect(isKnownMove('setup', 'doDraw')).toBe(false);
  });
});

describe('validateRequestShape', () => {
  const phase = 'playing';

  it('接受合法请求并返回规整后的请求', () => {
    const r = validateRequestShape({ move: 'doDraw', args: [1, 'a'], intentId: 'i-1' }, phase);
    expect(r).toEqual({ ok: true, request: { move: 'doDraw', args: [1, 'a'], intentId: 'i-1' } });
  });

  it('intentId 可省略', () => {
    const r = validateRequestShape({ move: 'doDraw', args: [] }, phase);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.request.intentId).toBeUndefined();
  });

  it('丢弃多余字段', () => {
    const r = validateRequestShape({ move: 'doDraw', args: [], extra: 1 }, phase);
    expect(r.ok && Object.keys(r.request).sort()).toEqual(['args', 'move']);
  });

  it.each([null, undefined, 1, 'x', true, [], [1]])('不是对象：%j', (raw) => {
    expect(validateRequestShape(raw, phase)).toEqual({ ok: false, code: 'not_object' });
  });

  it('move 不是字符串', () => {
    expect(validateRequestShape({ move: 1, args: [] }, phase)).toMatchObject({
      ok: false,
      code: 'move_not_string',
    });
    expect(validateRequestShape({ args: [] }, phase)).toMatchObject({
      ok: false,
      code: 'move_not_string',
    });
  });

  it('args 不是数组', () => {
    for (const args of [undefined, null, 'a', { length: 0 }]) {
      expect(validateRequestShape({ move: 'doDraw', args }, phase)).toMatchObject({
        ok: false,
        code: 'args_not_array',
      });
    }
  });

  it('args 超过上限长度', () => {
    const ok = validateRequestShape({ move: 'doDraw', args: new Array(MAX_ARGS).fill(0) }, phase);
    expect(ok.ok).toBe(true);
    const bad = validateRequestShape(
      { move: 'doDraw', args: new Array(MAX_ARGS + 1).fill(0) },
      phase,
    );
    expect(bad).toMatchObject({ ok: false, code: 'args_too_long' });
  });

  it('序列化后超过上限大小', () => {
    const big = 'x'.repeat(MAX_REQUEST_BYTES);
    expect(validateRequestShape({ move: 'doDraw', args: [big] }, phase)).toMatchObject({
      ok: false,
      code: 'request_too_large',
    });
  });

  it('无法序列化（循环引用、BigInt）给专门的原因码而不是抛异常', () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(validateRequestShape({ move: 'doDraw', args: [loop] }, phase)).toMatchObject({
      ok: false,
      code: 'not_serializable',
    });
    expect(validateRequestShape({ move: 'doDraw', args: [1n] }, phase)).toMatchObject({
      ok: false,
      code: 'not_serializable',
    });
  });

  it('带 getter 的对象不会抛异常', () => {
    const raw = {
      args: [],
      get move(): string {
        throw new Error('boom');
      },
    };
    const r = validateRequestShape(raw, phase);
    expect(r.ok).toBe(false);
  });

  it('intentId 不是字符串', () => {
    expect(validateRequestShape({ move: 'doDraw', args: [], intentId: 5 }, phase)).toMatchObject({
      ok: false,
      code: 'intent_id_not_string',
    });
  });

  it('未知的 move，包括原型链上的名字', () => {
    for (const move of ['noSuchMove', 'constructor', '__proto__', 'toString']) {
      expect(validateRequestShape({ move, args: [] }, phase)).toMatchObject({
        ok: false,
        code: 'unknown_move',
      });
    }
  });

  it('move 按阶段判断', () => {
    expect(validateRequestShape({ move: 'completeSetup', args: [] }, 'setup').ok).toBe(true);
    expect(validateRequestShape({ move: 'completeSetup', args: [] }, 'playing')).toMatchObject({
      ok: false,
      code: 'unknown_move',
    });
  });
});

describe('validateRate', () => {
  const ctx = { playerID: 'P1' };

  it('没有 guard 时放行', () => {
    expect(validateRate(ctx).ok).toBe(true);
  });

  it('拒绝重复的 intent', () => {
    const guard: RateGuard = { isDuplicate: () => true, isRateLimited: () => false };
    const r = validateRate({ ...ctx, intentId: 'int-1' }, guard);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('RATE_INTENT_DUPLICATE');
  });

  it('拒绝超限的玩家', () => {
    const guard: RateGuard = { isDuplicate: () => false, isRateLimited: () => true };
    const r = validateRate(ctx, guard);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});
