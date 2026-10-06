// 移动端对局布局（<1024px）：占满视口、整页不滚动的应用外壳，内部区域各自滚动
// 同一套组件按视口形态（见 viewportMode.ts）有三种排布：
//   手机竖屏 / 平板竖屏：顶栏 → 层级标签 → 主体（行动轴 + 层塔）→ 提示 / 解封响应条 → 一体式手牌坞。
//     平板（≥768px）在此基础上加宽行动轴、放大层塔与手牌，内容区限宽居中。
//   手机横屏（高度 ≤500px）：顶栏之下左右分栏，左边层级标签 + 行动轴 + 层塔，
//     右边提示 / 响应条 + 手牌坞（常驻展开、没有把手），整页不滚动。
// 只读控制层 MatchController；弹窗群由 MatchRuntime 另外挂载（解封响应改用本布局的响应条）。

import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { tintLayerAttr } from '../../../theme/layerTints';
import { useThemeSkin } from '../../../theme/skins/useThemeSkin';
import { useBoardModel } from '../model/useBoardModel';
import { buildSeatViews } from '../model/seatModel';
import { markersBySeat } from '../seatMarkers';
import type { MatchController } from '../controllerTypes';
import { MatchOutcome } from '../shared/MatchOutcome';
import { PreloadLine } from '../shared/PreloadLine';
import { useMobileMode } from './useMobileMode';
import { MobileDock } from './MobileDock';
import { MobileLayerChips } from './MobileLayerChips';
import { MobileNotices } from './MobileNotices';
import { MobileRail } from './MobileRail';
import { RailBubbles } from './RailBubbles';
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
  const mode = useMobileMode();
  const compact = mode === 'compact-landscape';
  const MobileAmbient = useThemeSkin().MobileAmbient;

  const { state, board, focusLayer, focusOn } = useBoardModel(controller);
  const seatMarkers = useMemo(() => (stage ? markersBySeat(stage.seats) : undefined), [stage]);
  const slots = useMemo(
    () => (state ? buildSeatViews(state, seatMarkers) : []),
    [state, seatMarkers],
  );

  return (
    <div
      className="relative isolate mx-auto flex h-dvh w-full touch-manipulation flex-col overflow-hidden bg-background pl-safe pr-safe text-foreground tablet:max-w-[960px]"
      data-testid="local-runtime"
      data-assets-ready={controller.assetsReady}
      data-layout="mobile"
      data-mode={mode}
      data-tint-layer={tintLayerAttr(focusLayer)}
    >
      {MobileAmbient && <MobileAmbient />}
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
        <div className={compact ? 'flex min-h-0 flex-1' : 'contents'}>
          <div className={compact ? 'flex min-w-0 flex-1 flex-col' : 'contents'}>
            <MobileLayerChips
              chips={buildLayerChips(board.layers)}
              focusLayer={focusLayer}
              onFocus={focusOn}
            />
            <div className="flex min-h-0 flex-1" data-testid="runtime-stage">
              <MobileRail slots={slots} onOpenDetail={controller.preview.open} />
              <RailBubbles bubbles={controller.chat.bubbles} />
              <MobileTower
                board={board}
                dockOpen={dockOpen && !compact}
                mode={mode}
                onOpenVault={controller.preview.open}
              />
            </div>
          </div>
          <div
            className={
              compact
                ? 'flex min-h-0 w-[44%] min-w-[300px] max-w-[420px] shrink-0 flex-col border-l border-line'
                : 'contents'
            }
            data-testid="mobile-dock-pane"
          >
            <MobileNotices controller={controller} />
            <MobileDock
              controller={controller}
              open={dockOpen}
              onOpenChange={setDockOpen}
              mode={mode}
            />
          </div>
        </div>
      )}

      {winner && (
        <MatchOutcome
          winner={winner}
          winReason={controller.winReason}
          isRemote={controller.isRemote}
          onRestart={onRestart}
          report={controller.report}
        />
      )}
    </div>
  );
}
