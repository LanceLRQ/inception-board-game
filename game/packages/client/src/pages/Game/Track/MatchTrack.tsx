// MatchTrack - 移动端星穹铁道式对局入口（<1024px）
// 对照：plans/design/06c-match-table-layout.md §2.2

import { useCallback, useMemo, useState } from 'react';
import { cn } from '../../../lib/utils.js';
import { TurnOrderRail } from './TurnOrderRail.js';
import { MasterPanelCollapsible } from './MasterPanelCollapsible.js';
import { CenterPanel } from '../shared/CenterPanel.js';
import { MasterConsole } from '../shared/MasterConsole.js';
import { ActionDock } from '../../../components/ActionDock/index.js';
import { CardDetailModal } from '../../../components/CardDetailModal/index.js';
import { ResponseWindow } from '../../../components/ResponseWindow/index.js';
import { TargetPickerDialog } from '../../../components/TargetPickerDialog/index.js';
import { orderCandidates } from '../../../components/TargetPickerDialog/logic.js';
import { getCardName } from '../../../lib/cards.js';
import { useLegalActions } from '../../../hooks/useLegalActions.js';
import { useGameActions, type PlayIntent } from '../../../hooks/useGameActions.js';
import type { MockMatchState } from '../../../hooks/useMockMatch.js';
import type { CardID } from '@icgame/shared';
import type { HandCard } from '../../../components/HandDrawer/index.js';

export interface MatchTrackProps {
  state: MockMatchState;
  onDispatch?: (intent: Required<PlayIntent>) => void;
}

export function MatchTrack({ state, onDispatch }: MatchTrackProps) {
  const viewer = state.players[state.viewerID];
  const legal = useLegalActions(state);
  const actions = useGameActions({
    legal,
    inResponseWindow: state.pendingUnlock !== null,
    onDispatch,
  });

  const [detailCard, setDetailCard] = useState<CardID | null>(null);
  const isMaster = viewer?.faction === 'master';

  const handCards: HandCard[] = useMemo(
    () =>
      (viewer?.hand ?? []).map((c, i) => ({
        instanceId: `${c}-${i}`,
        cardId: c,
      })),
    [viewer?.hand],
  );

  const handleOpenDetail = useCallback((cardId: string) => {
    if (!cardId || cardId === '__back__') return;
    setDetailCard(cardId as CardID);
  }, []);

  const handlePlayCard = useCallback(
    (_step: 'selectCard' | 'selectTarget', instanceId: string) => {
      const hc = handCards.find((c) => c.instanceId === instanceId);
      if (hc) actions.selectCard(hc.cardId);
    },
    [actions, handCards],
  );

  if (!viewer) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        玩家数据加载中...
      </div>
    );
  }

  const focusLayer = viewer.currentLayer;
  const detailDisableFlip = detailCard ? String(detailCard).startsWith('vault_') : false;

  const pickingTarget = actions.intent.step === 'selectTarget' && actions.intent.cardId;
  const targetCandidates = pickingTarget
    ? orderCandidates({
        state,
        viewerID: state.viewerID,
        legalTargetIds: legal.legalTargetsByCard[actions.intent.cardId as string] ?? new Set(),
        cardId: actions.intent.cardId as CardID,
      })
    : [];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* 顶部状态条 */}
      <header
        className={cn(
          'flex items-center justify-between border-b px-3 py-1.5 text-xs',
          isMaster
            ? 'border-red-500/40 bg-gradient-to-r from-red-900/40 to-card'
            : 'border-border bg-card',
        )}
      >
        <span className={isMaster ? 'text-red-300' : 'text-muted-foreground'}>
          第 {state.turnNumber} 回合
        </span>
        <span className="font-semibold text-foreground">
          {state.currentPlayerID === state.viewerID
            ? '你的回合'
            : (state.players[state.currentPlayerID]?.nickname ?? state.currentPlayerID)}
        </span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px]',
            isMaster ? 'bg-red-500/20 text-red-300' : 'bg-primary/10 text-primary',
          )}
        >
          {state.turnPhase}
        </span>
      </header>

      {/* viewer 是盗梦者 → 顶部梦主折叠专区 */}
      {!isMaster && <MasterPanelCollapsible state={state} onOpenDetail={handleOpenDetail} />}

      {/* 主体：左行动轴 + 中央桌面 */}
      <main className="flex flex-1 overflow-hidden">
        <TurnOrderRail state={state} onOpenDetail={handleOpenDetail} />
        <div className="flex-1 overflow-y-auto p-3">
          <CenterPanel state={state} focusLayer={focusLayer} />

          {/* viewer 是梦主 → 移动端 MasterConsole 也直接展示（替代顶部折叠栏） */}
          {isMaster && (
            <div className="mt-3">
              <MasterConsole state={state} layout="mobile-drawer" onOpenDetail={handleOpenDetail} />
            </div>
          )}
        </div>
      </main>

      {/* 响应窗口 */}
      <ResponseWindow
        active={!!state.pendingUnlock}
        timeout={30}
        label={
          state.pendingUnlock
            ? `${state.players[state.pendingUnlock.playerID]?.nickname ?? '玩家'} 正在解封第 ${state.pendingUnlock.layer} 层`
            : '等待响应'
        }
        canRespond={isMaster || state.viewerID !== state.pendingUnlock?.playerID}
        onRespond={() =>
          onDispatch?.({
            step: 'confirm',
            cardId: 'action_unlock_cancel' as CardID,
            targetPlayerID: '',
            targetLayer: -1,
          })
        }
        onPass={() =>
          onDispatch?.({
            step: 'confirm',
            cardId: 'action_pass' as CardID,
            targetPlayerID: '',
            targetLayer: -1,
          })
        }
        onTimeout={() =>
          onDispatch?.({
            step: 'confirm',
            cardId: 'action_pass' as CardID,
            targetPlayerID: '',
            targetLayer: -1,
          })
        }
      />

      {/* 底部 ActionDock（手牌强制走抽屉） */}
      <ActionDock
        viewer={viewer}
        hand={handCards}
        playableCardIds={legal.playableCardIds as Set<string>}
        isCurrent={state.currentPlayerID === state.viewerID}
        onPlayCard={handlePlayCard}
        onCardDetail={handleOpenDetail}
        intentStep={actions.intent.step}
        forceDrawerMode
      />

      {/* 目标选择弹层 */}
      <TargetPickerDialog
        open={!!pickingTarget}
        candidates={targetCandidates}
        cardName={actions.intent.cardId ? getCardName(actions.intent.cardId as CardID) : undefined}
        onSelect={(pid) => actions.selectTarget(pid)}
        onCancel={actions.cancel}
      />

      {/* 卡牌详情 */}
      <CardDetailModal
        cardId={detailCard}
        onClose={() => setDetailCard(null)}
        disableFlip={detailDisableFlip}
      />
    </div>
  );
}

export default MatchTrack;
