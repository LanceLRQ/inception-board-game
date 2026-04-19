// 零信任事件广播 - per-recipient 重写事件 payload
// 对照：plans/design/07-backend-network.md §7.9b + plans/design/08-security-ai.md §8.4d
//
// 核心原则：
//   1. 禁止 io.emit 全广播敏感事件
//   2. 所有广播必须经 rewriteForViewer(event, viewer) 过滤
//   3. 过滤策略由事件自身的 sensitivity 描述

import type { CardID } from '@icgame/shared';

// === 事件 ===

export type EventVisibility =
  | 'public' // 所有人可见
  | 'master-only' // 仅梦主可见
  | 'actor-only' // 仅行动者可见
  | 'actor+target' // 行动者 + 目标可见
  | 'actor+master'; // 行动者 + 梦主

export interface BroadcastEvent {
  readonly eventKind: string;
  readonly matchId: string;
  readonly seq: number;
  readonly timestamp: number;
  readonly actor?: string;
  readonly targets?: string[];
  readonly visibility: EventVisibility;
  readonly payload: Record<string, unknown>;
  /** 需要在过滤时脱敏的字段路径（dot-path） */
  readonly sensitiveFields?: string[];
}

// === 接收人判定 ===

export interface BroadcastContext {
  readonly dreamMasterID: string;
  readonly allPlayerIDs: readonly string[];
}

export function resolveRecipients(event: BroadcastEvent, ctx: BroadcastContext): string[] {
  switch (event.visibility) {
    case 'public':
      return [...ctx.allPlayerIDs];
    case 'master-only':
      return [ctx.dreamMasterID];
    case 'actor-only':
      return event.actor ? [event.actor] : [];
    case 'actor+target': {
      const set = new Set<string>();
      if (event.actor) set.add(event.actor);
      for (const t of event.targets ?? []) set.add(t);
      return [...set];
    }
    case 'actor+master': {
      const set = new Set<string>();
      if (event.actor) set.add(event.actor);
      set.add(ctx.dreamMasterID);
      return [...set];
    }
  }
}

// === 为特定 viewer 重写事件 payload ===

export function rewriteForViewer(
  event: BroadcastEvent,
  viewerID: string,
  ctx: BroadcastContext,
): BroadcastEvent | null {
  const recipients = resolveRecipients(event, ctx);
  if (!recipients.includes(viewerID)) return null;

  // 脱敏字段：如果 viewer 不是 actor，需要把敏感字段剔除
  const isActor = viewerID === event.actor;
  const isMaster = viewerID === ctx.dreamMasterID;
  const sensitiveFields = event.sensitiveFields ?? [];

  if (sensitiveFields.length === 0 || isActor || isMaster) {
    return { ...event, payload: { ...event.payload } };
  }

  const payload: Record<string, unknown> = { ...event.payload };
  for (const path of sensitiveFields) {
    scrubPath(payload, path);
  }
  return { ...event, payload };
}

// 递归删除 payload 中指定 dot-path 字段
function scrubPath(obj: Record<string, unknown>, path: string): void {
  const segs = path.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i]!;
    const next = cur[seg];
    if (next === null || typeof next !== 'object') return;
    cur = next as Record<string, unknown>;
  }
  delete cur[segs[segs.length - 1]!];
}

// === 批量广播 ===

/**
 * 将一个 event 分发成多个 per-recipient 副本。
 * 调用方（server 层）遍历并推送到对应 socket。
 */
export function distribute(
  event: BroadcastEvent,
  ctx: BroadcastContext,
): Array<{ recipient: string; event: BroadcastEvent }> {
  const recipients = resolveRecipients(event, ctx);
  const out: Array<{ recipient: string; event: BroadcastEvent }> = [];
  for (const r of recipients) {
    const rewritten = rewriteForViewer(event, r, ctx);
    if (rewritten) out.push({ recipient: r, event: rewritten });
  }
  return out;
}

// === 标准事件工厂（常用事件预设 visibility & sensitiveFields）===

export const Events = {
  cardDrawn(matchId: string, seq: number, actor: string, cardIds: CardID[]): BroadcastEvent {
    return {
      eventKind: 'card.drawn',
      matchId,
      seq,
      timestamp: Date.now(),
      actor,
      visibility: 'actor-only',
      payload: { actor, cardIds, count: cardIds.length },
    };
  },
  cardDiscarded(matchId: string, seq: number, actor: string, cardId: CardID): BroadcastEvent {
    return {
      eventKind: 'card.discarded',
      matchId,
      seq,
      timestamp: Date.now(),
      actor,
      visibility: 'public',
      payload: { actor, cardId },
    };
  },
  shootResolved(
    matchId: string,
    seq: number,
    actor: string,
    target: string,
    roll: number,
    result: 'kill' | 'move' | 'miss',
  ): BroadcastEvent {
    return {
      eventKind: 'shoot.resolved',
      matchId,
      seq,
      timestamp: Date.now(),
      actor,
      targets: [target],
      visibility: 'public',
      payload: { actor, target, roll, result },
    };
  },
  unlockPending(
    matchId: string,
    seq: number,
    actor: string,
    layer: number,
    cardId: CardID,
  ): BroadcastEvent {
    return {
      eventKind: 'unlock.pending',
      matchId,
      seq,
      timestamp: Date.now(),
      actor,
      visibility: 'public',
      payload: { actor, layer, cardId },
    };
  },
  vaultOpened(
    matchId: string,
    seq: number,
    actor: string,
    vaultId: string,
    contentType: string,
  ): BroadcastEvent {
    return {
      eventKind: 'vault.opened',
      matchId,
      seq,
      timestamp: Date.now(),
      actor,
      visibility: 'public',
      payload: { actor, vaultId, contentType },
    };
  },
  bribeDealt(
    matchId: string,
    seq: number,
    actor: string,
    target: string,
    bribeId: string,
    status: 'deal' | 'shattered',
  ): BroadcastEvent {
    return {
      eventKind: 'bribe.dealt',
      matchId,
      seq,
      timestamp: Date.now(),
      actor,
      targets: [target],
      // 梦主 + 目标可见具体结果；其他玩家只知有 bribe 动作
      visibility: 'actor+master',
      payload: { actor, target, bribeId, status },
      sensitiveFields: ['status'],
    };
  },
} as const;
