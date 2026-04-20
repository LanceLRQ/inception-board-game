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
