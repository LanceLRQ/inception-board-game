// ThiefBoard - 盗梦者移动端视角
// 对照：plans/design/06-frontend-design.md §6.3 移动端布局
//
// 布局（移动端竖屏）：
//   ┌───────────────────────┐
//   │ 顶部：回合/阶段          │
//   │ 其他玩家栏（横向滚动）     │
//   │ 当前层卡（含心锁+金库）    │
//   │ 层选择器（选梦境穿梭时）  │
//   │ 响应窗口弹层（pending）  │
//   │ 手牌抽屉（底部，上滑展开）│
//   └───────────────────────┘

import { useState, useCallback } from 'react';
import { HandDrawer, type HandCard } from '../../../components/HandDrawer/index.js';
import { PlayerBar } from '../../../components/PlayerBar/index.js';
import { HeartLockIndicator } from '../../../components/HeartLockIndicator/index.js';
import { LayerSelector } from '../../../components/LayerSelector/index.js';
import { CardDetailModal } from '../../../components/CardDetailModal/index.js';
import { ResponseWindow } from '../../../components/ResponseWindow/index.js';
import { useLegalActions } from '../../../hooks/useLegalActions.js';
import { useGameActions, type PlayIntent } from '../../../hooks/useGameActions.js';
import type { MockMatchState } from '../../../hooks/useMockMatch.js';
import type { CardID } from '@icgame/shared';

export interface ThiefBoardProps {
  state: MockMatchState;
  onDispatch?: (intent: Required<PlayIntent>) => void;
}

export function ThiefBoard({ state, onDispatch }: ThiefBoardProps) {
  const viewer = state.players[state.viewerID];
  const legal = useLegalActions(state);
  const actions = useGameActions({
    legal,
    inResponseWindow: state.pendingUnlock !== null,
    onDispatch,
  });

  const [detailCard, setDetailCard] = useState<CardID | null>(null);

  const handleCardClick = useCallback(
    (_step: 'selectCard' | 'selectTarget', cardInstanceId: string) => {
      actions.selectCard(cardInstanceId as CardID);
    },
    [actions],
  );

  if (!viewer) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        玩家数据加载中...
      </div>
    );
  }

  // 手牌实例化：给每张手牌分配唯一 instanceId（mock 环境用 cardId 本身）
  const handCards: HandCard[] = (viewer.hand ?? []).map((c, i) => ({
    instanceId: `${c}-${i}`,
    cardId: c,
  }));
  const playableCardInstanceIds = new Set(
    handCards.filter((hc) => legal.playableCardIds.has(hc.cardId)).map((hc) => hc.instanceId),
  );

  // HandDrawer 传入的 playableCardIds 是按 cardId，我们适配一下
  const playableByCardId = legal.playableCardIds;

  const otherPlayers = state.playerOrder
    .filter((id) => id !== state.viewerID)
    .map((id) => state.players[id]!)
    .filter(Boolean);

  const currentLayerState = state.layers[viewer.currentLayer];
  const vaultsHere = state.vaults.filter((v) => v.layer === viewer.currentLayer);

  const showLayerSelector = actions.intent.step === 'selectLayer';

  return (
    <div className="relative flex min-h-screen flex-col bg-background pb-32 md:pb-40">
      {/* === 顶部状态栏 === */}
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-2 text-sm">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">第 {state.turnNumber} 回合</span>
          <span className="font-semibold text-foreground">
            {state.currentPlayerID === state.viewerID
              ? '你的回合'
              : `轮到 ${state.currentPlayerID}`}
          </span>
        </div>
        <span
          className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
          aria-label={`阶段 ${state.turnPhase}`}
        >
          {state.turnPhase}
        </span>
      </header>

      {/* === 其他玩家栏（水平滚动） === */}
      <section
        className="flex gap-2 overflow-x-auto border-b border-border bg-card/50 px-3 py-2 md:grid md:grid-cols-3 md:gap-3 md:overflow-visible"
        aria-label="其他玩家"
      >
        {otherPlayers.map((p) => (
          <div key={p.id} className="min-w-[140px] md:min-w-0">
            <PlayerBar
              player={p}
              isCurrent={state.currentPlayerID === p.id}
              isLegalTarget={actions.isLegalTarget(p.id)}
              clickable={actions.isLegalTarget(p.id)}
              onClick={() => actions.selectTarget(p.id)}
            />
          </div>
        ))}
      </section>

      {/* === 当前梦境层（主视觉） === */}
      <section className="flex-1 px-4 py-4 md:mx-auto md:max-w-3xl">
        <div className="space-y-3 rounded-2xl border-2 border-indigo-500/40 bg-gradient-to-br from-indigo-900/40 to-slate-900 p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-indigo-300">你所在层</div>
              <div className="text-3xl font-bold text-foreground">第 {viewer.currentLayer} 层</div>
            </div>
            <HeartLockIndicator
              count={currentLayerState?.heartLockValue ?? 0}
              max={Math.max(currentLayerState?.heartLockValue ?? 0, 5)}
            />
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">同层玩家：</span>
            {currentLayerState?.playersInLayer.map((pid) => (
              <span key={pid} className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-indigo-200">
                {state.players[pid]?.nickname ?? pid}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">金库：</span>
            {vaultsHere.map((v) => (
              <span
                key={v.id}
                className={
                  'rounded px-2 py-0.5 ' +
                  (v.isOpened ? 'bg-green-500/20 text-green-300' : 'bg-slate-700 text-slate-400')
                }
              >
                {v.isOpened ? v.contentType : '???'}
              </span>
            ))}
          </div>
        </div>

        {/* 梦主自由移动层（盗梦者看不到，仅梦主使用） */}

        {/* 第二步：选层 */}
        {showLayerSelector && actions.intent.cardId && (
          <div className="mt-4">
            <LayerSelector
              layers={[1, 2, 3, 4]}
              currentLayer={viewer.currentLayer}
              legalLayers={legal.legalLayersByCard[actions.intent.cardId as string] ?? new Set()}
              onSelect={(layer) => actions.selectLayer(layer)}
              title="选择目标层（梦境穿梭剂）"
            />
            <button
              type="button"
              onClick={actions.cancel}
              className="mt-2 w-full text-sm text-muted-foreground underline"
            >
              取消选择
            </button>
          </div>
        )}

        {/* 第二步：选目标玩家提示（玩家栏已高亮，此处显示文字提示） */}
        {actions.intent.step === 'selectTarget' && (
          <div className="mt-4 rounded-md border border-primary/40 bg-primary/10 p-3 text-center text-sm text-primary">
            请点击上方高亮的玩家作为目标
            <button type="button" onClick={actions.cancel} className="ml-3 underline">
              取消
            </button>
          </div>
        )}

        {/* 确认态：展示完成提示 */}
        {actions.intent.step === 'confirm' && (
          <div className="mt-4 rounded-md border border-green-500/40 bg-green-500/10 p-3 text-center text-sm text-green-300">
            已派发，等待服务端确认...
            <button type="button" onClick={actions.reset} className="ml-3 underline">
              重置
            </button>
          </div>
        )}
      </section>

      {/* === 响应窗口（pendingUnlock 激活时） === */}
      <ResponseWindow
        active={!!state.pendingUnlock}
        timeout={30}
        label={
          state.pendingUnlock
            ? `${state.players[state.pendingUnlock.playerID]?.nickname ?? '玩家'} 正在解封第 ${state.pendingUnlock.layer} 层`
            : '等待响应'
        }
        canRespond={state.viewerID !== state.pendingUnlock?.playerID}
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

      {/* === 手牌抽屉 === */}
      <HandDrawer
        hand={handCards}
        playableCardIds={playableByCardId as Set<string>}
        onPlayCard={handleCardClick}
        onCardDetail={(cid) => setDetailCard(cid)}
      />

      {/* === 卡牌详情弹窗 === */}
      <CardDetailModal cardId={detailCard} onClose={() => setDetailCard(null)} />

      {/* 关闭 unused 警告 */}
      <span className="sr-only">{playableCardInstanceIds.size}</span>
    </div>
  );
}

export default ThiefBoard;
