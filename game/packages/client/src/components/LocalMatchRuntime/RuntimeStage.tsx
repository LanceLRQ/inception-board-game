// RuntimeStage · LocalMatchRuntime 的"新视觉层"
// 对照：plans/design/06c-match-table-layout.md §2
//
// 职责：展示玩家围坐/行动轴 + 中央桌面（金库/心锁/焦点层），
//      只做视觉和长按详情，不承担出牌/选目标等业务交互（这些仍由 LocalMatchRuntime 的 Dialog 群处理）
//
// 断点：
//   ≥1024px (PC) → TableStage 围坐椭圆 + 中央 CenterPanel
//   <1024px (移动) → TurnOrderRail 星穹轴 + 中央 CenterPanel
//
// 选目标：LocalMatchRuntime 已使用 TargetPlayerPickerDialog 弹层完成（符合主人"弹层选目标"要求），
//        本组件上的 Seat/Slot 只做查看详情（长按/双击）

import { useState } from 'react';
import { cn } from '../../lib/utils.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { TableStage } from '../../pages/Game/Table/TableStage.js';
import { TurnOrderRail } from '../../pages/Game/Track/TurnOrderRail.js';
import { CenterPanel } from '../../pages/Game/shared/CenterPanel.js';
import { CardDetailModal } from '../CardDetailModal/index.js';
import { adaptBGIOtoMockState } from './bgioAdapter.js';
import type { CardID } from '@icgame/shared';

export interface RuntimeStageProps {
  G: Record<string, unknown>;
  ctx: Record<string, unknown>;
  humanPlayerID?: string;
  className?: string;
}

export function RuntimeStage({ G, ctx, humanPlayerID = '0', className }: RuntimeStageProps) {
  const [detailCard, setDetailCard] = useState<CardID | null>(null);
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const state = adaptBGIOtoMockState({ G, ctx, humanPlayerID });
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
      {isDesktop ? (
        <TableStage
          state={state}
          onOpenCharacterDetail={handleOpenDetail}
          centerSlot={<CenterPanel state={state} focusLayer={focusLayer} />}
        />
      ) : (
        <div className="flex overflow-hidden rounded-2xl border border-border bg-card/40">
          <TurnOrderRail state={state} onOpenDetail={handleOpenDetail} />
          <div className="flex-1 p-3">
            <CenterPanel state={state} focusLayer={focusLayer} />
          </div>
        </div>
      )}

      <CardDetailModal
        cardId={detailCard}
        onClose={() => setDetailCard(null)}
        disableFlip={detailDisableFlip}
      />
    </div>
  );
}
