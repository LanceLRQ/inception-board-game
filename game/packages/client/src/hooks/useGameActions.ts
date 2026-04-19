// useGameActions - 两步点击打牌状态机
// 对照：plans/design/06-frontend-design.md §6.4.4 两步点击流程
//
// 状态流转：
//   idle → selectCard (hand click)
//   selectCard → selectTarget (需要目标)
//   selectCard → confirm (无目标直接打出)
//   selectTarget → confirm (目标点击)
//   confirm → idle (派发后重置)

import { useCallback, useState } from 'react';
import type { CardID } from '@icgame/shared';
import type { LegalActions } from './useLegalActions.js';

export type PlayStep = 'idle' | 'selectTarget' | 'selectLayer' | 'confirm';

export interface PlayIntent {
  step: PlayStep;
  cardId: CardID | null;
  targetPlayerID?: string;
  targetLayer?: number;
}

export interface UseGameActionsResult {
  intent: PlayIntent;
  /** 选中一张手牌（第一步） */
  selectCard(cardId: CardID): void;
  /** 选择目标玩家（第二步） */
  selectTarget(playerID: string): void;
  /** 选择目标层 */
  selectLayer(layer: number): void;
  /** 取消当前选中 */
  cancel(): void;
  /** 提交意图（外部派发后调用复位） */
  reset(): void;
  /** 是否某个玩家是合法点击目标 */
  isLegalTarget(playerID: string): boolean;
  /** 是否某层是合法点击目标 */
  isLegalLayer(layer: number): boolean;
  /** 是否处于响应窗口（pendingUnlock） */
  inResponseWindow: boolean;
}

export interface UseGameActionsOptions {
  legal: LegalActions;
  inResponseWindow?: boolean;
  /** 触发真实 Move（外部提供，可为 WS dispatch） */
  onDispatch?: (intent: Required<PlayIntent>) => void;
}

const IDLE: PlayIntent = { step: 'idle', cardId: null };

export function useGameActions(opts: UseGameActionsOptions): UseGameActionsResult {
  const { legal, inResponseWindow = false, onDispatch } = opts;
  const [intent, setIntent] = useState<PlayIntent>(IDLE);

  const selectCard = useCallback(
    (cardId: CardID) => {
      // 判断该牌是否需要目标玩家 / 目标层
      const needsTarget = !!legal.legalTargetsByCard[cardId]?.size;
      const needsLayer = !!legal.legalLayersByCard[cardId]?.size;

      if (needsTarget) {
        setIntent({ step: 'selectTarget', cardId });
      } else if (needsLayer) {
        setIntent({ step: 'selectLayer', cardId });
      } else {
        // 无目标：可直接确认
        const ready: Required<PlayIntent> = {
          step: 'confirm',
          cardId,
          targetPlayerID: '',
          targetLayer: -1,
        };
        setIntent({ step: 'confirm', cardId });
        onDispatch?.(ready);
      }
    },
    [legal, onDispatch],
  );

  const selectTarget = useCallback(
    (playerID: string) => {
      setIntent((prev) => {
        if (prev.step !== 'selectTarget' || !prev.cardId) return prev;
        const targets = legal.legalTargetsByCard[prev.cardId as string];
        if (!targets?.has(playerID)) return prev;
        const ready: Required<PlayIntent> = {
          step: 'confirm',
          cardId: prev.cardId,
          targetPlayerID: playerID,
          targetLayer: -1,
        };
        onDispatch?.(ready);
        return { ...prev, step: 'confirm', targetPlayerID: playerID };
      });
    },
    [legal, onDispatch],
  );

  const selectLayer = useCallback(
    (layer: number) => {
      setIntent((prev) => {
        if (prev.step !== 'selectLayer' || !prev.cardId) return prev;
        const layers = legal.legalLayersByCard[prev.cardId as string];
        if (!layers?.has(layer)) return prev;
        const ready: Required<PlayIntent> = {
          step: 'confirm',
          cardId: prev.cardId,
          targetPlayerID: '',
          targetLayer: layer,
        };
        onDispatch?.(ready);
        return { ...prev, step: 'confirm', targetLayer: layer };
      });
    },
    [legal, onDispatch],
  );

  const cancel = useCallback(() => setIntent(IDLE), []);
  const reset = useCallback(() => setIntent(IDLE), []);

  const isLegalTarget = useCallback(
    (pid: string) => {
      if (intent.step !== 'selectTarget' || !intent.cardId) return false;
      return !!legal.legalTargetsByCard[intent.cardId as string]?.has(pid);
    },
    [intent, legal],
  );

  const isLegalLayer = useCallback(
    (layer: number) => {
      if (intent.step !== 'selectLayer' || !intent.cardId) return false;
      return !!legal.legalLayersByCard[intent.cardId as string]?.has(layer);
    },
    [intent, legal],
  );

  return {
    intent,
    selectCard,
    selectTarget,
    selectLayer,
    cancel,
    reset,
    isLegalTarget,
    isLegalLayer,
    inResponseWindow,
  };
}
