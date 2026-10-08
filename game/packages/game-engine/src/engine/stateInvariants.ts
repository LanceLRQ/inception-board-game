// 对局状态的类型与取值范围检查
//
// 只查「状态里每个位置放的值对不对」：玩家 id 是不是对局里的人、牌 id 是不是字符串、
// 层号和计数是不是该有的整数……规则层面的一致性（手牌上限等）是 invariants.ts 的事。
// 唯一的例外是迷失层这一组跨字段关系：在迷失层与已死亡是同一个状态，层内名单与玩家所在层互为镜像；
// 它们写进每步校验，是为了让「只挪层不置死亡」这类漏写立刻暴露。
// 这里的输入按「可能被写坏」对待：不假定任何字段类型正确，也不会因为坏值而抛异常，
// 所以可以放心地对任意 move 之后的状态调用。

const LAYER_MAX = 4;
const MAX_WINDOW_DEPTH = 8;
const FACTIONS: readonly string[] = ['thief', 'master'];
/** 改写 SHOOT 结算的技能来源（与 setup.ts 的 ShootSkillSource 一致；本文件不引用其他模块，值在此重列） */
const SHOOT_SKILL_SOURCES: readonly string[] = [
  'sudger_verdict',
  'haley_impact',
  'fortress_coldness',
];
/** 其中没有实体牌的来源（与 setup.ts 的 CARDLESS_SHOOT_SKILLS 一致） */
const CARDLESS_SHOOT_SKILL_SOURCES: readonly string[] = ['haley_impact', 'fortress_coldness'];

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

class Collector {
  readonly issues: string[] = [];
  readonly playerIds: ReadonlySet<string>;

  constructor(playerIds: ReadonlySet<string>) {
    this.playerIds = playerIds;
  }

  add(path: string, message: string): void {
    this.issues.push(`${path}: ${message}`);
  }

  /** 玩家 id：必须是 playerOrder 里的字符串 */
  player(path: string, value: unknown): void {
    if (typeof value !== 'string' || !this.playerIds.has(value)) {
      this.add(path, `不是对局里的玩家 id（${describe(value)}）`);
    }
  }

  playerOrNull(path: string, value: unknown): void {
    if (value !== null) this.player(path, value);
  }

  card(path: string, value: unknown): void {
    if (typeof value !== 'string') this.add(path, `牌 id 必须是字符串（${describe(value)}）`);
  }

  cardOrNull(path: string, value: unknown): void {
    if (value !== null) this.card(path, value);
  }

  /** 数组本身必须是数组，且没有空位 */
  array(path: string, value: unknown): value is unknown[] {
    if (!Array.isArray(value)) {
      this.add(path, `必须是数组（${describe(value)}）`);
      return false;
    }
    for (let i = 0; i < value.length; i++) {
      if (!(i in value)) this.add(`${path}[${i}]`, '数组有空位');
    }
    return true;
  }

  cards(path: string, value: unknown): void {
    if (!this.array(path, value)) return;
    value.forEach((item, i) => this.card(`${path}[${i}]`, item));
  }

  players(path: string, value: unknown): void {
    if (!this.array(path, value)) return;
    value.forEach((item, i) => this.player(`${path}[${i}]`, item));
  }

  strings(path: string, value: unknown): void {
    if (!this.array(path, value)) return;
    value.forEach((item, i) => {
      if (typeof item !== 'string') this.add(`${path}[${i}]`, `必须是字符串（${describe(item)}）`);
    });
  }

  nonNegInt(path: string, value: unknown): void {
    if (!isNonNegInt(value)) this.add(path, `必须是非负整数（${describe(value)}）`);
  }

  layer(path: string, value: unknown): void {
    if (!isNonNegInt(value) || value > LAYER_MAX) {
      this.add(path, `层号必须是 0-${LAYER_MAX} 的整数（${describe(value)}）`);
    }
  }

  bool(path: string, value: unknown): void {
    if (typeof value !== 'boolean') this.add(path, `必须是布尔值（${describe(value)}）`);
  }

  oneOf(path: string, value: unknown, allowed: readonly string[]): void {
    if (typeof value !== 'string' || !allowed.includes(value)) {
      this.add(path, `取值不在 ${allowed.join('/')} 之内（${describe(value)}）`);
    }
  }

  rec(path: string, value: unknown): value is Rec {
    if (!isRec(value)) {
      this.add(path, `必须是对象（${describe(value)}）`);
      return false;
    }
    return true;
  }

  /** 可空的待结算对象：null / undefined 表示没有 */
  optional(path: string, value: unknown, check: (obj: Rec) => void): void {
    if (value === null || value === undefined) return;
    if (this.rec(path, value)) check(value);
  }
}

function describe(value: unknown): string {
  if (typeof value === 'string')
    return JSON.stringify(value.length > 24 ? `${value.slice(0, 24)}…` : value);
  if (Array.isArray(value)) return `数组[${value.length}]`;
  if (typeof value === 'object' && value !== null) return '对象';
  return String(value);
}

/**
 * 检查对局状态里每个位置的值类型与取值范围，返回违规描述；空数组表示通过。
 * 纯函数，对任意输入都不抛异常。
 */
export function checkStateInvariants(G: unknown): string[] {
  if (!isRec(G)) return ['G: 必须是对象'];

  const order = G.playerOrder;
  const orderIds =
    Array.isArray(order) && order.length > 0 && order.every((id) => typeof id === 'string')
      ? (order as string[])
      : null;
  if (orderIds === null) return ['playerOrder: 必须是非空的字符串数组'];
  const c = new Collector(new Set(orderIds));
  if (c.playerIds.size !== orderIds.length) c.add('playerOrder', '有重复的玩家 id');

  const isSetup = G.phase === 'setup';
  c.oneOf('phase', G.phase, ['setup', 'playing', 'endgame']);
  c.oneOf('turnPhase', G.turnPhase, ['turnStart', 'draw', 'action', 'discard', 'turnEnd']);
  if (!isSetup) {
    c.player('currentPlayerID', G.currentPlayerID);
    c.player('dreamMasterID', G.dreamMasterID);
  }
  for (const key of ['turnNumber', 'unlockThisTurn', 'maxUnlockPerTurn', 'moveCounter']) {
    c.nonNegInt(key, G[key]);
  }
  if (G.endTurn !== null) c.nonNegInt('endTurn', G.endTurn);
  if (G.winner !== null) c.oneOf('winner', G.winner, FACTIONS);
  if (G.lastShootRoll !== null) {
    const roll = G.lastShootRoll;
    if (!isNonNegInt(roll) || roll < 1 || roll > 6) {
      c.add('lastShootRoll', `必须是 1-6 的整数或 null（${describe(roll)}）`);
    }
  }

  checkPlayers(c, G, orderIds);
  checkLayers(c, G.layers);
  checkLimboAndRosters(c, G);
  checkVaultsAndBribes(c, G);
  checkCards(c, G);
  checkPending(c, G);
  return c.issues;
}

function checkPlayers(c: Collector, G: Rec, orderIds: readonly string[]): void {
  if (!c.rec('players', G.players)) return;
  const keys = Object.keys(G.players);
  if (
    keys.length !== orderIds.length ||
    !orderIds.every((id) => Object.hasOwn(G.players as Rec, id))
  ) {
    c.add('players', '键集合与 playerOrder 不一致');
  }
  for (const key of keys) {
    const p = (G.players as Rec)[key];
    const at = `players.${key}`;
    if (!c.rec(at, p)) continue;
    if (p.id !== key) c.add(`${at}.id`, `与键不一致（${describe(p.id)}）`);
    c.oneOf(`${at}.faction`, p.faction, FACTIONS);
    c.card(`${at}.characterId`, p.characterId);
    c.cards(`${at}.hand`, p.hand);
    c.layer(`${at}.currentLayer`, p.currentLayer);
    c.bool(`${at}.isAlive`, p.isAlive);
    c.bool(`${at}.isRevealed`, p.isRevealed);
    if (p.deathTurn !== null) c.nonNegInt(`${at}.deathTurn`, p.deathTurn);
    if (p.layerBeforeLimbo !== null && p.layerBeforeLimbo !== undefined) {
      c.layer(`${at}.layerBeforeLimbo`, p.layerBeforeLimbo);
    }
    if (p.imperialShootCharges !== undefined) {
      c.nonNegInt(`${at}.imperialShootCharges`, p.imperialShootCharges);
    }
    for (const field of [
      'unlockCount',
      'shootCount',
      'bribeReceived',
      'successfulUnlocksThisTurn',
    ]) {
      c.nonNegInt(`${at}.${field}`, p[field]);
    }
    for (const field of ['skillUsedThisTurn', 'skillUsedThisGame']) {
      if (!c.rec(`${at}.${field}`, p[field])) continue;
      for (const [skill, count] of Object.entries(p[field] as Rec)) {
        c.nonNegInt(`${at}.${field}.${skill}`, count);
      }
    }
    const armed = p.forcedDiscardArmedAtTurn;
    if (armed !== null && armed !== undefined) c.nonNegInt(`${at}.forcedDiscardArmedAtTurn`, armed);
  }
}

function checkLayers(c: Collector, layers: unknown): void {
  if (!c.rec('layers', layers)) return;
  for (const [key, layer] of Object.entries(layers)) {
    const at = `layers.${key}`;
    c.layer(`${at}(键)`, Number(key));
    if (!c.rec(at, layer)) continue;
    c.players(`${at}.playersInLayer`, layer.playersInLayer);
    // 迷失层（0）没有梦境层卡与心锁，条目里只记层内名单
    if (key === '0') continue;
    c.layer(`${at}.layer`, layer.layer);
    c.nonNegInt(`${at}.heartLockValue`, layer.heartLockValue);
    c.cardOrNull(`${at}.dreamCardId`, layer.dreamCardId);
    c.cardOrNull(`${at}.nightmareId`, layer.nightmareId);
    c.bool(`${at}.nightmareRevealed`, layer.nightmareRevealed);
    c.bool(`${at}.nightmareTriggered`, layer.nightmareTriggered);
  }
}

/**
 * 迷失层（currentLayer 为 0）当且仅当已死亡（isAlive 为 false）；
 * 层内名单与各玩家的 currentLayer 互为镜像（没有迷失层条目时，迷失层的人没有名单可查，跳过）。
 * 对照：docs/manual/08-appendix.md 迷失层「表示玩家正处于死亡状态」
 */
function checkLimboAndRosters(c: Collector, G: Rec): void {
  if (!isRec(G.players) || !isRec(G.layers)) return;
  const players = G.players;
  const layers = G.layers;
  for (const [id, p] of Object.entries(players)) {
    if (!isRec(p) || typeof p.isAlive !== 'boolean' || !isNonNegInt(p.currentLayer)) continue;
    const inLimbo = p.currentLayer === 0;
    if (inLimbo !== !p.isAlive) {
      c.add(
        `players.${id}`,
        inLimbo
          ? '在迷失层（currentLayer=0）但 isAlive 为 true'
          : '已死亡（isAlive=false）但不在迷失层',
      );
    }
    const roster = isRec(layers[String(p.currentLayer)])
      ? (layers[String(p.currentLayer)] as Rec).playersInLayer
      : undefined;
    if (Array.isArray(roster) && !roster.includes(id)) {
      c.add(
        `layers.${p.currentLayer}.playersInLayer`,
        `缺少所在层为 ${p.currentLayer} 的玩家 ${JSON.stringify(id)}`,
      );
    }
  }
  for (const [key, layer] of Object.entries(layers)) {
    if (!isRec(layer) || !Array.isArray(layer.playersInLayer)) continue;
    for (const id of layer.playersInLayer) {
      const p = typeof id === 'string' ? players[id] : undefined;
      if (isRec(p) && String(p.currentLayer) !== key) {
        c.add(
          `layers.${key}.playersInLayer`,
          `列出了 ${JSON.stringify(id)}，其 currentLayer 是 ${describe(p.currentLayer)}`,
        );
      }
    }
  }
}

function checkVaultsAndBribes(c: Collector, G: Rec): void {
  if (c.array('vaults', G.vaults)) {
    (G.vaults as unknown[]).forEach((vault, i) => {
      const at = `vaults[${i}]`;
      if (!c.rec(at, vault)) return;
      c.layer(`${at}.layer`, vault.layer);
      c.oneOf(`${at}.contentType`, vault.contentType, ['secret', 'coin', 'empty']);
      c.bool(`${at}.isOpened`, vault.isOpened);
      c.playerOrNull(`${at}.openedBy`, vault.openedBy);
    });
  }
  if (c.array('bribePool', G.bribePool)) {
    (G.bribePool as unknown[]).forEach((bribe, i) => {
      const at = `bribePool[${i}]`;
      if (!c.rec(at, bribe)) return;
      c.oneOf(`${at}.kind`, bribe.kind, ['deal', 'fail']);
      c.oneOf(`${at}.status`, bribe.status, ['inPool', 'dealt', 'deal', 'shattered']);
      c.playerOrNull(`${at}.heldBy`, bribe.heldBy);
      c.playerOrNull(`${at}.originalOwnerId`, bribe.originalOwnerId);
    });
  }
}

function checkCards(c: Collector, G: Rec): void {
  if (c.rec('deck', G.deck)) {
    c.cards('deck.cards', G.deck.cards);
    c.cards('deck.discardPile', G.deck.discardPile);
  }
  c.cards('removedFromGame', G.removedFromGame);
  c.cards('playedCardsThisTurn', G.playedCardsThisTurn);
  c.cardOrNull('lastPlayedCardThisTurn', G.lastPlayedCardThisTurn);
  c.cards('usedNightmareIds', G.usedNightmareIds);
  c.cards('activeWorldViews', G.activeWorldViews);
}

function checkIntArray(c: Collector, path: string, value: unknown, min: number, max: number): void {
  if (!c.array(path, value)) return;
  value.forEach((item, i) => {
    if (!isNonNegInt(item) || item < min || item > max) {
      c.add(`${path}[${i}]`, `必须是 ${min}-${max} 的整数（${describe(item)}）`);
    }
  });
}

function checkResponseWindow(c: Collector, path: string, value: unknown, depth: number): void {
  if (value === null || value === undefined) return;
  if (depth > MAX_WINDOW_DEPTH) {
    c.add(path, '响应窗口嵌套过深');
    return;
  }
  if (!c.rec(path, value)) return;
  c.card(`${path}.sourceAbilityID`, value.sourceAbilityID);
  c.players(`${path}.responders`, value.responders);
  c.players(`${path}.responded`, value.responded);
  c.nonNegInt(`${path}.timeoutMs`, value.timeoutMs);
  c.strings(`${path}.validResponseAbilityIDs`, value.validResponseAbilityIDs);
  c.oneOf(`${path}.onTimeout`, value.onTimeout, ['resolve', 'cancel']);
  checkResponseWindow(c, `${path}.parentWindow`, value.parentWindow, depth + 1);
}

function checkPending(c: Collector, G: Rec): void {
  c.optional('pendingUnlock', G.pendingUnlock, (o) => {
    c.player('pendingUnlock.playerID', o.playerID);
    c.layer('pendingUnlock.layer', o.layer);
    c.card('pendingUnlock.cardId', o.cardId);
  });
  c.optional('pendingGraft', G.pendingGraft, (o) => c.player('pendingGraft.playerID', o.playerID));
  c.optional('pendingResonance', G.pendingResonance, (o) => {
    c.player('pendingResonance.bonderPlayerID', o.bonderPlayerID);
    c.player('pendingResonance.targetPlayerID', o.targetPlayerID);
  });
  c.optional('pendingGravity', G.pendingGravity, (o) => {
    c.player('pendingGravity.bonderPlayerID', o.bonderPlayerID);
    c.players('pendingGravity.targetIds', o.targetIds);
    c.cards('pendingGravity.pool', o.pool);
    c.players('pendingGravity.pickOrder', o.pickOrder);
    c.nonNegInt('pendingGravity.pickCursor', o.pickCursor);
  });
  if (
    G.shiftSnapshot !== null &&
    G.shiftSnapshot !== undefined &&
    c.rec('shiftSnapshot', G.shiftSnapshot)
  ) {
    for (const [id, card] of Object.entries(G.shiftSnapshot)) {
      c.player(`shiftSnapshot(键 ${id})`, id);
      c.card(`shiftSnapshot.${id}`, card);
    }
  }
  checkResponseWindow(c, 'pendingResponseWindow', G.pendingResponseWindow, 0);
  c.optional('pendingPeekDecision', G.pendingPeekDecision, (o) => {
    c.player('pendingPeekDecision.peekerID', o.peekerID);
    c.layer('pendingPeekDecision.targetLayer', o.targetLayer);
  });
  c.optional('pendingVaultDecision', G.pendingVaultDecision, (o) => {
    c.layer('pendingVaultDecision.layer', o.layer);
    c.player('pendingVaultDecision.openerID', o.openerID);
  });
  c.optional('peekReveal', G.peekReveal, (o) => {
    c.player('peekReveal.peekerID', o.peekerID);
    c.oneOf('peekReveal.revealKind', o.revealKind, ['vault', 'bribe']);
    if (o.revealKind === 'vault') c.layer('peekReveal.vaultLayer', o.vaultLayer);
    if (o.revealKind === 'bribe') c.player('peekReveal.targetThiefID', o.targetThiefID);
  });
  c.optional('pendingLibra', G.pendingLibra, (o) => {
    c.player('pendingLibra.bonderPlayerID', o.bonderPlayerID);
    c.player('pendingLibra.targetPlayerID', o.targetPlayerID);
    c.optional('pendingLibra.split', o.split, (split) => {
      c.cards('pendingLibra.split.pile1', split.pile1);
      c.cards('pendingLibra.split.pile2', split.pile2);
    });
  });
  c.optional('pendingSudgerRolls', G.pendingSudgerRolls, (o) => {
    for (const key of ['rollA', 'rollB']) c.nonNegInt(`pendingSudgerRolls.${key}`, o[key]);
    c.player('pendingSudgerRolls.targetPlayerID', o.targetPlayerID);
    c.card('pendingSudgerRolls.cardId', o.cardId);
    checkIntArray(c, 'pendingSudgerRolls.deathFaces', o.deathFaces, 1, 6);
    checkIntArray(c, 'pendingSudgerRolls.moveFaces', o.moveFaces, 1, 6);
    checkExtraOnMove(c, 'pendingSudgerRolls.extraOnMove', o.extraOnMove);
  });
  c.optional('pendingShootMove', G.pendingShootMove, (o) => {
    c.player('pendingShootMove.shooterID', o.shooterID);
    c.player('pendingShootMove.targetPlayerID', o.targetPlayerID);
    c.cardOrNull('pendingShootMove.cardId', o.cardId);
    checkExtraOnMove(c, 'pendingShootMove.extraOnMove', o.extraOnMove);
    checkIntArray(c, 'pendingShootMove.choices', o.choices, 0, LAYER_MAX);
  });
  c.optional('mazeState', G.mazeState, (o) => {
    c.player('mazeState.mazedPlayerID', o.mazedPlayerID);
    c.nonNegInt('mazeState.untilTurnNumber', o.untilTurnNumber);
  });
  c.optional('pendingAriesChoice', G.pendingAriesChoice, (o) => {
    c.player('pendingAriesChoice.ariesID', o.ariesID);
    c.layer('pendingAriesChoice.victimLayer', o.victimLayer);
    c.player('pendingAriesChoice.victimID', o.victimID);
  });
  c.optional('pendingVirgoChoice', G.pendingVirgoChoice, (o) => {
    c.player('pendingVirgoChoice.virgoID', o.virgoID);
    c.nonNegInt('pendingVirgoChoice.triggerRoll', o.triggerRoll);
    c.player('pendingVirgoChoice.shooterID', o.shooterID);
  });
  c.optional('pendingShootResponse', G.pendingShootResponse, (o) => {
    c.player('pendingShootResponse.shooterID', o.shooterID);
    c.player('pendingShootResponse.targetPlayerID', o.targetPlayerID);
    c.cardOrNull('pendingShootResponse.cardId', o.cardId);
    c.bool('pendingShootResponse.sameLayerRequired', o.sameLayerRequired);
    checkIntArray(c, 'pendingShootResponse.deathFaces', o.deathFaces, 1, 6);
    checkIntArray(c, 'pendingShootResponse.moveFaces', o.moveFaces, 1, 6);
    checkExtraOnMove(c, 'pendingShootResponse.extraOnMove', o.extraOnMove);
    if (o.decreeId !== undefined) c.card('pendingShootResponse.decreeId', o.decreeId);
    if (o.preventMove !== undefined) c.bool('pendingShootResponse.preventMove', o.preventMove);
    if (o.responseType !== undefined) {
      c.oneOf('pendingShootResponse.responseType', o.responseType, ['pisces', 'terrorist']);
    }
    if (o.skill !== undefined) {
      c.oneOf('pendingShootResponse.skill', o.skill, SHOOT_SKILL_SOURCES);
    }
    // 没有实体牌的 SHOOT 只有哈雷·冲击与要塞·冷酷；其余来源都有一张牌
    const cardless = typeof o.skill === 'string' && CARDLESS_SHOOT_SKILL_SOURCES.includes(o.skill);
    if ((o.cardId === null) !== cardless) {
      c.add('pendingShootResponse.cardId', '没有实体牌当且仅当技能来源为哈雷·冲击或要塞·冷酷');
    }
  });
  c.optional('pendingBlackHoleLevy', G.pendingBlackHoleLevy, (o) => {
    c.player('pendingBlackHoleLevy.blackHoleID', o.blackHoleID);
    c.players('pendingBlackHoleLevy.waiting', o.waiting);
  });
  c.optional('pendingDarwinReturn', G.pendingDarwinReturn, (o) =>
    c.player('pendingDarwinReturn.playerID', o.playerID),
  );
  c.optional('pendingAthenaWit', G.pendingAthenaWit, (o) => {
    c.player('pendingAthenaWit.athenaID', o.athenaID);
    c.player('pendingAthenaWit.userID', o.userID);
    c.card('pendingAthenaWit.cardId', o.cardId);
    c.card('pendingAthenaWit.move', o.move);
    if (!Array.isArray(o.args)) c.add('pendingAthenaWit.args', '必须是数组');
  });
}

function checkExtraOnMove(c: Collector, path: string, value: unknown): void {
  if (value !== null) c.oneOf(path, value, ['discard_unlocks', 'discard_shoots']);
}
