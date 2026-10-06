// 从控制层推导盘面数据模型：布局只拿到 board 与焦点层的切换回调
// 焦点层的点选记录在这里；盘面本身是纯函数 buildBoardModel 的结果。

import { useCallback, useMemo, useState } from 'react';
import { getCardName } from '../../../lib/cards';
import type { MatchController } from '../controllerTypes';
import { deriveActivity } from './activity';
import { buildBoardModel, resolveFocusLayer, type BoardModel, type FocusPick } from './boardModel';
import type { StageState } from './stageState';
import { adaptViewToStage } from './viewAdapter';

export interface BoardModelHandle {
  /** 舞台状态；视图未就绪为 null */
  readonly state: StageState | null;
  readonly board: BoardModel | null;
  readonly focusLayer: number;
  /** 点选一层作为焦点层（本人换层前一直固定在该层） */
  readonly focusOn: (layer: number) => void;
}

export function useBoardModel(controller: MatchController): BoardModelHandle {
  const { stage, view, turn, nicknameOf } = controller;
  const [pick, setPick] = useState<FocusPick | null>(null);

  const state = useMemo(
    () =>
      stage
        ? adaptViewToStage({ G: stage.G, ctx: stage.ctx, humanPlayerID: stage.humanPlayerID })
        : null,
    [stage],
  );
  const viewerLayer = controller.self?.layer ?? controller.viewerLayer;
  const focusLayer = resolveFocusLayer(pick, viewerLayer);
  const focusOn = useCallback((layer: number) => setPick({ layer, viewerLayer }), [viewerLayer]);

  const board = state
    ? buildBoardModel({
        state,
        view,
        focusLayer,
        nicknameOf,
        activity: deriveActivity({
          view,
          awaiting: turn.awaiting,
          nicknameOf,
          cardNameOf: getCardName,
        }),
      })
    : null;

  return { state, board, focusLayer, focusOn };
}
