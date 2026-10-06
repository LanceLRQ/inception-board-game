// 移动端对局布局（<1024px）：占满视口、整页不滚动的应用外壳，内部区域各自滚动
// 从上到下：顶栏 → 层级标签 → 主体（行动轴 + 层塔）→ 提示 / 解封响应条 → 一体式手牌坞。
// 只读控制层 MatchController；弹窗群由 MatchRuntime 另外挂载（解封响应改用本布局的响应条）。

import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useBoardModel } from '../model/useBoardModel';
import { buildSeatViews } from '../model/seatModel';
import { markersBySeat } from '../seatMarkers';
import type { MatchController } from '../controllerTypes';
import { MatchOutcome } from '../shared/MatchOutcome';
import { PreloadLine } from '../shared/PreloadLine';
import { MobileDock } from './MobileDock';
import { MobileLayerChips } from './MobileLayerChips';
import { MobileNotices } from './MobileNotices';
import { MobileRail } from './MobileRail';
import { MobileTopBar } from './MobileTopBar';
import { MobileTower } from './MobileTower';
import { buildLayerChips } from '../model/boardModel';

interface MobileLayoutProps {
  readonly controller: MatchController;
  /** 顶栏右侧补充内容（好友房显示房间码） */
  readonly topRight?: ReactNode;
  /** 点「再来一局 / 返回大厅」时的回调 */
  readonly onRestart?: () => void;
}

export function MobileLayout({ controller, topRight, onRestart }: MobileLayoutProps) {
  const { t } = useTranslation();
  const { stage, winner } = controller;
  const [dockOpen, setDockOpen] = useState(false);

  const { state, board, focusLayer, focusOn } = useBoardModel(controller);
  const seatMarkers = useMemo(() => (stage ? markersBySeat(stage.seats) : undefined), [stage]);
  const slots = useMemo(
    () => (state ? buildSeatViews(state, seatMarkers) : []),
    [state, seatMarkers],
  );

  return (
    <div
      className="flex h-dvh touch-manipulation flex-col overflow-hidden bg-background pl-safe pr-safe text-foreground"
      data-testid="local-runtime"
      data-layout="mobile"
    >
      <MobileTopBar controller={controller} topRight={topRight} />
      <PreloadLine preload={controller.preload} />

      {!controller.ready && (
        <div className="flex flex-1 items-center justify-center text-sm text-dim">
          {t('localMatch.loading')}
        </div>
      )}
      {controller.error && (
        <p className="shrink-0 px-3 py-2 text-sm text-blood" role="alert">
          {controller.error}
        </p>
      )}

      {state && board && (
        <>
          <MobileLayerChips
            chips={buildLayerChips(board.layers)}
            focusLayer={focusLayer}
            onFocus={focusOn}
          />
          <div className="flex min-h-0 flex-1" data-testid="runtime-stage">
            <MobileRail slots={slots} onOpenDetail={controller.preview.open} />
            <MobileTower board={board} dockOpen={dockOpen} onOpenVault={controller.preview.open} />
          </div>
          <MobileNotices controller={controller} />
          <MobileDock controller={controller} open={dockOpen} onOpenChange={setDockOpen} />
        </>
      )}

      {winner && (
        <MatchOutcome
          winner={winner}
          winReason={controller.winReason}
          isRemote={controller.isRemote}
          onRestart={onRestart}
        />
      )}
    </div>
  );
}
