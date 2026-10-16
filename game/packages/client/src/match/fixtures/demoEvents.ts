// 固定场景的示例事件（?fx=1）：按场景里的座位与层编一组覆盖各种动画的事件，循环推送，走查动画层
// 只是演出：视图不随之变化；本人能看到的秘密（自己抽到的牌、交给自己的牌）照真实事件的形状给出。

import type { MatchEvent, MatchView } from '@icgame/game-engine';
import { createEventEmitter, type EventBatch, type EventFeed } from '../eventFeed';

/** 两批之间隔多久（毫秒） */
export const DEMO_INTERVAL_MS = 1600;

function event(
  stateID: number,
  kind: string,
  data: Record<string, unknown>,
  secret?: MatchEvent['secret'],
): MatchEvent {
  return { stateID, index: 0, kind, actor: null, data, ...(secret ? { secret } : {}) };
}

/** 一组示例批次，每批一种动作；stateID 从 1 起依次递增 */
export function demoEventBatches(G: MatchView, seat: string): EventBatch[] {
  const other =
    G.playerOrder.find((id) => id !== seat && id !== G.dreamMasterID) ?? G.dreamMasterID;
  const layer = Math.min(Math.max(G.players[other]?.currentLayer ?? 1, 1), 3);
  const lock = G.layers[layer]?.heartLockValue ?? 3;
  const specs: Array<[string, Record<string, unknown>, MatchEvent['secret']?]> = [
    ['cards_drawn', { player: other, count: 2 }],
    ['cards_drawn', { player: seat, count: 1 }, { to: [seat], data: { cards: ['action_shoot'] } }],
    ['card_played', { player: other, card: 'action_shoot' }],
    [
      'dice_rolled',
      { id: 1, purpose: 'shoot', by: other, target: seat, rolls: [{ player: seat, dice: [4] }] },
    ],
    [
      'cards_discarded',
      { count: 2, cards: ['action_kick', 'action_unlock'], from: [{ player: other, count: 2 }] },
    ],
    [
      'cards_transferred',
      { from: other, to: seat, count: 1 },
      { to: [other, seat], data: { cards: ['action_kick'] } },
    ],
    ['player_moved', { player: other, from: layer, to: layer + 1 }],
    ['heart_lock_changed', { layer, from: lock, to: Math.max(lock - 1, 0) }],
    ['vault_opened', { vault: 'demo', layer, content: 'coin', openedBy: other }],
    ['player_died', { player: other, layer, cause: null }],
    ['player_revived', { player: other, layer: 1 }],
  ];
  return specs.map(([kind, data, secret], i) => ({
    stateID: i + 1,
    events: [event(i + 1, kind, data, secret)],
  }));
}

/** 有人订阅时按固定间隔循环推送这组批次，没人订阅时停下 */
export function loopingFeed(
  batches: readonly EventBatch[],
  intervalMs = DEMO_INTERVAL_MS,
): EventFeed {
  const emitter = createEventEmitter();
  let subscribers = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let next = 0;
  return {
    subscribe(listener) {
      const off = emitter.subscribe(listener);
      subscribers += 1;
      if (timer === null && batches.length > 0) {
        timer = setInterval(() => {
          emitter.emit(batches[next % batches.length]!);
          next += 1;
        }, intervalMs);
      }
      return () => {
        off();
        subscribers -= 1;
        if (subscribers === 0 && timer !== null) {
          clearInterval(timer);
          timer = null;
        }
      };
    },
  };
}
