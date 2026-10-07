// 对局弹窗群：响应类弹窗与出牌流程里的选目标 / 选模式 / 多步选择弹窗
// 解封响应不在这里：两个布局各自用内联的响应窗口 / 响应条承载。
// 只依赖控制层 MatchController；不关心页面布局，任何布局都可以直接挂载。

import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { getCardName } from '../../lib/cards';
import { CardDetailModal } from '../CardDetailModal';
import { MasterNightmareDecisionDialog } from '../MasterNightmareDecisionDialog';
import { MasterPeekBribeDialog } from '../MasterPeekBribeDialog';
import { ShooterLayerPickerDialog } from '../ShooterLayerPickerDialog';
import { PeekerVaultRevealDialog } from '../PeekerVaultRevealDialog';
import { MasterBribeInspectDialog } from '../MasterBribeInspectDialog';
import { TargetPlayerPickerDialog } from '../TargetPlayerPickerDialog';
import { TargetLayerPickerDialog } from '../TargetLayerPickerDialog';
import { DreamTransitModeDialog } from '../DreamTransitModeDialog';
import { ChessTransposeDialog } from '../ChessTransposeDialog';
import { GravityTargetPickerDialog } from '../GravityTargetPickerDialog';
import { GravityPoolPickerDialog } from '../GravityPoolPickerDialog';
import { GraftResolverDialog } from '../GraftResolverDialog';
import { ReviveDialog } from '../ReviveDialog';
import { ShootDiceOverlay } from '../ShootDiceOverlay';
import { AwaitedResponseSheet } from './shared/AwaitedResponseSheet';
import type { MatchController } from './controllerTypes';

interface MatchDialogsProps {
  readonly controller: MatchController;
}

export function MatchDialogs({ controller }: MatchDialogsProps) {
  const { t } = useTranslation();
  const { view, viewerSeat, viewerLayer, makeMove, nicknameOf } = controller;
  const { play, gravity, chess, graft, revive, masterMove } = controller;
  const { decree } = play;

  return (
    <>
      {/* SHOOT 骰子动画浮层 */}
      <ShootDiceOverlay
        roll={controller.shootDice.roll}
        onComplete={controller.shootDice.onComplete}
      />

      {/* 本人应答（被 SHOOT 时的响应、天秤、处女、白羊等）里需要选牌 / 分牌 / 选层的弹窗 */}
      <AwaitedResponseSheet controller={controller} />

      {/* 响应类 Dialog 群（互斥业务保证同时只会有一个 open） */}
      <MasterNightmareDecisionDialog
        G={view}
        viewerPlayerID={viewerSeat}
        nicknameOf={nicknameOf}
        makeMove={makeMove}
      />
      <MasterPeekBribeDialog
        G={view}
        viewerPlayerID={viewerSeat}
        nicknameOf={nicknameOf}
        makeMove={makeMove}
      />
      <PeekerVaultRevealDialog G={view} viewerPlayerID={viewerSeat} makeMove={makeMove} />
      <MasterBribeInspectDialog G={view} viewerPlayerID={viewerSeat} makeMove={makeMove} />
      <ShooterLayerPickerDialog
        G={view}
        viewerPlayerID={viewerSeat}
        nicknameOf={nicknameOf}
        cardNameOf={(cardId) => getCardName(cardId)}
        makeMove={makeMove}
      />

      {/* 出牌时选目标玩家（SHOOT / KICK / 念力牵引 / 共鸣 / shift 等） */}
      <TargetPlayerPickerDialog
        pending={play.targetPlayerPending}
        viewerPlayerID={viewerSeat}
        viewerLayer={viewerLayer}
        players={view?.players ?? {}}
        dreamMasterID={view?.dreamMasterID}
        viewerIsMaster={controller.playRole === 'master'}
        bribeHolderIds={controller.bribeHolderIds}
        cardNameOf={(cardId) => getCardName(cardId)}
        onPick={(id) => void play.confirmTargetPlayer(id)}
        onCancel={() => play.cancelTargetPlayer()}
        decreeSlot={
          decree.applicable ? (
            <div
              className="mb-2 flex flex-wrap items-center gap-2 text-[11px]"
              data-testid="decree-picker"
            >
              <span className="text-muted-foreground">
                {t('localMatch.decreeLabel', { defaultValue: '附加死亡宣言：' })}
              </span>
              {decree.options.map((c) => (
                <button
                  key={`decree-${c}`}
                  type="button"
                  onClick={() => decree.toggle(c)}
                  className={cn(
                    'rounded-full border px-2 py-0.5',
                    decree.selected === c
                      ? 'border-acc bg-acc/30 text-acc-bright'
                      : 'border-border bg-card hover:border-acc/60',
                  )}
                  data-testid={`decree-${c}`}
                >
                  {getCardName(c)}
                </button>
              ))}
              {decree.selected && (
                <button
                  type="button"
                  onClick={() => decree.clear()}
                  className="rounded-full border border-muted px-2 py-0.5 text-muted-foreground"
                >
                  {t('localMatch.decreeClear', { defaultValue: '取消宣言' })}
                </button>
              )}
            </div>
          ) : null
        }
      />

      {/* 出牌时选目标层（穿梭剂 / 梦境窥视 / 梦魇解封 等） */}
      <TargetLayerPickerDialog
        pending={play.targetLayerPending}
        viewerLayer={viewerLayer}
        cardNameOf={(cardId) => getCardName(cardId)}
        onPick={(layer) => void play.confirmTargetLayer(layer)}
        onCancel={play.cancel}
      />

      {/* 梦主的免费移动：只能去相邻层 */}
      <TargetLayerPickerDialog
        pending={masterMove.open ? { card: 'freeMove', move: 'dreamMasterMove' } : null}
        viewerLayer={viewerLayer}
        validLayers={[...masterMove.layers]}
        cardNameOf={() => t('entries.move.label')}
        onPick={(layer) => void masterMove.pick(layer)}
        onCancel={masterMove.cancel}
      />

      {/* 复活：自己（在迷失层）或同伴 */}
      <ReviveDialog
        open={revive.open}
        mode={revive.mode}
        targets={revive.targets}
        target={revive.target}
        hand={revive.hand}
        picked={revive.picked}
        required={revive.required}
        onlyTransit={revive.onlyTransit}
        eligible={revive.eligible}
        canConfirm={revive.canConfirm}
        onPickTarget={revive.pickTarget}
        onToggleCard={revive.toggleCard}
        onConfirm={() => void revive.confirm()}
        onCancel={revive.cancel}
      />

      {/* SHOOT·梦境穿梭剂 mode 选择 */}
      <DreamTransitModeDialog
        open={play.dreamTransit.open}
        onChoose={(mode) => play.dreamTransit.choose(mode)}
        onCancel={() => play.dreamTransit.cancel()}
      />

      {/* 棋局·易位（梦主专属） */}
      <ChessTransposeDialog
        open={chess.open}
        vaults={chess.vaults}
        pickedIndices={chess.picked}
        onToggle={chess.toggle}
        onConfirm={() => void chess.confirm()}
        onCancel={() => chess.cancel()}
      />

      {/* 万有引力 · 多目标选择 */}
      <GravityTargetPickerDialog
        open={gravity.pickerOpen}
        viewerPlayerID={viewerSeat}
        options={gravity.options}
        selected={gravity.targets}
        onToggle={gravity.toggle}
        onConfirm={() => void gravity.confirm()}
        onCancel={() => gravity.cancel()}
      />

      {/* 万有引力 · 池挑选（人类 bonder） */}
      <GravityPoolPickerDialog
        open={gravity.pool.open}
        pool={gravity.pool.cards}
        currentPicker={gravity.pool.currentPicker}
        viewerPlayerID={viewerSeat}
        nicknameOf={nicknameOf}
        cardNameOf={(cardId) => getCardName(cardId)}
        onPick={(c) => void gravity.pool.pick(c)}
      />

      {/* 嫁接 · 选 2 张返牌库顶 */}
      <GraftResolverDialog
        open={graft.open}
        hand={graft.hand}
        picked={graft.picked}
        cardNameOf={(cardId) => getCardName(cardId)}
        onToggle={graft.toggle}
        onConfirm={() => void graft.confirm()}
      />

      {/* 长按/双击/右键手牌 或 点击玩家头像 → 卡牌详情预览（双面角色支持翻面） */}
      {/* 金库牌正面已公开，但背面属游戏机密：金库详情不允许翻面 */}
      <CardDetailModal
        cardId={controller.preview.cardId}
        onClose={() => controller.preview.close()}
        disableFlip={controller.preview.cardId?.startsWith('vault_') ?? false}
      />
    </>
  );
}
