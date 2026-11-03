// 手牌坞上方的提示区：托管横幅与等待提示；需要玩家应答的交互由 MatchDialogs 承载。
import { SelfTakeoverBanner } from '../../SelfTakeoverBanner';
import type { MatchController } from '../controllerTypes';
import { AwaitingNotice } from '../shared/AwaitingNotice';

interface MobileNoticesProps {
  readonly controller: MatchController;
}

export function MobileNotices({ controller }: MobileNoticesProps) {
  const { turn, takeover } = controller;
  return (
    <div className="shrink-0" data-testid="mobile-notices">
      <SelfTakeoverBanner compact visible={takeover.bannerVisible} onResume={takeover.resume} />
      <AwaitingNotice
        awaiting={turn.awaiting}
        hasResponseUi={controller.response.awaited !== null}
        className="border-t border-line bg-panel px-3 py-1.5"
      />
    </div>
  );
}
