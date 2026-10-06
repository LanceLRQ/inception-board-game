// 桌面舞台：最底层是皮肤的背景氛围，其上是座位环、中央舞台（皮肤）、右上角提示栈
// 舞台的尺寸变化会重新规划座位；中央舞台放在规划出的区域里。
// 样式钩子类名：ms-stage。

import { Suspense, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useElementSize } from '../../../hooks/useElementSize';
import { useThemeSkin } from '../../../theme/skins/useThemeSkin';
import type { MatchController } from '../controllerTypes';
import type { BoardModel } from '../model/boardModel';
import { buildSeatViews, worldViewNames } from '../model/seatModel';
import type { StageState } from '../model/stageState';
import { markersBySeat } from '../seatMarkers';
import { NoticeStack } from './NoticeStack';
import { SeatRing } from './SeatRing';
import { planSeats } from './seatPlan';

interface DesktopStageProps {
  readonly controller: MatchController;
  readonly state: StageState;
  readonly board: BoardModel;
  readonly onFocusLayer: (layer: number) => void;
}

export function DesktopStage({ controller, state, board, onFocusLayer }: DesktopStageProps) {
  const { t } = useTranslation();
  const skin = useThemeSkin();
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [reserveRight, setReserveRight] = useState(0);
  const { stage, view, preview } = controller;

  const seatMap = useMemo(() => {
    const markers = stage ? markersBySeat(stage.seats) : undefined;
    return new Map(buildSeatViews(state, markers).map((s) => [s.id, s]));
  }, [state, stage]);

  const viewer = state.viewerID;
  const master = state.dreamMasterID;
  const thieves = useMemo(
    () => state.playerOrder.filter((id) => id !== viewer && id !== master),
    [state.playerOrder, viewer, master],
  );
  const plan = useMemo(
    () =>
      size.w > 0 && size.h > 0
        ? planSeats({
            stage: size,
            thieves,
            masterId: master && master !== viewer ? master : null,
            footprint: skin.center,
            reserveRight,
          })
        : null,
    [size, thieves, master, viewer, skin.center, reserveRight],
  );

  const handleReserve = useCallback((h: number) => setReserveRight(h), []);
  const Ambient = skin.Ambient;
  const CenterStage = skin.CenterStage;

  return (
    <div
      ref={ref}
      className="ms-stage relative min-h-0 flex-1 overflow-hidden"
      data-testid="runtime-stage"
      data-density={plan?.density}
    >
      {Ambient && <Ambient />}
      {plan && (
        <>
          <SeatRing
            plan={plan}
            seats={seatMap}
            worldViews={worldViewNames(view)}
            onOpenDetail={preview.open}
          />
          <div
            className="ms-center absolute z-[5] transition-[top,height] duration-300"
            style={{
              left: plan.center.x,
              top: plan.center.y,
              width: plan.center.w,
              height: plan.center.h,
            }}
            data-testid="center-stage"
          >
            <Suspense
              fallback={
                <p className="pt-8 text-center text-xs text-faint">{t('desktop.stage.loading')}</p>
              }
            >
              <CenterStage board={board} onFocusLayer={onFocusLayer} onOpenCard={preview.open} />
            </Suspense>
          </div>
        </>
      )}
      <NoticeStack controller={controller} onReserve={handleReserve} />
    </div>
  );
}
