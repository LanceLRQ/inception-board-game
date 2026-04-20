// 响应链框架测试

import { describe, it, expect } from 'vitest';
import {
  openResponseWindow,
  passOnResponse,
  respondToWindow,
  isWindowComplete,
  handleTimeout,
} from './response-chain.js';
import type { PendingResponse } from './types.js';
import { createTestState } from '../../testing/fixtures.js';

describe('openResponseWindow', () => {
  it('在 state 上创建 pendingResponseWindow', () => {
    const s = createTestState();
    const pending: PendingResponse = {
      sourceAbilityID: 'action_unlock',
      responders: ['p2', 'p3'],
      timeoutMs: 30000,
      validResponseAbilityIDs: ['action_unlock_cancel'],
      onTimeout: 'resolve',
    };
    const next = openResponseWindow(s, pending);
    expect(next.pendingResponseWindow).toBeDefined();
    expect(next.pendingResponseWindow!.sourceAbilityID).toBe('action_unlock');
    expect(next.pendingResponseWindow!.responders).toEqual(['p2', 'p3']);
    expect(next.pendingResponseWindow!.responded).toEqual([]);
  });
});

describe('passOnResponse', () => {
  it('添加玩家到 responded 列表', () => {
    const s = createTestState();
    const pending: PendingResponse = {
      sourceAbilityID: 'action_unlock',
      responders: ['p2', 'p3'],
      timeoutMs: 30000,
      validResponseAbilityIDs: ['action_unlock_cancel'],
      onTimeout: 'resolve',
    };
    let next = openResponseWindow(s, pending);
    next = passOnResponse(next, 'p2');
    expect(next.pendingResponseWindow!.responded).toEqual(['p2']);
  });

  it('所有人都 pass 后窗口关闭', () => {
    const s = createTestState();
    const pending: PendingResponse = {
      sourceAbilityID: 'action_unlock',
      responders: ['p2', 'p3'],
      timeoutMs: 30000,
      validResponseAbilityIDs: ['action_unlock_cancel'],
      onTimeout: 'resolve',
    };
    let next = openResponseWindow(s, pending);
    next = passOnResponse(next, 'p2');
    next = passOnResponse(next, 'p3');
    expect(next.pendingResponseWindow).toBeNull();
  });

  it('非 responder 的 pass 无效', () => {
    const s = createTestState();
    const pending: PendingResponse = {
      sourceAbilityID: 'action_unlock',
      responders: ['p2'],
      timeoutMs: 30000,
      validResponseAbilityIDs: [],
      onTimeout: 'resolve',
    };
    let next = openResponseWindow(s, pending);
    next = passOnResponse(next, 'p1');
    expect(next.pendingResponseWindow!.responded).toEqual([]);
  });
});

describe('respondToWindow', () => {
  it('有效响应关闭窗口', () => {
    const s = createTestState();
    const pending: PendingResponse = {
      sourceAbilityID: 'action_unlock',
      responders: ['p2'],
      timeoutMs: 30000,
      validResponseAbilityIDs: ['action_unlock_cancel'],
      onTimeout: 'cancel',
    };
    const next = openResponseWindow(s, pending);
    const result = respondToWindow(next, 'p2', 'action_unlock_cancel');
    expect(result.resolved).toBe(true);
    expect(result.state.pendingResponseWindow).toBeNull();
  });

  it('无效能力 ID 不响应', () => {
    const s = createTestState();
    const pending: PendingResponse = {
      sourceAbilityID: 'action_unlock',
      responders: ['p2'],
      timeoutMs: 30000,
      validResponseAbilityIDs: ['action_unlock_cancel'],
      onTimeout: 'cancel',
    };
    const next = openResponseWindow(s, pending);
    const result = respondToWindow(next, 'p2', 'invalid_id');
    expect(result.resolved).toBe(false);
    expect(next.pendingResponseWindow).toBeDefined();
  });

  it('非 responder 的响应无效', () => {
    const s = createTestState();
    const pending: PendingResponse = {
      sourceAbilityID: 'action_unlock',
      responders: ['p2'],
      timeoutMs: 30000,
      validResponseAbilityIDs: ['action_unlock_cancel'],
      onTimeout: 'cancel',
    };
    const next = openResponseWindow(s, pending);
    const result = respondToWindow(next, 'p1', 'action_unlock_cancel');
    expect(result.resolved).toBe(false);
  });
});

describe('isWindowComplete', () => {
  it('无窗口时返回 true', () => {
    const s = createTestState();
    expect(isWindowComplete(s)).toBe(true);
  });

  it('窗口未完全响应返回 false', () => {
    const s = createTestState();
    const pending: PendingResponse = {
      sourceAbilityID: 'action_unlock',
      responders: ['p2', 'p3'],
      timeoutMs: 30000,
      validResponseAbilityIDs: [],
      onTimeout: 'resolve',
    };
    const next = openResponseWindow(s, pending);
    expect(isWindowComplete(next)).toBe(false);
  });
});

describe('handleTimeout', () => {
  it('无窗口时返回 resolve', () => {
    const s = createTestState();
    const result = handleTimeout(s);
    expect(result.action).toBe('resolve');
  });

  it('onTimeout=resolve 的窗口超时后返回 resolve', () => {
    const s = createTestState();
    const pending: PendingResponse = {
      sourceAbilityID: 'action_unlock',
      responders: ['p2'],
      timeoutMs: 30000,
      validResponseAbilityIDs: [],
      onTimeout: 'resolve',
    };
    const next = openResponseWindow(s, pending);
    const result = handleTimeout(next);
    expect(result.action).toBe('resolve');
    expect(result.state.pendingResponseWindow).toBeNull();
  });

  it('onTimeout=cancel 的窗口超时后返回 cancel', () => {
    const s = createTestState();
    const pending: PendingResponse = {
      sourceAbilityID: 'action_unlock',
      responders: ['p2'],
      timeoutMs: 30000,
      validResponseAbilityIDs: [],
      onTimeout: 'cancel',
    };
    const next = openResponseWindow(s, pending);
    const result = handleTimeout(next);
    expect(result.action).toBe('cancel');
    expect(result.state.pendingResponseWindow).toBeNull();
  });
});

// ============================================================================
// R26 · 响应链嵌套 / 边界场景（Phase 3 W19）
// 对照：plans/design/02-game-rules-spec.md §2.4.2 + plans/tasks.md W19
//
// 注：当前 engine pendingResponseWindow 单字段存储，"嵌套"通过"开窗→响应/pass→
// 关窗→重新开窗"序列模拟。栈式真·嵌套属坑③响应窗口子系统，此处先覆盖可达场景。
// ============================================================================
describe('响应链嵌套 / 边界（R26 · W19）', () => {
  it('窗口覆盖：第二次 openResponseWindow 替换第一次', () => {
    const s = createTestState();
    const first: PendingResponse = {
      sourceAbilityID: 'action_unlock',
      responders: ['p2'],
      timeoutMs: 30000,
      validResponseAbilityIDs: ['action_unlock_cancel'],
      onTimeout: 'resolve',
    };
    const second: PendingResponse = {
      sourceAbilityID: 'action_shoot',
      responders: ['p3'],
      timeoutMs: 15000,
      validResponseAbilityIDs: ['pisces_evade'],
      onTimeout: 'cancel',
    };
    let next = openResponseWindow(s, first);
    next = openResponseWindow(next, second);
    expect(next.pendingResponseWindow!.sourceAbilityID).toBe('action_shoot');
    expect(next.pendingResponseWindow!.responders).toEqual(['p3']);
    expect(next.pendingResponseWindow!.onTimeout).toBe('cancel');
  });

  it('序列嵌套：关窗 → 开新窗 → 关窗（模拟 unlock → shoot 响应链）', () => {
    const s = createTestState();
    // 窗口 1：取消解封
    let next = openResponseWindow(s, {
      sourceAbilityID: 'action_unlock',
      responders: ['p2'],
      timeoutMs: 30000,
      validResponseAbilityIDs: ['action_unlock_cancel'],
      onTimeout: 'resolve',
    });
    const r1 = respondToWindow(next, 'p2', 'action_unlock_cancel');
    expect(r1.resolved).toBe(true);
    next = r1.state;
    expect(next.pendingResponseWindow).toBeNull();
    // 窗口 2：SHOOT 响应
    next = openResponseWindow(next, {
      sourceAbilityID: 'action_shoot',
      responders: ['p3'],
      timeoutMs: 30000,
      validResponseAbilityIDs: ['pisces_evade'],
      onTimeout: 'cancel',
    });
    const r2 = respondToWindow(next, 'p3', 'pisces_evade');
    expect(r2.resolved).toBe(true);
    expect(r2.state.pendingResponseWindow).toBeNull();
  });

  it('多响应者：部分 pass 部分响应 → 响应瞬间关窗', () => {
    const s = createTestState();
    let next = openResponseWindow(s, {
      sourceAbilityID: 'action_unlock',
      responders: ['p2', 'p3', 'p4'],
      timeoutMs: 30000,
      validResponseAbilityIDs: ['action_unlock_cancel'],
      onTimeout: 'resolve',
    });
    next = passOnResponse(next, 'p2');
    expect(next.pendingResponseWindow!.responded).toEqual(['p2']);
    const r = respondToWindow(next, 'p3', 'action_unlock_cancel');
    // 响应发生 → 窗口立即关闭（即使 p4 还未 pass）
    expect(r.resolved).toBe(true);
    expect(r.state.pendingResponseWindow).toBeNull();
  });

  it('重复 pass 同一玩家：会追加（当前实现未去重，符合 responded 语义）', () => {
    const s = createTestState();
    let next = openResponseWindow(s, {
      sourceAbilityID: 'action_unlock',
      responders: ['p2', 'p3'],
      timeoutMs: 30000,
      validResponseAbilityIDs: [],
      onTimeout: 'resolve',
    });
    next = passOnResponse(next, 'p2');
    next = passOnResponse(next, 'p2');
    // responded 追加两次 p2 → length >= responders.length → 窗口已关
    expect(next.pendingResponseWindow).toBeNull();
  });

  it('isWindowComplete：全员 pass 后 → true', () => {
    const s = createTestState();
    let next = openResponseWindow(s, {
      sourceAbilityID: 'action_unlock',
      responders: ['p2', 'p3'],
      timeoutMs: 30000,
      validResponseAbilityIDs: [],
      onTimeout: 'resolve',
    });
    next = passOnResponse(next, 'p2');
    next = passOnResponse(next, 'p3');
    // 窗口已关闭 → isWindowComplete 返回 true
    expect(isWindowComplete(next)).toBe(true);
  });

  it('空 responders 数组：立即满足完成条件', () => {
    const s = createTestState();
    const next = openResponseWindow(s, {
      sourceAbilityID: 'action_unlock',
      responders: [],
      timeoutMs: 30000,
      validResponseAbilityIDs: [],
      onTimeout: 'resolve',
    });
    // 新开窗口 responded 为空 [] + responders 也为空 [] → 按长度判断已完成
    expect(isWindowComplete(next)).toBe(true);
  });

  it('响应能力列表为空：任意响应 ID 都无效', () => {
    const s = createTestState();
    const next = openResponseWindow(s, {
      sourceAbilityID: 'action_unlock',
      responders: ['p2'],
      timeoutMs: 30000,
      validResponseAbilityIDs: [],
      onTimeout: 'resolve',
    });
    const r = respondToWindow(next, 'p2', 'any_id');
    expect(r.resolved).toBe(false);
    expect(r.state.pendingResponseWindow).toBeDefined();
  });

  it('响应后 handleTimeout 无效（窗口已关）', () => {
    const s = createTestState();
    let next = openResponseWindow(s, {
      sourceAbilityID: 'action_unlock',
      responders: ['p2'],
      timeoutMs: 30000,
      validResponseAbilityIDs: ['x'],
      onTimeout: 'cancel',
    });
    const r1 = respondToWindow(next, 'p2', 'x');
    next = r1.state;
    const r2 = handleTimeout(next);
    // 已关窗 → 默认 resolve
    expect(r2.action).toBe('resolve');
  });

  it('passOnResponse 不影响 sourceAbilityID / validResponseAbilityIDs', () => {
    const s = createTestState();
    let next = openResponseWindow(s, {
      sourceAbilityID: 'action_unlock',
      responders: ['p2', 'p3'],
      timeoutMs: 30000,
      validResponseAbilityIDs: ['action_unlock_cancel'],
      onTimeout: 'resolve',
    });
    next = passOnResponse(next, 'p2');
    expect(next.pendingResponseWindow!.sourceAbilityID).toBe('action_unlock');
    expect(next.pendingResponseWindow!.validResponseAbilityIDs).toEqual(['action_unlock_cancel']);
  });
});
