// Invariant Checker - 规则不变量运行时校验
// 对照：plans/design/09-testing-quality.md §9.3.3
//
// 用途：
//   - 在单测 / 集成测试 / Bot 回归中断言 state 仍合规
//   - 生产环境可在关键 Move 后抽样执行
//
// 返回："" 表示无违规；否则返回人类可读违规条目数组。
// 检查项：
//   1. 恰好 1 名梦主（且在 players 里）
//   2. currentPlayerID 必须在 playerOrder 中（除非 phase=setup）
//   3. 所有玩家的 currentLayer 在 [0, 4]（0=迷失层）
//   4. 心锁值非负
//   5. 手牌上限（turnEnd 时 <= HAND_LIMIT）
//   6. 死亡玩家必须有 deathTurn
//   7. isAlive=false 时不应有手牌
//   8. layers[].playersInLayer 与 players[].currentLayer 一致
//   9. 金库：isOpened=true 时必须有 openedBy
//   10. winner 合法（null | 'thief' | 'master'）
//   11. 贿赂池状态一致性（heldBy 非空 iff status='dealt'|'deal'|'shattered'）

import { HAND_LIMIT, LAYER_COUNT } from './config.js';
import type { SetupState } from './setup.js';

export interface InvariantViolation {
  readonly rule: string;
  readonly message: string;
}

/**
 * 纯函数：检查 state 的规则不变量；返回违规条目列表。
 * 空数组 === 无违规。
 */
export function checkInvariants(state: SetupState): InvariantViolation[] {
  const out: InvariantViolation[] = [];
  const push = (rule: string, message: string): void => {
    out.push({ rule, message });
  };

  // ---------- 1. 恰好 1 名梦主 ----------
  const masters = Object.values(state.players).filter((p) => p.faction === 'master');
  if (state.phase !== 'setup') {
    if (masters.length !== 1) {
      push('master_count', `Expected 1 master, got ${masters.length}`);
    }
    if (state.dreamMasterID) {
      const declared = state.players[state.dreamMasterID];
      if (!declared || declared.faction !== 'master') {
        push('master_id', `dreamMasterID=${state.dreamMasterID} not a valid master`);
      }
    }
  }

  // ---------- 2. currentPlayerID 合法 ----------
  if (state.phase === 'playing' && state.currentPlayerID) {
    if (!state.playerOrder.includes(state.currentPlayerID)) {
      push(
        'current_player_in_order',
        `currentPlayerID=${state.currentPlayerID} not in playerOrder`,
      );
    }
    if (!state.players[state.currentPlayerID]) {
      push('current_player_exists', `currentPlayerID=${state.currentPlayerID} has no player entry`);
    }
  }

  // ---------- 3. currentLayer 范围 ----------
  for (const p of Object.values(state.players)) {
    if (p.currentLayer < 0 || p.currentLayer > LAYER_COUNT) {
      push('layer_range', `Player ${p.id} layer=${p.currentLayer} out of [0, ${LAYER_COUNT}]`);
    }
  }

  // ---------- 4. 心锁非负 ----------
  for (const [num, layer] of Object.entries(state.layers)) {
    if (layer.heartLockValue < 0) {
      push('heart_lock_non_negative', `Layer ${num} heartLockValue=${layer.heartLockValue}`);
    }
  }

  // ---------- 5. 手牌上限（turnEnd 时） ----------
  if (state.turnPhase === 'turnEnd') {
    for (const p of Object.values(state.players)) {
      if (p.isAlive && p.hand.length > HAND_LIMIT) {
        push('hand_limit', `Player ${p.id} hand=${p.hand.length} > ${HAND_LIMIT} at turnEnd`);
      }
    }
  }

  // ---------- 6. 死亡玩家必须有 deathTurn ----------
  for (const p of Object.values(state.players)) {
    if (!p.isAlive && p.deathTurn === null) {
      push('dead_needs_death_turn', `Player ${p.id} isAlive=false but deathTurn=null`);
    }
    if (p.isAlive && p.deathTurn !== null) {
      push('alive_no_death_turn', `Player ${p.id} isAlive=true but deathTurn=${p.deathTurn}`);
    }
  }

  // ---------- 7. 死亡玩家不应有手牌 ----------
  for (const p of Object.values(state.players)) {
    if (!p.isAlive && p.hand.length > 0) {
      push('dead_no_hand', `Player ${p.id} is dead but hand=${p.hand.length}`);
    }
  }

  // ---------- 8. layer.playersInLayer 与 player.currentLayer 一致 ----------
  for (const p of Object.values(state.players)) {
    if (!p.isAlive) continue;
    const targetLayer = state.layers[p.currentLayer];
    if (targetLayer && !targetLayer.playersInLayer.includes(p.id)) {
      push(
        'layer_membership',
        `Player ${p.id} currentLayer=${p.currentLayer} but not in layer.playersInLayer`,
      );
    }
  }
  // 反向：layer 里列出的玩家必须 currentLayer 一致
  for (const [numStr, layer] of Object.entries(state.layers)) {
    const layerNum = Number(numStr);
    for (const pid of layer.playersInLayer) {
      const p = state.players[pid];
      if (p && p.isAlive && p.currentLayer !== layerNum) {
        push(
          'layer_membership_reverse',
          `Layer ${layerNum} lists ${pid} but player.currentLayer=${p.currentLayer}`,
        );
      }
    }
  }

  // ---------- 9. 金库 openedBy 一致性 ----------
  for (const v of state.vaults) {
    if (v.isOpened && !v.openedBy) {
      push('vault_opened_by', `Vault ${v.id} isOpened=true but openedBy=null`);
    }
    if (!v.isOpened && v.openedBy) {
      push('vault_not_opened_but_by', `Vault ${v.id} isOpened=false but openedBy=${v.openedBy}`);
    }
  }

  // ---------- 10. winner 合法 ----------
  if (state.winner !== null && state.winner !== 'thief' && state.winner !== 'master') {
    push('winner_value', `winner=${JSON.stringify(state.winner)} not in {null,'thief','master'}`);
  }

  // ---------- 11. 贿赂池状态 ----------
  for (const b of state.bribePool) {
    if (b.status === 'inPool' && b.heldBy !== null) {
      push('bribe_in_pool', `Bribe ${b.id} inPool but heldBy=${b.heldBy}`);
    }
    if ((b.status === 'dealt' || b.status === 'deal') && !b.heldBy) {
      push('bribe_held_required', `Bribe ${b.id} status=${b.status} but no heldBy`);
    }
  }

  // ---------- 12. pending 状态引用完整性 ----------
  if (state.pendingGraft) {
    if (!state.players[state.pendingGraft.playerID]) {
      push(
        'pending_graft_ref',
        `pendingGraft.playerID=${state.pendingGraft.playerID} not in players`,
      );
    }
  }
  if (state.pendingResonance) {
    const { bonderPlayerID, targetPlayerID } = state.pendingResonance;
    if (!state.players[bonderPlayerID]) {
      push('pending_resonance_bonder', `bonderPlayerID=${bonderPlayerID} not in players`);
    }
    if (!state.players[targetPlayerID]) {
      push('pending_resonance_target', `targetPlayerID=${targetPlayerID} not in players`);
    }
  }
  if (state.pendingGravity) {
    const pg = state.pendingGravity;
    if (!state.players[pg.bonderPlayerID]) {
      push('pending_gravity_bonder', `bonderPlayerID=${pg.bonderPlayerID} not in players`);
    }
    for (const pid of pg.pickOrder) {
      if (!state.players[pid]) {
        push('pending_gravity_pickorder', `pickOrder has non-existent player ${pid}`);
      }
    }
    if (pg.pickCursor < 0 || pg.pickCursor > pg.pickOrder.length * 100) {
      push('pending_gravity_cursor', `pickCursor=${pg.pickCursor} out of sane range`);
    }
  }
  if (state.shiftSnapshot) {
    for (const pid of Object.keys(state.shiftSnapshot)) {
      if (!state.players[pid]) {
        push('shift_snapshot_ref', `shiftSnapshot has non-existent player ${pid}`);
      }
    }
  }

  return out;
}

/** 便捷：只要有任意违规就 throw（给严格测试模式用） */
export function assertInvariants(state: SetupState): void {
  const v = checkInvariants(state);
  if (v.length > 0) {
    const lines = v.map((x) => `  - [${x.rule}] ${x.message}`).join('\n');
    throw new Error(`Invariant violations:\n${lines}`);
  }
}
