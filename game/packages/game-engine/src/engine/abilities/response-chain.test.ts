// 响应链框架测试

import { describe, it, expect } from 'vitest';
import { openResponseWindow, passOnResponse, respondToWindow } from './response-chain.js';
import type { PendingResponse } from './types.js';
import type { SetupState } from '../../setup.js';
import { createTestState } from '../../testing/fixtures.js';

/** 响应窗口栈深度：0 = 无窗口；1 = 单窗口；2+ = 嵌套 */
function windowDepth(state: SetupState): number {
  let depth = 0;
  let cur = state.pendingResponseWindow;
  while (cur) {
    depth += 1;
    cur = cur.parentWindow ?? null;
  }
  return depth;
}

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

  // sourceType metadata
  it('透传 sourceType 到 ResponseWindowState', () => {
    const s = createTestState();
    const next = openResponseWindow(s, {
      sourceAbilityID: 'action_unlock_effect_1',
      sourceType: 'unlock',
      responders: ['p2'],
      timeoutMs: 30000,
      validResponseAbilityIDs: [],
      onTimeout: 'resolve',
    });
    expect(next.pendingResponseWindow!.sourceType).toBe('unlock');
  });

  it('未设置 sourceType 时窗口上也没有 sourceType（向后兼容）', () => {
    const s = createTestState();
    const next = openResponseWindow(s, {
      sourceAbilityID: 'legacy_source',
      responders: ['p2'],
      timeoutMs: 30000,
      validResponseAbilityIDs: [],
      onTimeout: 'resolve',
    });
    expect(next.pendingResponseWindow!.sourceType).toBeUndefined();
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

// ============================================================================
// 响应链嵌套 / 边界场景
//
// 栈式真·嵌套（响应窗口子系统 · parentWindow 链表）：
// 当已有活跃窗口时再开新窗口 → 新窗口入栈顶，旧窗口保留为 parentWindow；
// 新窗口关闭（响应/全员 pass/超时）时自动回退到 parentWindow。
// ============================================================================
describe('响应链嵌套 / 边界', () => {
  it('栈式入栈：第二次 openResponseWindow 将第一次挂为 parentWindow', () => {
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
    // 栈顶是 action_shoot
    expect(next.pendingResponseWindow!.sourceAbilityID).toBe('action_shoot');
    expect(next.pendingResponseWindow!.responders).toEqual(['p3']);
    expect(next.pendingResponseWindow!.onTimeout).toBe('cancel');
    // 父窗口保留 action_unlock
    expect(next.pendingResponseWindow!.parentWindow).toBeDefined();
    expect(next.pendingResponseWindow!.parentWindow!.sourceAbilityID).toBe('action_unlock');
    expect(next.pendingResponseWindow!.parentWindow!.responders).toEqual(['p2']);
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

// ============================================================================
// 栈式真·嵌套（响应窗口子系统）
//
// 覆盖：深度 / 父窗口 / 内层关闭自动回退外层 / 多级 pass 回传 /
//       取消解封中嵌套 SHOOT 响应 / 跨嵌套层独立计数
// ============================================================================
describe('响应链栈式嵌套', () => {
  it('栈深度：空状态返回 0，单窗口返回 1，嵌套返回栈深', () => {
    let s = createTestState();
    expect(windowDepth(s)).toBe(0);

    s = openResponseWindow(s, {
      sourceAbilityID: 'action_unlock',
      responders: ['p2'],
      timeoutMs: 30000,
      validResponseAbilityIDs: ['action_unlock_cancel'],
      onTimeout: 'resolve',
    });
    expect(windowDepth(s)).toBe(1);

    s = openResponseWindow(s, {
      sourceAbilityID: 'action_shoot',
      responders: ['p3'],
      timeoutMs: 30000,
      validResponseAbilityIDs: ['pisces_evade'],
      onTimeout: 'cancel',
    });
    expect(windowDepth(s)).toBe(2);

    s = openResponseWindow(s, {
      sourceAbilityID: 'action_graft',
      responders: ['p4'],
      timeoutMs: 30000,
      validResponseAbilityIDs: [],
      onTimeout: 'resolve',
    });
    expect(windowDepth(s)).toBe(3);
  });

  it('栈顶与父层：新窗口在栈顶，旧窗口保留为 parentWindow', () => {
    let s = createTestState();
    s = openResponseWindow(s, {
      sourceAbilityID: 'action_unlock',
      responders: ['p2'],
      timeoutMs: 30000,
      validResponseAbilityIDs: ['action_unlock_cancel'],
      onTimeout: 'resolve',
    });
    s = openResponseWindow(s, {
      sourceAbilityID: 'action_shoot',
      responders: ['p3'],
      timeoutMs: 30000,
      validResponseAbilityIDs: ['pisces_evade'],
      onTimeout: 'cancel',
    });
    expect(s.pendingResponseWindow!.sourceAbilityID).toBe('action_shoot');
    expect(s.pendingResponseWindow!.parentWindow!.sourceAbilityID).toBe('action_unlock');
  });

  it('内层响应关闭 → 自动回退到外层 parentWindow', () => {
    let s = createTestState();
    // 外层：取消解封
    s = openResponseWindow(s, {
      sourceAbilityID: 'action_unlock',
      responders: ['p2'],
      timeoutMs: 30000,
      validResponseAbilityIDs: ['action_unlock_cancel'],
      onTimeout: 'resolve',
    });
    // 内层：SHOOT 响应（嵌套在外层未关闭时）
    s = openResponseWindow(s, {
      sourceAbilityID: 'action_shoot',
      responders: ['p3'],
      timeoutMs: 30000,
      validResponseAbilityIDs: ['pisces_evade'],
      onTimeout: 'cancel',
    });
    expect(windowDepth(s)).toBe(2);
    // 内层响应 → 栈回退
    const r = respondToWindow(s, 'p3', 'pisces_evade');
    expect(r.resolved).toBe(true);
    expect(windowDepth(r.state)).toBe(1);
    expect(r.state.pendingResponseWindow!.sourceAbilityID).toBe('action_unlock');
    expect(r.state.pendingResponseWindow!.responders).toEqual(['p2']);
  });

  it('内层全员 pass → 自动回退到外层（responded 状态随栈帧独立）', () => {
    let s = createTestState();
    s = openResponseWindow(s, {
      sourceAbilityID: 'action_unlock',
      responders: ['p2', 'p4'],
      timeoutMs: 30000,
      validResponseAbilityIDs: ['action_unlock_cancel'],
      onTimeout: 'resolve',
    });
    // 外层 p2 先 pass（栈帧内状态）
    s = passOnResponse(s, 'p2');
    expect(s.pendingResponseWindow!.responded).toEqual(['p2']);
    // 嵌套开内层
    s = openResponseWindow(s, {
      sourceAbilityID: 'action_shoot',
      responders: ['p3'],
      timeoutMs: 30000,
      validResponseAbilityIDs: [],
      onTimeout: 'resolve',
    });
    // 内层 p3 pass → 内层关闭 → 回退外层
    s = passOnResponse(s, 'p3');
    expect(windowDepth(s)).toBe(1);
    expect(s.pendingResponseWindow!.sourceAbilityID).toBe('action_unlock');
    // 外层 responded 状态保留（p2 已 pass）
    expect(s.pendingResponseWindow!.responded).toEqual(['p2']);
    // 外层 p4 再 pass → 栈清空
    s = passOnResponse(s, 'p4');
    expect(windowDepth(s)).toBe(0);
    expect(s.pendingResponseWindow).toBeNull();
  });

  it('取消解封嵌套 SHOOT 响应场景：外层 cancel 内层响应，两层各自走完', () => {
    let s = createTestState();
    // 外层：解封 → p2/p3 有取消权
    s = openResponseWindow(s, {
      sourceAbilityID: 'action_unlock',
      responders: ['p2', 'p3'],
      timeoutMs: 30000,
      validResponseAbilityIDs: ['action_unlock_cancel'],
      onTimeout: 'resolve',
    });
    // 外层 p2 发动"取消解封"过程中，触发嵌套 SHOOT 响应
    s = openResponseWindow(s, {
      sourceAbilityID: 'action_shoot',
      responders: ['p4'],
      timeoutMs: 30000,
      validResponseAbilityIDs: ['pisces_evade'],
      onTimeout: 'cancel',
    });
    // 内层 p4 pisces_evade 响应 → 内层 cancel → 回退外层
    const r1 = respondToWindow(s, 'p4', 'pisces_evade');
    expect(r1.resolved).toBe(true);
    s = r1.state;
    expect(s.pendingResponseWindow!.sourceAbilityID).toBe('action_unlock');
    // 外层 p2 真正 action_unlock_cancel → 外层 cancel → 栈空
    const r2 = respondToWindow(s, 'p2', 'action_unlock_cancel');
    expect(r2.resolved).toBe(true);
    expect(r2.state.pendingResponseWindow).toBeNull();
  });

  it('三层嵌套：开 3 层后依次关闭 → 深度 3 → 2 → 1 → 0', () => {
    let s = createTestState();
    for (const id of ['action_unlock', 'action_shoot', 'action_graft']) {
      s = openResponseWindow(s, {
        sourceAbilityID: id,
        responders: ['px'],
        timeoutMs: 30000,
        validResponseAbilityIDs: ['r'],
        onTimeout: 'resolve',
      });
    }
    expect(windowDepth(s)).toBe(3);
    s = respondToWindow(s, 'px', 'r').state;
    expect(windowDepth(s)).toBe(2);
    s = respondToWindow(s, 'px', 'r').state;
    expect(windowDepth(s)).toBe(1);
    s = respondToWindow(s, 'px', 'r').state;
    expect(windowDepth(s)).toBe(0);
    expect(s.pendingResponseWindow).toBeNull();
  });

  it('栈底标记：最外层 parentWindow 为 null/undefined', () => {
    let s = createTestState();
    s = openResponseWindow(s, {
      sourceAbilityID: 'action_unlock',
      responders: ['p2'],
      timeoutMs: 30000,
      validResponseAbilityIDs: [],
      onTimeout: 'resolve',
    });
    expect(s.pendingResponseWindow!.parentWindow ?? null).toBeNull();
  });
});
