// 对局界面的经典布局：顶栏 + 舞台 + 梦主层级总览 + 「你的状态」手牌 + 操作按钮 + 玩家明细
// 只读控制层 MatchController；弹窗群由调用方通过 children 放进来（保持挂在版权 footer 之前的原位置）。

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, RotateCcw, Skull, Timer, Trophy } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getCardName, getCharacterSkillSummary } from '../../lib/cards';
import { getCardImageUrl, GENERIC_BACK_IMAGES } from '../../lib/cardImages';
import { LayerMap } from '../LayerMap';
import { ActiveSkillPanel } from '../ActiveSkillPanel';
import { CopyrightNotice } from '../CopyrightNotice';
import { SeatStatusBadges } from '../SeatStatusBadges';
import { SelfTakeoverBanner } from '../SelfTakeoverBanner';
import { RuntimeStage } from './RuntimeStage';
import type { MatchController } from './controllerTypes';

interface ClassicLayoutProps {
  readonly controller: MatchController;
  /** 顶部状态栏右上角补充文字（好友房可显示房间码） */
  readonly topRight?: ReactNode;
  /** 点「再来一局」时的回调 */
  readonly onRestart?: () => void;
  /** 弹窗群等需要挂在整页容器内的节点，渲染在版权 footer 之前 */
  readonly children?: ReactNode;
}

function CharacterSummary({ characterId }: { characterId: string }) {
  const summary = getCharacterSkillSummary(characterId);
  if (!summary) return null;
  const imgUrl = getCardImageUrl(characterId);
  return (
    <div
      className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-1 text-xs"
      title={summary.skills.map((s) => `${s.name}：${s.description}`).join('\n')}
      data-testid="human-character"
    >
      {imgUrl && (
        <img
          src={imgUrl}
          alt={summary.name}
          loading="lazy"
          className="h-16 w-[44px] rounded-sm object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      <div className="flex flex-col">
        <span className="font-semibold text-primary">{summary.name}</span>
        {summary.skills[0] && (
          <span className="text-[10px] text-muted-foreground">· {summary.skills[0].name}</span>
        )}
      </div>
    </div>
  );
}

/** 其他玩家列表行内的角色小缩略图。
 *  - characterId 已揭示 → 显示角色图
 *  - characterId 被过滤（空字符串）→ 用阵营对应的通用"背面"图
 *    （梦主用梦主背，盗梦者用盗梦者背，让玩家至少能看到阵营轮廓）
 */
function PlayerMiniAvatar({ characterId, isMaster }: { characterId: string; isMaster: boolean }) {
  const revealedUrl = getCardImageUrl(characterId);
  const imgUrl = revealedUrl ?? (isMaster ? GENERIC_BACK_IMAGES.master : GENERIC_BACK_IMAGES.thief);
  const summary = getCharacterSkillSummary(characterId);
  const label = summary?.name ?? (isMaster ? '梦主（未揭示）' : '盗梦者（未揭示）');
  return (
    <img
      src={imgUrl}
      alt={label}
      title={label}
      loading="lazy"
      className="h-10 w-[28px] flex-shrink-0 rounded-sm object-cover"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}

export function ClassicLayout({ controller, topRight, onRestart, children }: ClassicLayoutProps) {
  const { t } = useTranslation();
  const { turn, hand, play, actions, self, preload, winner, winReason, skillPanel } = controller;
  const { isMine: isMyTurn, phase: turnPhase } = turn;
  const { pending: effectivePending } = play;
  const otherTurn = t(turn.otherTurn.key, turn.otherTurn.params);

  return (
    <div className="min-h-screen bg-background p-4 text-foreground" data-testid="local-runtime">
      {/* 卡图预载进度条（对局启动时后台拉取；完成后 800ms 淡出） */}
      {preload && preload.total > 0 && (
        <div
          className={cn(
            'mb-3 flex items-center gap-3 rounded-md border border-border bg-card/60 px-3 py-1.5 text-[11px] transition-opacity duration-500',
            preload.loaded === preload.total ? 'opacity-40' : 'opacity-100',
          )}
          role="status"
          aria-live="polite"
          data-testid="asset-preload-progress"
        >
          <span className="text-muted-foreground">
            {preload.loaded === preload.total ? (
              <span className="inline-flex items-center gap-1">
                卡图就绪
                <Check className="h-3 w-3" aria-hidden />
              </span>
            ) : (
              '卡图加载中'
            )}
          </span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-200"
              style={{
                width: `${Math.round((preload.loaded / preload.total) * 100)}%`,
              }}
            />
          </div>
          <span className="font-mono text-muted-foreground">
            {preload.loaded}/{preload.total}
            {preload.failed > 0 && (
              <span className="ml-1 text-destructive">· {preload.failed} 失败</span>
            )}
          </span>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between rounded-lg bg-card px-4 py-2 shadow-sm">
        <div className="text-sm">
          {t('localMatch.turn')} {turn.number}
          <span className="ml-2 text-muted-foreground">{t(`localMatch.phase.${turnPhase}`)}</span>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'text-sm font-medium',
              isMyTurn ? 'text-primary' : 'text-muted-foreground',
            )}
            data-testid="turn-indicator"
          >
            {isMyTurn ? t('localMatch.yourTurn') : otherTurn}
          </div>
          {turn.deadlineSeconds !== null && (
            <div
              className="flex items-center gap-1 text-sm font-medium tabular-nums"
              data-testid="deadline"
            >
              <Timer className="h-4 w-4" aria-hidden />
              {t('match.deadline', {
                seconds: turn.deadlineSeconds,
                defaultValue: '剩余 {{seconds}} 秒',
              })}
            </div>
          )}
          {topRight}
        </div>
      </div>

      <SelfTakeoverBanner
        visible={controller.takeover.bannerVisible}
        onResume={controller.takeover.resume}
      />

      {turn.awaiting && (
        <div
          className="mb-4 rounded-md border border-border bg-card/60 px-3 py-2 text-sm text-muted-foreground"
          role="status"
          data-testid="awaiting-notice"
        >
          {turn.awaiting.mine
            ? t('match.waiting_auto', {
                defaultValue: '这一步暂时不能手动操作，到时间后由系统代为处理',
              })
            : t('match.waiting_others', { defaultValue: '等待其他玩家应答' })}
        </div>
      )}

      {winner && (
        <div
          className="mb-4 rounded-lg bg-card p-6 text-center shadow-md"
          data-testid="winner-banner"
        >
          <Trophy className="mx-auto mb-2 h-8 w-8 text-acc-bright" />
          <h2 className="text-xl font-bold">
            {winner === 'thief' ? t('localMatch.thiefWins') : t('localMatch.masterWins')}
          </h2>
          {winReason && (
            <p className="mt-1 text-xs text-muted-foreground" data-testid="win-reason">
              {t(`localMatch.winReason.${winReason}`, {
                defaultValue: winReason,
              })}
            </p>
          )}
          <button
            type="button"
            onClick={onRestart}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground"
            data-testid="restart-button"
          >
            <RotateCcw className="h-4 w-4" />
            {controller.isRemote
              ? t('match.back_to_lobby', { defaultValue: '返回大厅' })
              : t('localMatch.restart')}
          </button>
        </div>
      )}

      {/* 新 UI 围坐/星穹行动轴 · 只做视觉展示；选目标仍走弹窗群 */}
      {controller.stage && (
        <div className="mb-4">
          <RuntimeStage
            G={controller.stage.G}
            ctx={controller.stage.ctx}
            humanPlayerID={controller.stage.humanPlayerID}
            seats={controller.stage.seats}
          />
        </div>
      )}

      {/* LayerMap 旧视图：收起为"梦主层总览"次要视图（仅梦主人类时保留可读信息） */}
      {controller.overview.layers.length > 0 && self?.faction === 'master' && (
        <details className="mb-4 rounded-md border border-border bg-card/40 p-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            层级总览（旧视图 · 详细心锁/金库清单）
          </summary>
          <div className="mt-2">
            <LayerMap
              layers={controller.overview.layers}
              players={controller.overview.players}
              humanPlayerId={controller.viewerSeat}
              dreamMasterId={controller.dreamMasterID}
              currentPlayerId={turn.currentSeat}
              onCardPreview={controller.preview.open}
            />
          </div>
        </details>
      )}

      {self && (
        <div className="mb-4 rounded-lg border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">{t('localMatch.yourInfo')}</span>
            {self.characterId && (
              <button
                type="button"
                onClick={() => controller.preview.open(self.characterId)}
                className="inline-block transition-transform hover:scale-[1.02]"
                aria-label="查看自己角色详情"
                data-testid="human-character-preview"
              >
                <CharacterSummary characterId={self.characterId} />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>
              {t('localMatch.faction')}：{self.faction}
            </span>
            <span>
              {t('localMatch.layer')}：{self.layer}
            </span>
            <span>
              {t('localMatch.alive')}：{self.isAlive ? 'Yes' : 'No'}
            </span>
            {self.bribeReceived > 0 && (
              <span
                className="rounded bg-acc-soft px-1.5 py-0.5 text-acc-bright"
                data-testid="human-bribe-received"
              >
                {t('localMatch.bribeReceived', { n: self.bribeReceived })}
              </span>
            )}
          </div>
          {hand.available && (
            <>
              {hand.mustDiscard && (
                <div className="mt-2 text-xs text-acc-bright">
                  {t('localMatch.mustDiscard', { n: hand.overflow })}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1" data-testid="human-hand">
                {hand.items.map((item) => {
                  const { card, index: i, mode, selected, pending: isPending } = item;
                  // 长按 500ms / 双击 → 打开预览
                  let pressTimer: ReturnType<typeof setTimeout> | null = null;
                  const startPress = () => {
                    pressTimer = setTimeout(() => {
                      controller.preview.open(card);
                      pressTimer = null;
                    }, 500);
                  };
                  const cancelPress = () => {
                    if (pressTimer) {
                      clearTimeout(pressTimer);
                      pressTimer = null;
                    }
                  };
                  return (
                    <button
                      key={`${card}-${i}`}
                      type="button"
                      onPointerDown={startPress}
                      onPointerUp={cancelPress}
                      onPointerLeave={cancelPress}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        controller.preview.open(card);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        controller.preview.open(card);
                      }}
                      onClick={() => hand.tap(card)}
                      className={cn(
                        'relative flex h-[108px] w-[76px] flex-col items-center justify-end overflow-hidden rounded-md border-2 transition-all',
                        selected && 'border-destructive ring-2 ring-destructive/40',
                        isPending && 'border-primary ring-2 ring-primary/40 scale-[1.03]',
                        !selected && !isPending && 'border-border bg-muted',
                        mode !== 'idle' &&
                          !selected &&
                          !isPending &&
                          'hover:border-primary/60 hover:scale-[1.02]',
                        mode === 'idle' && 'opacity-60',
                      )}
                      data-testid={`card-${i}`}
                      title={item.name}
                    >
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          loading="lazy"
                          className="absolute inset-0 h-full w-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      )}
                      <span className="relative z-10 w-full bg-background/80 px-1 py-0.5 text-center text-[10px] leading-tight text-foreground">
                        {item.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* 角色主动技能面板（影子·潜伏 / 阿波罗·崇拜） */}
      {skillPanel && (
        <ActiveSkillPanel
          context={skillPanel.context}
          availableTargetIds={skillPanel.targetIds}
          playerNicknames={skillPanel.nicknames}
          onInvoke={skillPanel.invoke}
        />
      )}

      {isMyTurn && !winner && (
        <div className="mb-4 flex flex-wrap gap-2">
          {turnPhase === 'draw' && (
            <button
              type="button"
              onClick={actions.draw}
              className="flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground"
              data-testid="action-draw"
            >
              {t('localMatch.draw')}
            </button>
          )}
          {turnPhase === 'action' && !effectivePending && hand.overflow > 0 && (
            <div
              className="w-full rounded-md border border-acc/40 bg-acc/10 px-3 py-2 text-xs text-acc-bright"
              data-testid="action-hand-overflow-warning"
            >
              {t('localMatch.endActionHandWarn', {
                n: hand.overflow,
                defaultValue: '本回合结束需弃 {{n}} 张（手牌超出 5 张上限）',
              })}
            </div>
          )}
          {turnPhase === 'action' && !effectivePending && (
            <button
              type="button"
              onClick={actions.endAction}
              className="flex items-center gap-1 rounded-full bg-muted px-4 py-2 text-sm text-muted-foreground"
              data-testid="action-end"
            >
              <ArrowRight className="h-4 w-4" />
              {t('localMatch.endAction')}
            </button>
          )}

          {/* 无目标出牌（解封 / 造物）：显示确认按钮 */}
          {turnPhase === 'action' && effectivePending?.needsTarget === 'none' && (
            <>
              <button
                type="button"
                onClick={() => void play.confirmNoTarget()}
                className="flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground"
                data-testid="action-confirm-play"
              >
                {t('localMatch.confirmPlay', { card: getCardName(effectivePending.card) })}
              </button>
              <button
                type="button"
                onClick={play.cancel}
                className="flex items-center gap-1 rounded-full border border-muted px-4 py-2 text-sm text-muted-foreground"
                data-testid="action-cancel-play"
              >
                {t('common.cancel')}
              </button>
            </>
          )}

          {/* 目标玩家 / 目标层选择已迁至全局 Dialog（TargetPlayerPickerDialog /
              TargetLayerPickerDialog），挂载在弹窗群里。
              */}
          {turnPhase === 'discard' && hand.overflow === 0 && (
            <button
              type="button"
              onClick={actions.skipDiscard}
              className="flex items-center gap-1 rounded-full bg-muted px-4 py-2 text-sm text-muted-foreground"
              data-testid="action-skip-discard"
            >
              {t('localMatch.skipDiscard')}
            </button>
          )}
          {turnPhase === 'discard' && hand.overflow > 0 && (
            <button
              type="button"
              disabled={!actions.canConfirmDiscard}
              onClick={actions.confirmDiscard}
              className="flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
              data-testid="action-confirm-discard"
            >
              {t('localMatch.confirmDiscard', {
                selected: actions.discardSelected,
                required: actions.discardRequired,
              })}
            </button>
          )}
        </div>
      )}

      {/* 贿赂派发：遵循桌游规则（仅在梦境窥视/金币金库触发的响应窗口中进行），
          常驻主动派发 UI 已移除；决策入口走 MasterPeekBribeBanner 等响应式组件。
          对照：docs/manual/03-game-flow.md §贿赂&背叛者 / docs/manual/04-action-cards.md 梦境窥视 */}

      {/* 内联 picker 面板（棋局·易位 / 梦境穿梭剂 mode / 万有引力 / 嫁接）
          均已迁至 Dialog（ChessTransposeDialog / DreamTransitModeDialog /
          GravityTargetPickerDialog / GravityPoolPickerDialog / GraftResolverDialog），
          挂载在弹窗群里。
          */}

      {/* 玩家紧凑列表（旧视图）：收起为次要信息；主要展示由 RuntimeStage 承载 */}
      {controller.playerRows && (
        <details className="rounded-md border border-border bg-card/40 p-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            玩家明细（阵营/层/手牌数 紧凑列表）
          </summary>
          <div className="mt-2 space-y-1">
            {controller.playerRows.map((row) => (
              <div
                key={row.id}
                className={cn(
                  'flex items-center gap-2 rounded px-2 py-1',
                  row.isCurrent ? 'bg-primary/10' : 'bg-background',
                  row.isSelf && 'ring-1 ring-primary/30',
                )}
              >
                <button
                  type="button"
                  onClick={() => row.characterId && controller.preview.open(row.characterId)}
                  className="flex-shrink-0 transition-transform hover:scale-110 disabled:cursor-default"
                  aria-label={`查看 ${row.characterId || '未揭示角色'}`}
                  data-testid={`player-avatar-${row.id}`}
                  disabled={!row.characterId}
                >
                  <PlayerMiniAvatar characterId={row.characterId} isMaster={row.isMaster} />
                </button>
                <span className="font-medium">
                  {row.isSelf ? t('localMatch.you') : row.otherName}
                </span>
                <SeatStatusBadges markers={row.markers} seatId={row.id} size="sm" />
                <span className="text-muted-foreground">{row.faction}</span>
                <span className="text-muted-foreground">L{row.layer}</span>
                {!row.isAlive && <Skull className="h-3 w-3 text-destructive" />}
                <span className="ml-auto text-muted-foreground">
                  {t('localMatch.cards')}：{row.handCount}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {!controller.ready && (
        <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
          {t('localMatch.loading')}
        </div>
      )}

      {controller.error && <p className="mt-4 text-sm text-destructive">{controller.error}</p>}

      {children}

      {/* 版权 footer · 对局内常驻，满足 CC-BY-NC 四重展示约束 */}
      <CopyrightNotice
        variant="footer"
        className="mt-6 border-t border-border/40 bg-background/70 py-2 backdrop-blur-sm"
      />
    </div>
  );
}
