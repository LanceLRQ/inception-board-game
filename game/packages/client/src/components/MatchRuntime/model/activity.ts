// 层塔底部「最新动态」一行：只用视图里已有的公开信息推导，没有可显示的内容返回 null
// 文案由调用方按 key 翻译（board.activity.<kind>），参数里的名字已经取好。

import type { MatchView } from '@icgame/game-engine';
import type { AwaitingNotice } from '../awaitingNotice';

export type ActivityKind =
  | 'unlockWindow'
  | 'shootResponse'
  | 'awaitingMine'
  | 'awaitingOthers'
  | 'lastPlayedShoot'
  | 'lastPlayed';

export interface Activity {
  readonly kind: ActivityKind;
  readonly params: Readonly<Record<string, string | number>>;
}

export interface ActivityInput {
  readonly view: MatchView | undefined;
  readonly awaiting: AwaitingNotice | null;
  readonly nicknameOf: (playerID: string) => string;
  readonly cardNameOf: (cardId: string) => string;
}

/**
 * 优先级：解封响应窗口 > 被射击的应答 > 其他等待应答 > 本回合最后打出的牌。
 * 解封窗口里的未响应人数只算还没应答的玩家。
 */
export function deriveActivity(input: ActivityInput): Activity | null {
  const { view, awaiting, nicknameOf, cardNameOf } = input;
  if (!view) return null;

  const win = view.pendingResponseWindow;
  if (win && win.sourceAbilityID === 'action_unlock_effect_1' && view.pendingUnlock) {
    return {
      kind: 'unlockWindow',
      params: {
        name: nicknameOf(view.pendingUnlock.playerID),
        layer: view.pendingUnlock.layer,
        waiting: win.responders.filter((id) => !win.responded.includes(id)).length,
      },
    };
  }

  const shoot = view.pendingShootResponse;
  if (shoot) {
    return {
      kind: 'shootResponse',
      params: { shooter: nicknameOf(shoot.shooterID), target: nicknameOf(shoot.targetPlayerID) },
    };
  }

  if (awaiting) return { kind: awaiting.mine ? 'awaitingMine' : 'awaitingOthers', params: {} };

  const last = view.lastPlayedCardThisTurn;
  if (last) {
    const name = nicknameOf(view.currentPlayerID);
    const card = cardNameOf(last);
    if (last.startsWith('action_shoot') && view.lastShootRoll != null) {
      return { kind: 'lastPlayedShoot', params: { name, card, roll: view.lastShootRoll } };
    }
    return { kind: 'lastPlayed', params: { name, card } };
  }
  return null;
}
