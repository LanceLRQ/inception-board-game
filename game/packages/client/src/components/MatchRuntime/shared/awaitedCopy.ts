// 轮到本人应答时窗口 / 响应条上的文案：标题、说明与补充提示的 i18n 键与参数。
// 只给键和参数，翻译交给组件；昵称与牌名由调用方提供，这里不依赖界面状态。

import type { MineAwaited } from '../response/awaitedResponse';

export interface AwaitedCopy {
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly bodyParams: Readonly<Record<string, string | number>>;
  /** 补充提示：不可操作的原因、梦魇名称、注意事项等 */
  readonly notes: readonly { readonly key: string; readonly params?: Record<string, string> }[];
}

export interface AwaitedCopyDeps {
  readonly nicknameOf: (playerID: string) => string;
  readonly cardNameOf: (cardId: string) => string;
}

/** SHOOT 用的牌名；没有实体牌（哈雷·冲击）时按「视为一张 SHOOT」写 SHOOT */
function shootCardName(cardId: string | null, cardNameOf: (cardId: string) => string): string {
  return cardId === null ? 'SHOOT' : cardNameOf(cardId);
}

export function awaitedCopy(awaited: MineAwaited, deps: AwaitedCopyDeps): AwaitedCopy {
  const { nicknameOf, cardNameOf } = deps;
  switch (awaited.kind) {
    case 'shoot-evade':
      return {
        titleKey: 'awaited.shootEvade.title',
        // 哈雷·冲击没有实体牌：改用不带牌名的文案
        bodyKey:
          awaited.cardId === null ? 'awaited.shootEvade.bodyNoCard' : 'awaited.shootEvade.body',
        bodyParams: {
          name: nicknameOf(awaited.shooterID),
          card: shootCardName(awaited.cardId, cardNameOf),
        },
        notes: awaited.canEvade ? [] : [{ key: 'awaited.shootEvade.cannot' }],
      };
    case 'shoot-zealot':
      return {
        titleKey: 'awaited.zealot.title',
        bodyKey: 'awaited.zealot.body',
        bodyParams: {
          name: nicknameOf(awaited.shooterID),
          card: shootCardName(awaited.cardId, cardNameOf),
        },
        notes: awaited.hand.length === 0 ? [{ key: 'awaited.zealot.noHand' }] : [],
      };
    case 'libra-split':
      return {
        titleKey: 'awaited.libraSplit.title',
        bodyKey: 'awaited.libraSplit.body',
        bodyParams: { name: nicknameOf(awaited.bonderID) },
        notes: [],
      };
    case 'libra-pick':
      return {
        titleKey: 'awaited.libraPick.title',
        bodyKey: 'awaited.libraPick.body',
        bodyParams: { name: nicknameOf(awaited.targetID) },
        notes: [],
      };
    case 'sudger':
      return {
        titleKey: 'awaited.sudger.title',
        bodyKey: 'awaited.sudger.body',
        bodyParams: { name: nicknameOf(awaited.targetID), card: cardNameOf(awaited.cardId) },
        notes: [],
      };
    case 'virgo': {
      const notes: { key: string }[] = [];
      if (!awaited.alive) notes.push({ key: 'awaited.virgo.dead' });
      else if (awaited.reviveTargets.length === 0) notes.push({ key: 'awaited.virgo.noRevive' });
      return {
        titleKey: 'awaited.virgo.title',
        bodyKey: 'awaited.virgo.body',
        bodyParams: { roll: awaited.triggerRoll },
        notes,
      };
    }
    case 'levy':
      return {
        titleKey: 'awaited.levy.title',
        bodyKey: 'awaited.levy.body',
        bodyParams: { name: nicknameOf(awaited.blackHoleID) },
        notes: awaited.hand.length === 0 ? [{ key: 'awaited.levy.noHand' }] : [],
      };
    case 'darwin':
      return {
        titleKey: 'awaited.darwin.title',
        bodyKey: 'awaited.darwin.body',
        bodyParams: {},
        notes: [],
      };
    case 'athena':
      return {
        titleKey: 'awaited.athena.title',
        bodyKey: 'awaited.athena.body',
        bodyParams: { name: nicknameOf(awaited.userID), card: cardNameOf(awaited.cardId) },
        notes: [],
      };
    case 'aries': {
      const notes: { key: string; params?: Record<string, string> }[] = [];
      if (awaited.nightmareId === null) notes.push({ key: 'awaited.aries.unknown' });
      else {
        notes.push({
          key: 'awaited.aries.nightmare',
          params: { name: cardNameOf(awaited.nightmareId) },
        });
        if (awaited.params === 'plague') notes.push({ key: 'awaited.aries.plague' });
      }
      notes.push({ key: 'awaited.aries.scope' });
      return {
        titleKey: 'awaited.aries.title',
        bodyKey: 'awaited.aries.body',
        bodyParams: { name: nicknameOf(awaited.victimID), layer: awaited.victimLayer },
        notes,
      };
    }
  }
}
