// 对局事件：对比一步之前与之后的状态，推导这一步产生的领域事件
//
// 事件是从状态变化推导出来的，所以拿不到「为什么」（例如某次移层是因为哪张牌）；
// 需要原因时由同一步的 move 事件与 card_played 事件提供上下文。
// 私密内容与对局视图保持一致：事件不能比视图多给——
//   - 抽到哪些牌只给本人；贿赂牌成败只给持有者；
//   - 没翻开就被弃掉的梦魇只给梦主；未翻开玩家的角色在翻开之前不出现；
//   - 弃牌堆、打出的牌、骰值、心锁、所在层、金库内容（打开后）都是公开的。
// 一步之内同一种事件有多条时，按 playerOrder 顺序（层按层号、金库与贿赂牌按下标）输出，保证确定性。
// 对照：docs/manual/03-game-flow.md 回合流程 / 贿赂；docs/manual/04-action-cards.md SHOOT、解封

import type { CardID } from '@icgame/shared';
import type { MatchEvent, MoveRequest, RunnerCtx } from '../runner/matchRunner.js';
import type { SetupState } from '../setup.js';
import { listAwaiting } from './actionRights.js';
import { matchOutcome } from './outcome.js';

type DescribedEvent = Omit<MatchEvent, 'stateID' | 'index'>;

interface DescribeArgs {
  before: SetupState;
  after: SetupState;
  ctxBefore: RunnerCtx;
  ctxAfter: RunnerCtx;
  request: MoveRequest;
}

/** 多重集差：after 里比 before 多出来的牌（保持 after 里的顺序） */
function addedCards(before: readonly CardID[], after: readonly CardID[]): CardID[] {
  const remaining = new Map<CardID, number>();
  for (const c of before) remaining.set(c, (remaining.get(c) ?? 0) + 1);
  const added: CardID[] = [];
  for (const c of after) {
    const n = remaining.get(c) ?? 0;
    if (n > 0) remaining.set(c, n - 1);
    else added.push(c);
  }
  return added;
}

/** 层号按数值升序 */
function layerKeys(G: SetupState): number[] {
  return Object.keys(G.layers)
    .map(Number)
    .sort((a, b) => a - b);
}

/** 本步新打出的牌：同一回合内取新增部分；回合换了说明列表被清空过，取清空后留下的 */
function newlyPlayed(before: SetupState, after: SetupState): CardID[] {
  const b = before.playedCardsThisTurn;
  const a = after.playedCardsThisTurn;
  if (before.turnNumber === after.turnNumber) return a.slice(b.length);
  return a.slice();
}

/**
 * 等待事项里「行动者身份在视图中被遮蔽」的字段。
 * 必须与 matchView.ts 中把 ariesID / virgoID 只给本人的遮蔽保持一致：
 * 视图遮住谁，事件就不能在公开部分点名谁（真实行动者放进 secret，只给他们本人）。
 */
export const MASKED_ACTOR_FIELDS: ReadonlySet<string> = new Set([
  'pendingAriesChoice',
  'pendingVirgoChoice',
  'pendingAthenaWit',
]);

export function describeMatchEvents(args: DescribeArgs): DescribedEvent[] {
  const { before, after, ctxBefore, ctxAfter, request } = args;
  // 雅典娜应答之后，被挂起的出牌在同一步里重放：这一步的动作者是出牌者，不是应答的雅典娜
  const replayed =
    request.move === 'respondAthenaWit' &&
    before.pendingAthenaWit &&
    !after.pendingAthenaWit &&
    before.playedCardsThisTurn.length < after.playedCardsThisTurn.length
      ? before.pendingAthenaWit.userID
      : null;
  const mover = replayed ?? request.playerID;
  const events: DescribedEvent[] = [];
  const order = after.playerOrder;

  // turn_started
  if (before.turnNumber !== after.turnNumber || before.currentPlayerID !== after.currentPlayerID) {
    events.push({
      kind: 'turn_started',
      actor: null,
      data: { turn: after.turnNumber, owner: after.currentPlayerID },
    });
  }

  // phase_changed
  if (before.turnPhase !== after.turnPhase) {
    events.push({ kind: 'phase_changed', actor: mover, data: { phase: after.turnPhase } });
  }

  // cards_drawn：本步从牌库进到某玩家手里的牌。
  // 先算离开牌库的牌（发生重洗时，候选还要加上重洗前的弃牌堆）；再对每名玩家，
  // 用「手牌新增的牌」与「离开牌库的牌」求交，求交的结果就是他抽到的牌，count 与 secret.cards 恒等。
  // 别的玩家转来的牌不在离开牌库的牌里，所以不会被算成抽牌。
  // 本步打出、弃掉的牌先从发起者的原手牌里扣掉再比较，所以同一步里打出（或弃掉）一张 X 又抽到一张 X 也不会少算；
  // 已知局限：别的玩家弃掉的牌若与发起者手里的牌同种，且同种牌也被抽走，可能多算。
  const playedNow = newlyPlayed(before, after);
  const discarded = addedCards(before.deck.discardPile, after.deck.discardPile);
  // 打出后移出游戏的牌（时间风暴）不进弃牌堆，不用从新增里扣：
  // 否则翻开的牌里恰好还有一张同名风暴时，会被错当成打出的那张扣掉
  const removedNow = addedCards(before.removedFromGame, after.removedFromGame);
  for (const card of playedNow) {
    const gone = removedNow.indexOf(card);
    if (gone >= 0) {
      removedNow.splice(gone, 1);
      continue;
    }
    const at = discarded.indexOf(card);
    if (at >= 0) discarded.splice(at, 1);
  }
  const leftDeck = addedCards(after.deck.cards, before.deck.cards);
  const reshuffled = addedCards(before.deck.cards, after.deck.cards).length > 0;
  let pool = reshuffled
    ? addedCards(after.deck.cards, [...before.deck.cards, ...before.deck.discardPile])
    : leftDeck;
  for (const id of order) {
    const was = before.players[id];
    const now = after.players[id];
    if (!was || !now || pool.length === 0) continue;
    const baseline = [...was.hand];
    if (id === mover) {
      for (const card of [...playedNow, ...discarded]) {
        const at = baseline.indexOf(card);
        if (at >= 0) baseline.splice(at, 1);
      }
    }
    const gained = addedCards(baseline, now.hand);
    const drawn: CardID[] = [];
    const rest = [...pool];
    for (const card of gained) {
      const at = rest.indexOf(card);
      if (at >= 0) {
        rest.splice(at, 1);
        drawn.push(card);
      }
    }
    pool = rest;
    if (drawn.length === 0) continue;
    events.push({
      kind: 'cards_drawn',
      actor: mover,
      data: { player: id, count: drawn.length },
      secret: { to: [id], data: { cards: drawn } },
    });
  }

  // card_played
  const played = playedNow;
  for (const card of played) {
    events.push({ kind: 'card_played', actor: mover, data: { player: mover, card } });
  }

  // cards_discarded：见上，弃牌堆里新增的牌去掉本步打出的牌（打出的牌由 card_played 表达）
  if (discarded.length > 0) {
    events.push({
      kind: 'cards_discarded',
      actor: mover,
      data: { count: discarded.length, cards: discarded },
    });
  }

  // shoot_rolled：骰值被写入。字段不会被清空，所以同一个值再次出现时，以本步打出了 SHOOT 类牌为准
  if (after.lastShootRoll !== null) {
    const changed = after.lastShootRoll !== before.lastShootRoll;
    const repeated = played.some((c) => c.startsWith('action_shoot'));
    if (changed || repeated) {
      events.push({
        kind: 'shoot_rolled',
        actor: mover,
        data: { player: mover, roll: after.lastShootRoll },
      });
    }
  }

  // player_moved / player_died / player_revived
  for (const id of order) {
    const was = before.players[id];
    const now = after.players[id];
    if (was && now && was.currentLayer !== now.currentLayer) {
      events.push({
        kind: 'player_moved',
        actor: mover,
        data: { player: id, from: was.currentLayer, to: now.currentLayer },
      });
    }
  }
  // 击杀者：只有被击杀才有（击杀结算会让凶手的击杀计数 +1），凶手不一定是这一步的发起者
  // （例如被 SHOOT 者放弃响应后结算）；梦魇、世界观、密道传送、港口海啸、殉道者自尽等
  // 非击杀进入迷失层没有凶手，cause 为 null
  const killerThisStep =
    order.find(
      (id) => (after.players[id]?.shootCount ?? 0) > (before.players[id]?.shootCount ?? 0),
    ) ?? null;
  for (const id of order) {
    const was = before.players[id];
    const now = after.players[id];
    if (was && now && was.isAlive && !now.isAlive) {
      events.push({
        kind: 'player_died',
        actor: mover,
        data: {
          player: id,
          layer: was.currentLayer,
          cause: killerThisStep !== id ? killerThisStep : null,
        },
      });
    }
  }
  for (const id of order) {
    const was = before.players[id];
    const now = after.players[id];
    if (was && now && !was.isAlive && now.isAlive) {
      events.push({
        kind: 'player_revived',
        actor: mover,
        data: { player: id, layer: now.currentLayer },
      });
    }
  }

  // heart_lock_changed
  for (const layer of layerKeys(after)) {
    const was = before.layers[layer];
    const now = after.layers[layer];
    if (was && now && was.heartLockValue !== now.heartLockValue) {
      events.push({
        kind: 'heart_lock_changed',
        actor: mover,
        data: { layer, from: was.heartLockValue, to: now.heartLockValue },
      });
    }
  }

  // unlock_resolved：待解封由有到无，心锁下降即成功
  if (before.pendingUnlock && !after.pendingUnlock) {
    const { playerID, layer } = before.pendingUnlock;
    const lockBefore = before.layers[layer]?.heartLockValue ?? 0;
    const lockAfter = after.layers[layer]?.heartLockValue ?? 0;
    events.push({
      kind: 'unlock_resolved',
      actor: mover,
      data: { success: lockAfter < lockBefore, player: playerID, layer },
    });
  } else if (!before.pendingUnlock && !after.pendingUnlock) {
    // 没有可响应者时打出解封不开窗口，同一步里直接结算，待解封不会留在前后状态里；
    // 解封计数只在解封成功时增加，据此识别（解封者没有换层，层取结算前所在层）
    for (const id of order) {
      const was = before.players[id];
      const now = after.players[id];
      if (!was || !now || now.unlockCount <= was.unlockCount) continue;
      events.push({
        kind: 'unlock_resolved',
        actor: mover,
        data: { success: true, player: id, layer: was.currentLayer },
      });
    }
  }

  // vault_opened
  for (let i = 0; i < after.vaults.length; i++) {
    const was = before.vaults[i];
    const now = after.vaults[i]!;
    if (was && !was.isOpened && now.isOpened) {
      events.push({
        kind: 'vault_opened',
        actor: mover,
        data: { vault: now.id, layer: now.layer, content: now.contentType, openedBy: now.openedBy },
      });
    }
  }

  // bribe_dealt：离开池子；成败只给持有者
  for (let i = 0; i < after.bribePool.length; i++) {
    const was = before.bribePool[i];
    const now = after.bribePool[i]!;
    if (was && was.status === 'inPool' && now.status !== 'inPool') {
      events.push({
        kind: 'bribe_dealt',
        actor: mover,
        data: { bribe: now.id, to: now.heldBy },
        secret: { to: now.heldBy === null ? [] : [now.heldBy], data: { kind: now.kind } },
      });
    }
  }

  // 梦主选择「翻开并发动」金库层的梦魇：翻开与发动在同一步完成，状态里看不到翻开的中间态，
  // 这里按等待状态与参数补上公开的翻开事件
  const activatedLayer =
    request.move === 'masterVaultDecision' &&
    request.args[0] === 'nightmare' &&
    before.pendingVaultDecision !== null &&
    after.pendingVaultDecision === null
      ? before.pendingVaultDecision.layer
      : null;

  // nightmare_revealed
  for (const layer of layerKeys(after)) {
    const was = before.layers[layer];
    const now = after.layers[layer];
    const activatedHere =
      layer === activatedLayer && !!was?.nightmareId && !was.nightmareRevealed && !now?.nightmareId;
    if (was && now && ((!was.nightmareRevealed && now.nightmareRevealed) || activatedHere)) {
      events.push({
        kind: 'nightmare_revealed',
        actor: mover,
        data: { layer, nightmare: was.nightmareId ?? now.nightmareId },
      });
    }
  }

  // nightmare_discarded：已用梦魇增加。没翻开过的，是哪张只给梦主
  for (const id of addedCards(before.usedNightmareIds, after.usedNightmareIds)) {
    const layer = layerKeys(before).find((l) => before.layers[l]!.nightmareId === id) ?? null;
    const wasRevealed =
      layer !== null && (before.layers[layer]!.nightmareRevealed || layer === activatedLayer);
    const nowRevealed = layer !== null && (after.layers[layer]?.nightmareRevealed ?? false);
    const ev: DescribedEvent = { kind: 'nightmare_discarded', actor: mover, data: { layer } };
    if (!wasRevealed && !nowRevealed) {
      ev.secret = { to: [after.dreamMasterID], data: { nightmare: id } };
    }
    events.push(ev);
  }

  // character_revealed
  for (const id of order) {
    const was = before.players[id];
    const now = after.players[id];
    if (was && now && !was.isRevealed && now.isRevealed) {
      events.push({
        kind: 'character_revealed',
        actor: mover,
        data: { player: id, character: now.characterId },
      });
    }
  }

  // awaiting_changed：是否变化按完整内容（含行动者）比较；公开的那份里，行动者在视图中被遮蔽的条目不带行动者
  const awaitingOf = (G: SetupState) =>
    listAwaiting(G).map((a) => ({
      field: a.field,
      actors: [...a.actors],
      moves: [...a.moves],
      blocking: a.blocking,
    }));
  const awaitingBefore = awaitingOf(before);
  const awaitingAfter = awaitingOf(after);
  if (JSON.stringify(awaitingBefore) !== JSON.stringify(awaitingAfter)) {
    const hidden = awaitingAfter.filter((a) => MASKED_ACTOR_FIELDS.has(a.field));
    const ev: DescribedEvent = {
      kind: 'awaiting_changed',
      actor: null,
      data: {
        awaiting: awaitingAfter.map((a) =>
          MASKED_ACTOR_FIELDS.has(a.field) ? { ...a, actors: [] } : a,
        ),
      },
    };
    if (hidden.length > 0) {
      ev.secret = {
        to: [...new Set(hidden.flatMap((a) => a.actors))],
        data: { actors: Object.fromEntries(hidden.map((a) => [a.field, a.actors])) },
      };
    }
    events.push(ev);
  }

  // game_over
  if (ctxBefore.gameover === undefined && ctxAfter.gameover !== undefined) {
    const outcome = matchOutcome(ctxAfter.gameover, after);
    events.push({
      kind: 'game_over',
      actor: null,
      data: { winner: outcome.winner, reason: outcome.reason },
    });
  }

  return events;
}
