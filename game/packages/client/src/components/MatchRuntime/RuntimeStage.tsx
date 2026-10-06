// RuntimeStage · MatchRuntime 的"新视觉层"
//
// 职责：展示玩家围坐/行动轴 + 中央桌面（金库/心锁/焦点层），
//      只做视觉和长按详情，不承担出牌/选目标等业务交互（这些仍由 MatchRuntime 的 Dialog 群处理）
//
// 只在 ≥1024px 的经典布局里渲染（TableStage 围坐椭圆 + 中央 CenterPanel）；
// 移动端由 MobileLayout 自己的行动轴与层塔承担。
//
// 选目标：MatchRuntime 已使用 TargetPlayerPickerDialog 弹层完成（符合主人"弹层选目标"要求），
//        本组件上的 Seat 只做查看详情（长按/双击）

import { useMemo, useState } from 'react';
import { cn } from '../../lib/utils.js';
import { TableStage } from '../../pages/Game/Table/TableStage.js';
import { CenterPanel } from '../../pages/Game/shared/CenterPanel.js';
import { CardDetailModal } from '../CardDetailModal/index.js';
import { adaptViewToStage } from './viewAdapter.js';
import { markersBySeat } from './seatMarkers.js';
import type { MatchView, RunnerCtx, SeatInfo } from '@icgame/game-engine';
import type { CardID } from '@icgame/shared';

export interface RuntimeStageProps {
  G: MatchView;
  ctx: Pick<RunnerCtx, 'currentPlayer'>;
  humanPlayerID: string;
  /** 对局来源的座位表；用于在舞台座位上显示 Bot / 掉线 / 托管标识 */
  seats?: readonly SeatInfo[];
  className?: string;
}

export function RuntimeStage({ G, ctx, humanPlayerID, seats, className }: RuntimeStageProps) {
  const [detailCard, setDetailCard] = useState<CardID | null>(null);
  const seatMarkers = useMemo(() => (seats ? markersBySeat(seats) : undefined), [seats]);

  const state = adaptViewToStage({ G, ctx, humanPlayerID });
  if (!state) return null;

  const viewer = state.players[humanPlayerID];
  const focusLayer = viewer?.currentLayer ?? 1;

  const handleOpenDetail = (cardId: string) => {
    if (!cardId || cardId === '__back__') return;
    setDetailCard(cardId as CardID);
  };

  // 金库正面查看后禁翻面（已公开，但背面属机密）
  const detailDisableFlip = detailCard ? String(detailCard).startsWith('vault_') : false;

  return (
    <div className={cn('relative', className)} data-testid="runtime-stage">
      <TableStage
        state={state}
        onOpenCharacterDetail={handleOpenDetail}
        seatMarkers={seatMarkers}
        centerSlot={<CenterPanel state={state} focusLayer={focusLayer} />}
      />

      <CardDetailModal
        cardId={detailCard}
        onClose={() => setDetailCard(null)}
        disableFlip={detailDisableFlip}
      />
    </div>
  );
}
