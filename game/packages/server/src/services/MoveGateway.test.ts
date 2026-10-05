// MoveGateway 测试：请求形状 + move 名单 + 幂等与限流 的协作

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryRateGuard } from './RateGuardService.js';
import { MoveGateway } from './MoveGateway.js';

const shoot = { move: 'playShoot', args: ['c1', 'P2'] };

describe('MoveGateway', () => {
  let guard: InMemoryRateGuard;
  let gateway: MoveGateway;

  beforeEach(() => {
    guard = new InMemoryRateGuard({ maxPerWindow: 3 });
    gateway = new MoveGateway(guard);
  });

  it('接受合法请求并回传规整后的请求', async () => {
    const r = await gateway.accept({ phase: 'playing', playerID: 'P1', request: shoot });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.request).toEqual(shoot);
  });

  it('拒绝形状不对的请求', async () => {
    const r = await gateway.accept({ phase: 'playing', playerID: 'P1', request: null });
    expect(r).toMatchObject({ ok: false, code: 'not_object' });
  });

  it('拒绝不在当前阶段名单里的 move', async () => {
    const r = await gateway.accept({
      phase: 'playing',
      playerID: 'P1',
      request: { move: 'constructor', args: [] },
    });
    expect(r).toMatchObject({ ok: false, code: 'unknown_move' });
  });

  it('不替运行器做合法性判定：非回合主人的请求也只按形状放行', async () => {
    const r = await gateway.accept({ phase: 'playing', playerID: 'P2', request: shoot });
    expect(r.ok).toBe(true);
  });

  it('拒绝重复的 intent', async () => {
    guard.recordIntent('int-1');
    const r = await gateway.accept({
      phase: 'playing',
      playerID: 'P1',
      intentId: 'int-1',
      request: shoot,
    });
    expect(r).toMatchObject({ ok: false, code: 'RATE_INTENT_DUPLICATE' });
  });

  it('intentId 也可以写在请求里', async () => {
    guard.recordIntent('int-2');
    const r = await gateway.accept({
      phase: 'playing',
      playerID: 'P1',
      request: { ...shoot, intentId: 'int-2' },
    });
    expect(r).toMatchObject({ ok: false, code: 'RATE_INTENT_DUPLICATE' });
  });

  it('commit 记录 intent 与 move', async () => {
    const r = await gateway.accept({
      phase: 'playing',
      playerID: 'P1',
      intentId: 'int-new',
      request: shoot,
    });
    expect(r.ok).toBe(true);
    if (r.ok) await gateway.commit(r.context);
    expect(guard.isDuplicate('int-new')).toBe(true);
  });

  it('超过阈值后限流', async () => {
    for (let i = 0; i < 3; i++) guard.recordMove('P1');
    const r = await gateway.accept({ phase: 'playing', playerID: 'P1', request: shoot });
    expect(r).toMatchObject({ ok: false, code: 'RATE_LIMIT_EXCEEDED' });
  });
});
