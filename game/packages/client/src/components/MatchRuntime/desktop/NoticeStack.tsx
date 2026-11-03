// 舞台提示栈：托管横幅与等待提示；需要玩家应答的交互由 MatchDialogs 承载。
import { useEffect } from 'react';
import { SelfTakeoverBanner } from '../../SelfTakeoverBanner';
import { useElementSize } from '../../../hooks/useElementSize';
import type { MatchController } from '../controllerTypes';
import { AwaitingNotice } from '../shared/AwaitingNotice';
import { EDGE_PAD, NOTICE_WIDTH } from './seatPlan';

interface NoticeStackProps {
  readonly controller: MatchController;
  /** 提示栈占用的高度（含留白）；没有提示为 0 */
  readonly onReserve: (height: number) => void;
}

export function NoticeStack({ controller, onReserve }: NoticeStackProps) {
  const { turn, takeover } = controller;
  const [ref, size] = useElementSize<HTMLDivElement>();
  const height = size.h > 0 ? size.h + EDGE_PAD : 0;
  useEffect(() => {
    onReserve(height);
  }, [height, onReserve]);

  return (
    <div
      ref={ref}
      data-testid="desktop-notices"
      className="absolute right-3 top-3 z-20 flex flex-col gap-2 empty:hidden"
      style={{ width: NOTICE_WIDTH }}
    >
      <SelfTakeoverBanner compact visible={takeover.bannerVisible} onResume={takeover.resume} />
      <AwaitingNotice
        awaiting={turn.awaiting}
        hasResponseUi={controller.response.awaited !== null}
        className="ms-response px-3 py-2"
      />
    </div>
  );
}
