// 手机全宽层条与手牌分区；横屏并列，溢出仅在各自区域滚动。
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { BoardModelHandle } from '../model/useBoardModel';
import type { MatchController } from '../controllerTypes';
import { MatchOutcome } from '../shared/MatchOutcome';
import { PreloadLine } from '../shared/PreloadLine';
import { useMobileMode } from './useMobileMode';
import { MobileDock } from './MobileDock';
import { MobileNotices } from './MobileNotices';
import { MobileTopBar } from './MobileTopBar';
import { TableBoard } from '../stages/table/TableBoard';
interface MobileLayoutProps {
  readonly controller: MatchController;
  readonly boardHandle: BoardModelHandle;
  /** 顶栏右侧补充内容（好友房显示房间码） */
  readonly topRight?: ReactNode;
  /** 点「再来一局 / 返回大厅」时的回调 */
  readonly onRestart?: () => void;
}

export function MobileLayout({ controller, boardHandle, topRight, onRestart }: MobileLayoutProps) {
  const { t } = useTranslation();
  const mode = useMobileMode();
  const { state, board, focusOn } = boardHandle;
  return (
    <div
      className="tabletop-mobile"
      data-testid="local-runtime"
      data-assets-ready={controller.assetsReady}
      data-layout="mobile"
      data-mode={mode}
    >
      <MobileTopBar controller={controller} topRight={topRight} />
      <PreloadLine preload={controller.preload} />
      {!controller.ready && <p>{t('localMatch.loading')}</p>}
      {controller.error && <p role="alert">{controller.error}</p>}
      {state && board && (
        <main className="tabletop-mobile-workspace">
          <section className="tabletop-mobile-board" data-testid="runtime-stage">
            <header className="tabletop-mobile-heading">
              <h2>深入梦境</h2>
              <span>点击头像与层数查看说明</span>
            </header>
            {controller.winner && (
              <MatchOutcome
                winner={controller.winner}
                winReason={controller.winReason}
                isRemote={controller.isRemote}
                onRestart={onRestart}
                report={controller.report}
              />
            )}
            <TableBoard board={board} onFocusLayer={focusOn} onOpenCard={controller.preview.open} />
          </section>
          <div className="tabletop-mobile-hand-pane" data-testid="mobile-dock-pane">
            <MobileNotices controller={controller} />
            <MobileDock controller={controller} />
          </div>
        </main>
      )}
    </div>
  );
}
