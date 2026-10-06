// 桌面端对局布局（≥1024px）：占满视口、整页不滚动的外壳
// 从上到下：片头条 → 舞台（背景氛围 + 座位环 + 中央舞台 + 右上提示栈）→ 底部坞（本人身份 + 手牌 + 操作）。
// 只读控制层 MatchController；弹窗群由 MatchRuntime 另外挂载（解封响应改用本布局的响应窗口）。
// 本布局与主题无关：主题的差异在皮肤的中央舞台、背景氛围与皮肤 CSS 里。
// 大屏（1920×1080、2560×1440 等）整体按 desktopScale 放大：外壳占满视口，内壳取「视口 / 系数」的
// 虚拟尺寸再 transform 放大，舞台内部的排布与字号都按虚拟尺寸计算，卡牌与文字不会在大屏上显得过小。
// 系数以 --ms-scale 暴露给子树，里面用 dvh / vw 的尺寸要除以它。

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CSSProperties } from 'react';
import { useViewportSize } from '../../../hooks/useViewportSize';
import type { MatchController } from '../controllerTypes';
import { desktopScale } from '../viewportMode';
import { tintLayerAttr } from '../../../theme/layerTints';
import { useBoardModel } from '../model/useBoardModel';
import { MatchOutcome } from '../shared/MatchOutcome';
import { PreloadLine } from '../shared/PreloadLine';
import { DesktopDock } from './DesktopDock';
import { DesktopStage } from './DesktopStage';
import { DesktopTopBar } from './DesktopTopBar';

interface DesktopLayoutProps {
  readonly controller: MatchController;
  /** 片头条右侧补充内容（好友房显示房间码） */
  readonly topRight?: ReactNode;
  /** 点「再来一局 / 返回大厅」时的回调 */
  readonly onRestart?: () => void;
}

export function DesktopLayout({ controller, topRight, onRestart }: DesktopLayoutProps) {
  const { t } = useTranslation();
  const { winner } = controller;
  const { state, board, focusLayer, focusOn } = useBoardModel(controller);
  const viewport = useViewportSize();
  const scale = desktopScale(viewport.w, viewport.h);
  const innerStyle: CSSProperties & Record<'--ms-scale', number> =
    scale > 1
      ? {
          width: viewport.w / scale,
          height: viewport.h / scale,
          transform: `scale(${scale})`,
          '--ms-scale': scale,
        }
      : { width: '100%', height: '100%', '--ms-scale': 1 };

  return (
    <div className="h-dvh w-full overflow-hidden bg-background">
      <div
        className="flex origin-top-left flex-col overflow-hidden bg-background text-foreground"
        style={innerStyle}
        data-testid="local-runtime"
        data-assets-ready={controller.assetsReady}
        data-layout="desktop"
        data-scale={scale}
        data-tint-layer={tintLayerAttr(focusLayer)}
      >
        <DesktopTopBar controller={controller} topRight={topRight} />
        <PreloadLine preload={controller.preload} />

        {!controller.ready && (
          <div className="flex flex-1 items-center justify-center text-sm text-dim">
            {t('localMatch.loading')}
          </div>
        )}
        {controller.error && (
          <p className="shrink-0 px-4 py-2 text-sm text-blood" role="alert">
            {controller.error}
          </p>
        )}

        {state && board && (
          <>
            <DesktopStage
              controller={controller}
              state={state}
              board={board}
              onFocusLayer={focusOn}
            />
            <DesktopDock controller={controller} />
          </>
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
    </div>
  );
}
