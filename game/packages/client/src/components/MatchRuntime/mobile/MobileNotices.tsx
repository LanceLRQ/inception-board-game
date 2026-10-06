// 手牌坞上方的提示区：托管横幅、等待提示、解封响应条
// 都收在这里，不占主体高度；没有任何提示时整块不渲染。

import { SelfTakeoverBanner } from '../../SelfTakeoverBanner';
import type { MatchController } from '../controllerTypes';
import { AwaitingNotice } from '../shared/AwaitingNotice';
import { MobileAwaitedBar } from './MobileAwaitedBar';
import { MobileResponseBar } from './MobileResponseBar';

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
      <MobileResponseBar controller={controller} />
      <MobileAwaitedBar controller={controller} />
    </div>
  );
}
