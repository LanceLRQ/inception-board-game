// 手牌坞的操作区：「技能」按钮 + 随阶段变化的主操作按钮（抽牌 / 结束行动 / 跳过弃牌 / 确认弃牌）
// 不是本人回合时主操作禁用并显示「等待」。高度不小于 44px（触控目标下限）。
// 联机对局多一个「短语」图标按钮（44×44）：收起态与「技能」并排，主操作独占下一行；展开态排在技能与主操作之间。

import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { MatchController } from '../controllerTypes';
import { deriveMainAction } from '../model/handDerive';
import { DockEntries } from '../shared/DockEntries';

interface DockOpsProps {
  readonly controller: MatchController;
  /** 有主动技能可用 */
  readonly skillReady: boolean;
  readonly onOpenSkill: () => void;
  /** 联机对局才有短语入口；不给就不显示 */
  readonly onOpenChat?: (() => void) | undefined;
  /** column：收起态右侧竖排；row：展开态底部横排 */
  readonly layout: 'column' | 'row';
}

export function DockOps({ controller, skillReady, onOpenSkill, onOpenChat, layout }: DockOpsProps) {
  const { t } = useTranslation();
  const { turn, actions, hand, winner } = controller;
  const main = deriveMainAction({
    isMine: turn.isMine,
    winner,
    phase: turn.phase,
    overflow: hand.overflow,
    canConfirmDiscard: actions.canConfirmDiscard,
  });
  const onMain = () => {
    if (!main.enabled) return;
    if (main.kind === 'draw') actions.draw();
    else if (main.kind === 'end') actions.endAction();
    else if (main.kind === 'skipDiscard') actions.skipDiscard();
    else if (main.kind === 'confirmDiscard') actions.confirmDiscard();
  };

  const chatButton = onOpenChat && (
    <button
      type="button"
      onClick={onOpenChat}
      aria-label={t('chat.toggle')}
      data-testid="dock-chat"
      className="flex min-h-11 min-w-11 shrink-0 touch-manipulation items-center justify-center border border-line-strong bg-transparent text-dim active:translate-y-px tablet:min-h-12 tablet:min-w-12"
    >
      <MessageCircle className="size-4" aria-hidden />
    </button>
  );
  const skillButton = (
    <button
      type="button"
      disabled={!skillReady}
      onClick={onOpenSkill}
      aria-label={t('dock.skillAria')}
      data-testid="dock-skill"
      className={cn(
        'min-h-11 touch-manipulation border border-line-strong bg-transparent px-3 text-[11.5px] tracking-[.08em] whitespace-nowrap text-dim active:translate-y-px disabled:opacity-40 tablet:min-h-12 tablet:min-w-24 tablet:text-sm',
        layout === 'row' ? 'flex-1' : onOpenChat ? 'min-w-11 flex-1 px-2' : 'min-w-[68px]',
      )}
    >
      {t('dock.skill')}
    </button>
  );
  const mainButton = (
    <button
      type="button"
      disabled={!main.enabled}
      onClick={onMain}
      data-testid={main.testId}
      data-kind={main.kind}
      className={cn(
        'min-h-11 min-w-[68px] touch-manipulation border px-3 text-[11.5px] tracking-[.08em] whitespace-nowrap active:translate-y-px tablet:min-h-12 tablet:min-w-24 tablet:text-sm',
        layout === 'row' && 'flex-[2]',
        main.enabled
          ? 'border-acc bg-acc-soft font-semibold text-acc-bright'
          : 'border-line-strong bg-transparent text-faint',
      )}
    >
      {t(main.labelKey, {
        selected: actions.discardSelected,
        required: actions.discardRequired,
      })}
    </button>
  );

  // 操作入口（复活 / 复活同伴 / 移动）单独占一行，排在技能与主操作之上；没有入口时不占位
  const entries = <DockEntries entries={controller.entries} variant="mobile" />;

  if (layout === 'column') {
    return (
      <div className="flex shrink-0 flex-col gap-1.5" data-testid="dock-ops">
        {entries}
        <div className="flex gap-1.5">
          {skillButton}
          {chatButton}
        </div>
        {mainButton}
      </div>
    );
  }
  return (
    <div className="flex shrink-0 flex-col gap-1.5" data-testid="dock-ops">
      {entries}
      <div className="flex flex-row gap-1.5">
        {skillButton}
        {chatButton}
        {mainButton}
      </div>
    </div>
  );
}
