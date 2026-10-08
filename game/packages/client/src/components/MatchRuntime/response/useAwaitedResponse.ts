// 本人应答的状态与回调：把 awaitedResponse 的纯推导接到界面状态（打开的弹窗、选了什么）与 move 派发上。
// 弹窗与草稿按「第几次待决状态」记录，换了一次待决状态（或回合）就自动清空，不靠 effect 同步。

import { useCallback, useMemo, useState } from 'react';
import type { MatchView } from '@icgame/game-engine';
import { toggleHandPick } from '../../../lib/handPick';
import { logger } from '../../../lib/logger';
import type { MatchMakeMove, ResponseModel } from '../controllerTypes';
import {
  DARWIN_RETURN_COUNT,
  EMPTY_DRAFT,
  awaitedActions,
  awaitedKey,
  awaitedResponse,
  hasOwnDeadline,
  libraPickCommand,
  sheetCommand,
  toggleIndex,
  type AwaitedAction,
  type AwaitedCommand,
  type AwaitedDraft,
  type AwaitedSheet,
  type MineAwaited,
} from './awaitedResponse';

interface UiState {
  readonly key: string | null;
  readonly sheet: AwaitedSheet | null;
  readonly draft: AwaitedDraft;
}

const NO_ACTIONS: readonly AwaitedAction[] = [];

export interface UseAwaitedResponseInput {
  readonly view: MatchView | undefined;
  readonly seat: string | null;
  readonly makeMove: MatchMakeMove;
  /** 服务端给出的截止时间剩余秒数；没有截止时间为 null */
  readonly deadlineSeconds: number | null;
}

export function useAwaitedResponse({
  view,
  seat,
  makeMove,
  deadlineSeconds,
}: UseAwaitedResponseInput): ResponseModel {
  const awaited: MineAwaited | null = useMemo(() => {
    if (!view) return null;
    const found = awaitedResponse(view, seat);
    return found !== null && found.mine ? found : null;
  }, [view, seat]);
  const turnNumber = view?.turnNumber ?? 0;
  const key = awaitedKey(awaited, turnNumber);

  const [ui, setUi] = useState<UiState>({ key: null, sheet: null, draft: EMPTY_DRAFT });
  const current: UiState = ui.key === key ? ui : { key, sheet: null, draft: EMPTY_DRAFT };

  const update = useCallback(
    (patch: (prev: UiState) => Partial<UiState>) => {
      setUi((prev) => {
        const base: UiState = prev.key === key ? prev : { key, sheet: null, draft: EMPTY_DRAFT };
        return { ...base, ...patch(base), key };
      });
    },
    [key],
  );
  const patchDraft = useCallback(
    (patch: Partial<AwaitedDraft>) => update((prev) => ({ draft: { ...prev.draft, ...patch } })),
    [update],
  );

  const send = useCallback(
    async (command: AwaitedCommand): Promise<boolean> => {
      logger.flow('game/move', 'response move', {
        kind: awaited?.kind,
        move: command.move,
        args: command.args,
      });
      const outcome = await makeMove(command.move, [...command.args]);
      return outcome.ok;
    },
    [awaited?.kind, makeMove],
  );

  const perform = useCallback(
    (action: AwaitedAction) => {
      if (action.disabled) return;
      if (action.effect.type === 'sheet') {
        const { sheet } = action.effect;
        update(() => ({ sheet }));
        return;
      }
      void send({ move: action.effect.move, args: action.effect.args });
    },
    [send, update],
  );

  const sheetName = current.sheet;
  const command =
    awaited !== null && sheetName !== null ? sheetCommand(awaited, sheetName, current.draft) : null;

  const confirm = useCallback(async () => {
    if (command === null) return;
    const ok = await send(command);
    if (ok) update(() => ({ sheet: null }));
  }, [command, send, update]);

  const pickPile = useCallback(
    async (pile: 'pile1' | 'pile2') => {
      const ok = await send(libraPickCommand(pile));
      if (ok) update(() => ({ sheet: null }));
    },
    [send, update],
  );

  return {
    awaited,
    actions: awaited === null ? NO_ACTIONS : awaitedActions(awaited),
    deadlineSeconds: awaited !== null && hasOwnDeadline(awaited) ? deadlineSeconds : null,
    perform,
    sheet: {
      open: sheetName,
      draft: current.draft,
      canConfirm: command !== null,
      close: () => update(() => ({ sheet: null })),
      confirm: () => void confirm(),
      pickDiscard: (index) => patchDraft({ discardIndex: index }),
      toggleSecondPile: (index) =>
        update((prev) => ({
          draft: { ...prev.draft, secondPile: toggleIndex(prev.draft.secondPile, index) },
        })),
      pickReviveTarget: (id) => patchDraft({ reviveTarget: id }),
      pickTeleportLayer: (layer) => patchDraft({ teleportLayer: layer }),
      pickEchoLayer: (layer) => patchDraft({ echoLayer: layer }),
      pickEchoAction: (action) => patchDraft({ echoAction: action }),
      setNightmareDraft: (next) =>
        patchDraft({ echoLayer: next.echoLayer, echoAction: next.echoAction, bribed: next.bribed }),
      pickPile: (pile) => void pickPile(pile),
      pickGive: (index) => patchDraft({ giveIndex: index }),
      toggleReturn: (index) =>
        update((prev) => ({
          draft: {
            ...prev.draft,
            returnPicks: [...toggleHandPick(prev.draft.returnPicks, index, DARWIN_RETURN_COUNT)],
          },
        })),
      pickAthenaCard: (card) =>
        update((prev) => ({
          draft: { ...prev.draft, athenaCard: prev.draft.athenaCard === card ? null : card },
        })),
    },
  };
}
