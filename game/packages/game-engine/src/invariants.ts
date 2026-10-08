// Invariant Checker - 规则不变量运行时校验
//
// 用途：
//   - 在单测 / 集成测试 / Bot 回归中断言 state 仍合规
//   - 生产环境可在关键 Move 后抽样执行
//
// 返回："" 表示无违规；否则返回人类可读违规条目数组。
// 检查项：
//   1. dreamMasterID 指向的玩家存在且为梦主阵营；其余梦主阵营玩家（背叛者）必须持有成功的贿赂牌
//   2. currentPlayerID 必须在 playerOrder 中（除非 phase=setup）
//   3. 所有玩家的 currentLayer 在 [0, 4]（0=迷失层）
//   4. 心锁值非负
//   5. 手牌上限（turnEnd 时 <= 手牌上限；巨蟹·庇佑之下不限）
//   6. 死亡玩家必须有 deathTurn
//   7. （已删除：死亡玩家可以持有手牌）
//   8. layers[].playersInLayer 与 players[].currentLayer 一致
//   9. 金库：isOpened=true 时必须有 openedBy
//   10. winner 合法（null | 'thief' | 'master'）
//   11. 贿赂池状态一致性（heldBy 非空 iff status='dealt'|'deal'|'shattered'）

import { LAYER_COUNT } from './config.js';
import { getHandLimit } from './engine/limits.js';
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

  // ---------- 1. 梦主身份 ----------
  // 梦主以 dreamMasterID 为准；盗梦者抽到成功的贿赂牌后 faction 也会变成 master（背叛者），
  // 所以不能数 faction。其余 master 阵营的玩家必须持有一张成功的贿赂牌。
  // 对照：docs/manual/03-game-flow.md 贿赂&背叛者
  if (state.phase !== 'setup') {
    const declared = state.dreamMasterID ? state.players[state.dreamMasterID] : undefined;
    if (!declared || declared.faction !== 'master') {
      push('master_id', `dreamMasterID=${state.dreamMasterID} not a valid master`);
    }
    for (const p of Object.values(state.players)) {
      if (p.id === state.dreamMasterID || p.faction !== 'master') continue;
      const holdsDeal = state.bribePool.some((b) => b.heldBy === p.id && b.kind === 'deal');
      if (!holdsDeal) {
        push(
          'betrayer_without_deal',
          `Player ${p.id} is on the master faction without holding a successful bribe`,
        );
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

  // ---------- 5. 手牌上限（turnEnd 时；巨蟹·庇佑之下没有上限） ----------
  if (state.turnPhase === 'turnEnd') {
    for (const p of Object.values(state.players)) {
      const limit = getHandLimit(state, p.id);
      if (p.isAlive && limit !== null && p.hand.length > limit) {
        push('hand_limit', `Player ${p.id} hand=${p.hand.length} > ${limit} at turnEnd`);
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

  // 7. 已删除：死亡玩家可以持有手牌——被击杀只交 2 张，非击杀进入迷失层手牌全留，
  //    复活还要从手里弃 2 张（对照：docs/manual/03-game-flow.md 死亡 / 复活）

  // ---------- 8. layer.playersInLayer 与 player.currentLayer 一致 ----------
  // 死亡玩家也要查：他们在迷失层（0）的名单里，进出迷失层漏改名单会从这里暴露
  for (const p of Object.values(state.players)) {
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
      if (p && p.currentLayer !== layerNum) {
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

  // ---------- 13. pendingUnlock 引用完整性 ----------
  if (state.pendingUnlock) {
    const { playerID, layer } = state.pendingUnlock;
    if (!state.players[playerID]) {
      push('pending_unlock_ref', `pendingUnlock.playerID=${playerID} not in players`);
    }
    if (!state.layers[layer]) {
      push('pending_unlock_layer', `pendingUnlock.layer=${layer} not a valid layer`);
    }
  }

  // ---------- 14. 黑洞·吞噬的交牌等待 ----------
  // 黑洞是回合主人、仍在抽牌阶段；名单里的人不重复、不含黑洞、与黑洞同层、存活且手里还有牌
  const levy = state.pendingBlackHoleLevy;
  if (levy) {
    const holder = state.players[levy.blackHoleID];
    if (levy.blackHoleID !== state.currentPlayerID || state.turnPhase !== 'draw') {
      push('pending_levy_turn', `黑洞 ${levy.blackHoleID} 的吞噬只能挂在其抽牌阶段`);
    }
    if (!holder || !holder.isAlive || holder.characterId !== 'thief_black_hole') {
      push(
        'pending_levy_holder',
        `pendingBlackHoleLevy.blackHoleID=${levy.blackHoleID} 不是存活的黑洞`,
      );
    }
    if (new Set(levy.waiting).size !== levy.waiting.length) {
      push('pending_levy_duplicate', 'pendingBlackHoleLevy.waiting 有重复的玩家');
    }
    for (const id of levy.waiting) {
      const giver = state.players[id];
      if (id === levy.blackHoleID || !giver) {
        push('pending_levy_waiting', `waiting 里的 ${id} 不是黑洞以外的玩家`);
        continue;
      }
      if (!giver.isAlive || !holder || giver.currentLayer !== holder.currentLayer) {
        push('pending_levy_layer', `waiting 里的 ${id} 不是黑洞同层的存活玩家`);
      }
      if (giver.hand.length === 0) {
        push('pending_levy_hand', `waiting 里的 ${id} 没有手牌，不应继续等待`);
      }
    }
    if (levy.waiting.length === 0) {
      push('pending_levy_empty', '名单已空的吞噬应当已经结算并清除');
    }
  }

  // ---------- 15. 达尔文·淘汰的选牌等待 ----------
  // 达尔文是回合主人、处于出牌阶段、存活，且手里至少有要放回的 2 张
  const darwin = state.pendingDarwinReturn;
  if (darwin) {
    const owner = state.players[darwin.playerID];
    if (darwin.playerID !== state.currentPlayerID || state.turnPhase !== 'action') {
      push('pending_darwin_turn', `达尔文 ${darwin.playerID} 的淘汰只能挂在其出牌阶段`);
    }
    if (!owner || !owner.isAlive || owner.characterId !== 'thief_darwin') {
      push(
        'pending_darwin_owner',
        `pendingDarwinReturn.playerID=${darwin.playerID} 不是存活的达尔文`,
      );
    } else if (owner.hand.length < 2) {
      push('pending_darwin_hand', `达尔文手牌不足 2 张（${owner.hand.length}），无法放回`);
    }
  }

  // ---------- 16. 雅典娜·急智的应答等待 ----------
  // 出牌者是回合主人、在出牌阶段；雅典娜存活、与出牌者同层且不是同一个人
  const wit = state.pendingAthenaWit;
  if (wit) {
    const athena = state.players[wit.athenaID];
    const user = state.players[wit.userID];
    if (wit.userID !== state.currentPlayerID || state.turnPhase !== 'action') {
      push('pending_wit_turn', `雅典娜的急智应答只能挂在出牌者 ${wit.userID} 的出牌阶段`);
    }
    if (!athena || !athena.isAlive || athena.characterId !== 'thief_athena') {
      push('pending_wit_athena', `pendingAthenaWit.athenaID=${wit.athenaID} 不是存活的雅典娜`);
    }
    if (wit.athenaID === wit.userID) {
      push('pending_wit_self', '急智只在「另一」玩家对雅典娜用牌时触发');
    }
    if (athena && user && athena.currentLayer !== user.currentLayer) {
      push('pending_wit_layer', '急智只在同层玩家对雅典娜用牌时触发');
    }
    if (wit.userID === state.dreamMasterID) {
      push('pending_wit_master', '急智只在盗梦者对雅典娜用牌时触发，出牌者不应是梦主');
    }
  }

  // ---------- 17. 土星·律令的应答等待 ----------
  // 出牌者是回合主人、在出牌阶段、不是梦主；等的是存活的土星梦主；被打出的牌还在出牌者手里（尚未离手）
  const decree = state.pendingSaturnDecree;
  if (decree) {
    const master = state.players[decree.masterID];
    const user = state.players[decree.userID];
    if (decree.userID !== state.currentPlayerID || state.turnPhase !== 'action') {
      push('pending_decree_turn', `律令的应答只能挂在出牌者 ${decree.userID} 的出牌阶段`);
    }
    if (decree.masterID !== state.dreamMasterID) {
      push('pending_decree_master', `pendingSaturnDecree.masterID=${decree.masterID} 不是梦主`);
    }
    if (!master || !master.isAlive || master.characterId !== 'dm_saturn_territory') {
      push('pending_decree_saturn', `梦主 ${decree.masterID} 不是存活的土星·领地`);
    }
    if (decree.userID === state.dreamMasterID) {
      push('pending_decree_user', '律令只针对其他玩家打出的牌，出牌者不应是梦主');
    }
    if (user && !user.hand.includes(decree.cardId)) {
      push('pending_decree_card', `被打出的 ${decree.cardId} 应当还在出牌者 ${decree.userID} 手里`);
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
