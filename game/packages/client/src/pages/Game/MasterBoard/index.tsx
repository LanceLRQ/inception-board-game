// MasterBoard - 梦主移动端视角（Tab 切换：战场 / 世界观+梦魇）
// 对照：plans/design/06-frontend-design.md §6.3.3 梦主视角
//
// Tab A · 战场：复用 ThiefBoard 的组件，但可见贿赂池 + 金库内容 + 盗梦者身份
// Tab B · 控制台：世界观规则 + 梦魇解封（Phase 3 接入真实效果）

import { useState } from 'react';
import { cn } from '../../../lib/utils.js';
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

export interface MasterBoardProps {
  state: MockMatchState;
  onDispatch?: (intent: Required<PlayIntent>) => void;
}

type TabKey = 'field' | 'console';

export function MasterBoard({ state, onDispatch }: MasterBoardProps) {
  const viewer = state.players[state.viewerID];
  const legal = useLegalActions(state);
  const actions = useGameActions({
    legal,
    inResponseWindow: state.pendingUnlock !== null,
    onDispatch,
  });

  const [tab, setTab] = useState<TabKey>('field');
  const [detailCard, setDetailCard] = useState<CardID | null>(null);

  if (!viewer) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        梦主数据加载中...
      </div>
    );
  }

  const handCards: HandCard[] = (viewer.hand ?? []).map((c, i) => ({
    instanceId: `${c}-${i}`,
    cardId: c,
  }));

  const otherPlayers = state.playerOrder
    .filter((id) => id !== state.viewerID)
    .map((id) => state.players[id]!)
    .filter(Boolean);

  return (
    <div className="relative flex min-h-screen flex-col bg-background pb-32 md:pb-40">
      {/* === 顶部：梦主专属红色调 === */}
      <header className="flex items-center justify-between border-b-2 border-red-500/40 bg-gradient-to-r from-red-900/40 to-card px-4 py-2 text-sm">
        <div className="flex flex-col">
          <span className="text-xs text-red-300">梦主视角 · 第 {state.turnNumber} 回合</span>
          <span className="font-semibold text-foreground">
            {state.currentPlayerID === state.viewerID
              ? '你的回合'
              : `轮到 ${state.currentPlayerID}`}
          </span>
        </div>
        <span className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-medium text-red-300">
          {state.turnPhase}
        </span>
      </header>

      {/* === Tab 切换 === */}
      <div className="flex border-b border-border bg-card" role="tablist" aria-label="梦主视图">
        <TabButton active={tab === 'field'} onClick={() => setTab('field')}>
          战场
        </TabButton>
        <TabButton active={tab === 'console'} onClick={() => setTab('console')}>
          世界观 / 梦魇
        </TabButton>
      </div>

      {tab === 'field' && (
        <>
          {/* 盗梦者玩家栏 */}
          <section
            className="flex gap-2 overflow-x-auto border-b border-border bg-card/50 px-3 py-2 md:grid md:grid-cols-3 md:gap-3 md:overflow-visible"
            aria-label="盗梦者列表"
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

          {/* 全部 4 层 + 金库（梦主能看全部） */}
          <section className="space-y-3 p-4 md:mx-auto md:max-w-3xl">
            {[1, 2, 3, 4].map((layer) => {
              const ls = state.layers[layer];
              if (!ls) return null;
              const vaultsHere = state.vaults.filter((v) => v.layer === layer);
              const playersHere = ls.playersInLayer
                .map((pid) => state.players[pid]?.nickname ?? pid)
                .join(' / ');
              const isMe = viewer.currentLayer === layer;
              return (
                <button
                  key={layer}
                  type="button"
                  onClick={
                    legal.masterMoveLayers.has(layer)
                      ? () =>
                          onDispatch?.({
                            step: 'confirm',
                            cardId: '' as CardID,
                            targetPlayerID: '',
                            targetLayer: layer,
                          })
                      : undefined
                  }
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl border p-3 text-left transition-colors',
                    isMe ? 'border-red-500/60 bg-red-500/10 shadow-lg' : 'border-border bg-card',
                    legal.masterMoveLayers.has(layer) &&
                      'border-primary hover:bg-primary/10 cursor-pointer',
                  )}
                >
                  <div>
                    <div className="text-xs text-muted-foreground">第 {layer} 层</div>
                    <div className="text-xs text-foreground">{playersHere || '(空)'}</div>
                    <div className="mt-1 flex gap-1 text-[10px]">
                      {vaultsHere.map((v) => (
                        <span
                          key={v.id}
                          className={
                            'rounded px-1.5 py-0.5 ' +
                            (v.contentType === 'secret'
                              ? 'bg-purple-500/30 text-purple-200'
                              : v.isOpened
                                ? 'bg-green-500/20 text-green-300'
                                : 'bg-slate-700 text-slate-400')
                          }
                        >
                          {v.contentType}
                        </span>
                      ))}
                    </div>
                  </div>
                  <HeartLockIndicator
                    count={ls.heartLockValue}
                    max={Math.max(ls.heartLockValue, 5)}
                  />
                </button>
              );
            })}
          </section>

          {/* 第二步提示 */}
          {actions.intent.step === 'selectTarget' && (
            <div className="mx-4 rounded-md border border-primary/40 bg-primary/10 p-3 text-center text-sm text-primary">
              请点击上方高亮的盗梦者作为目标
              <button type="button" onClick={actions.cancel} className="ml-3 underline">
                取消
              </button>
            </div>
          )}

          {actions.intent.step === 'selectLayer' && actions.intent.cardId && (
            <div className="mx-4">
              <LayerSelector
                layers={[1, 2, 3, 4]}
                currentLayer={viewer.currentLayer}
                legalLayers={legal.legalLayersByCard[actions.intent.cardId as string] ?? new Set()}
                onSelect={(layer) => actions.selectLayer(layer)}
              />
            </div>
          )}
        </>
      )}

      {tab === 'console' && (
        <section className="space-y-4 p-4 md:mx-auto md:max-w-3xl">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold text-foreground">激活的世界观</h3>
            <div className="text-xs text-muted-foreground">
              （Phase 3 接入真实世界观卡牌效果展示）
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold text-foreground">梦魇解封</h3>
            <div className="text-xs text-muted-foreground">
              （Phase 3 接入 6 张梦魇牌的触发界面）
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold text-foreground">贿赂池</h3>
            <div className="text-xs text-muted-foreground">（Phase 4 接入贿赂系统）</div>
          </div>
        </section>
      )}

      {/* === 响应窗口（梦主也可能是发起/被动方） === */}
      <ResponseWindow
        active={!!state.pendingUnlock}
        timeout={30}
        label={
          state.pendingUnlock ? `盗梦者正在解封第 ${state.pendingUnlock.layer} 层` : '等待响应'
        }
        canRespond
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
        playableCardIds={legal.playableCardIds as Set<string>}
        onPlayCard={(_step, instanceId) => {
          const cardId = handCards.find((hc) => hc.instanceId === instanceId)?.cardId;
          if (cardId) actions.selectCard(cardId);
        }}
        onCardDetail={(cid) => setDetailCard(cid)}
      />

      <CardDetailModal cardId={detailCard} onClose={() => setDetailCard(null)} />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex-1 px-4 py-3 text-sm font-medium transition-colors',
        active
          ? 'border-b-2 border-red-500 text-red-300'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export default MasterBoard;
