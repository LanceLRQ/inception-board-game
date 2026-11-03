import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { MatchController } from '../controllerTypes';
import { tintLayerAttr } from '../../../theme/layerTints';
import { useBoardModel } from '../model/useBoardModel';
import { MatchOutcome } from '../shared/MatchOutcome';
import { PreloadLine } from '../shared/PreloadLine';
import { DesktopDock, type HandReading } from './DesktopDock';
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
  const [reading, setReading] = useState<HandReading>(null);
  const readingCard =
    reading &&
    reading.stamp === `${controller.turn.number}:${controller.turn.phase}` &&
    controller.hand.items[reading.index]?.card === reading.card
      ? reading.card
      : null;
  const { state, board, focusLayer, focusOn } = useBoardModel(controller);

  return (
    <div className="tabletop-desktop">
      <div
        className="tabletop-shell"
        data-testid="local-runtime"
        data-assets-ready={controller.assetsReady}
        data-layout="desktop"
        data-scale={1}
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
          <DesktopStage
            controller={controller}
            readingCard={readingCard}
            state={state}
            board={board}
            onFocusLayer={focusOn}
          >
            <DesktopDock controller={controller} reading={reading} setReading={setReading} />
          </DesktopStage>
        )}

        <footer className="tabletop-footer">
          <span>原版卡片 · 盗梦都市</span>
          <span>原版版权归发行商所有</span>
        </footer>
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
