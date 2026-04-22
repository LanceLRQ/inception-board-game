// MatchTable - PC 围坐桌面入口（≥1024px）
// 对照：plans/design/06c-match-table-layout.md §2.1
//
// 组合：顶部状态条 + TableStage（围坐 + 中央桌面）+ 右侧 MasterConsole（仅梦主）+ 底部 ActionDock + 响应窗口 + CardDetailModal

import { useCallback, useMemo, useState } from 'react';
import { cn } from '../../../lib/utils.js';
import { TableStage } from './TableStage.js';
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

export interface MatchTableProps {
  state: MockMatchState;
  onDispatch?: (intent: Required<PlayIntent>) => void;
}

export function MatchTable({ state, onDispatch }: MatchTableProps) {
  const viewer = state.players[state.viewerID];
  const legal = useLegalActions(state);
  const actions = useGameActions({
    legal,
    inResponseWindow: state.pendingUnlock !== null,
    onDispatch,
  });

  const [detailCard, setDetailCard] = useState<CardID | null>(null);
  const isMaster = viewer?.faction === 'master';

  // 焦点层：盗梦者视角用自己所在层；梦主默认 L1，可扩展切换（Phase 4）
  const [focusLayer, setFocusLayer] = useState<number>(viewer?.currentLayer ?? 1);

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

  // 金库卡详情禁翻面（背面属机密）
  const detailDisableFlip = detailCard ? String(detailCard).startsWith('vault_') : false;

  // 目标选择弹层：actions.intent.step === 'selectTarget' 时打开
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
      {/* === 顶部状态条 === */}
      <header
        className={cn(
          'flex items-center justify-between border-b px-4 py-2 text-sm',
          isMaster
            ? 'border-red-500/40 bg-gradient-to-r from-red-900/40 to-card'
            : 'border-border bg-card',
        )}
      >
        <div className="flex flex-col">
          <span className={cn('text-xs', isMaster ? 'text-red-300' : 'text-muted-foreground')}>
            {isMaster ? '梦主视角' : '盗梦者视角'} · 第 {state.turnNumber} 回合
          </span>
          <span className="font-semibold text-foreground">
            {state.currentPlayerID === state.viewerID
              ? '你的回合'
              : `轮到 ${state.players[state.currentPlayerID]?.nickname ?? state.currentPlayerID}`}
          </span>
        </div>
        <span
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium',
            isMaster ? 'bg-red-500/20 text-red-300' : 'bg-primary/10 text-primary',
          )}
          aria-label={`阶段 ${state.turnPhase}`}
        >
          {state.turnPhase}
        </span>
      </header>

      {/* === 主体：围坐舞台 + 梦主控制台 === */}
      <main className="flex flex-1 gap-4 p-4">
        <div className="flex-1">
          <TableStage
            state={state}
            onOpenCharacterDetail={handleOpenDetail}
            centerSlot={<CenterPanel state={state} focusLayer={focusLayer} />}
          />

          {/* 响应窗口（pendingUnlock 激活） */}
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
        </div>

        {isMaster && (
          <MasterConsole state={state} layout="pc-sidebar" onOpenDetail={handleOpenDetail} />
        )}
      </main>

      {/* === 底部 ActionDock === */}
      <ActionDock
        viewer={viewer}
        hand={handCards}
        playableCardIds={legal.playableCardIds as Set<string>}
        isCurrent={state.currentPlayerID === state.viewerID}
        onPlayCard={handlePlayCard}
        onCardDetail={handleOpenDetail}
        intentStep={actions.intent.step}
        skills={
          isMaster && (
            <>
              {[1, 2, 3, 4].map((l) =>
                legal.masterMoveLayers.has(l) ? (
                  <button
                    key={l}
                    type="button"
                    onClick={() =>
                      onDispatch?.({
                        step: 'confirm',
                        cardId: '' as CardID,
                        targetPlayerID: '',
                        targetLayer: l,
                      })
                    }
                    className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20"
                  >
                    移至 L{l}
                  </button>
                ) : null,
              )}
              <button
                type="button"
                onClick={() => setFocusLayer((l) => (l % 4) + 1)}
                className="rounded-md border border-border bg-card px-2 py-1 text-xs"
              >
                焦点 L{focusLayer} ↻
              </button>
            </>
          )
        }
      />

      {/* === 目标选择弹层 === */}
      <TargetPickerDialog
        open={!!pickingTarget}
        candidates={targetCandidates}
        cardName={actions.intent.cardId ? getCardName(actions.intent.cardId as CardID) : undefined}
        onSelect={(pid) => actions.selectTarget(pid)}
        onCancel={actions.cancel}
      />

      {/* === 卡牌详情弹窗 === */}
      <CardDetailModal
        cardId={detailCard}
        onClose={() => setDetailCard(null)}
        disableFlip={detailDisableFlip}
      />
    </div>
  );
}

export default MatchTable;
