// 展开态的信息条：点按读牌 = 卡名 · 类别 · 目标要求 · 现在能不能打、为什么
// 效果说明文字：共享卡牌数据里行动牌的 effects 目前为空，没有可显示的文案，这里不编写规则文字。
// 选中一张此刻可打的牌后出现「打出」按钮，点它才真正进入出牌流程（两步出牌）。

import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import type { PlayRole } from '../../../lib/cards';
import type { HandCardItem } from '../controllerTypes';
import { cardCategoryOf, cardTargetKind, type CardVerdict } from '../model/handDerive';

interface DockInfoBarProps {
  /** 正在读的牌；没有为 null */
  readonly item: HandCardItem | null;
  readonly verdict: CardVerdict | null;
  /** 本人出牌的一方（梦主与盗梦者对梦境窥视的目标要求不同） */
  readonly role?: PlayRole;
  /** 弃牌阶段：需要弃的张数与已选张数；非弃牌阶段为 null */
  readonly discard: { selected: number; required: number } | null;
  readonly onCommit: () => void;
}

export function DockInfoBar({
  item,
  verdict,
  role = 'thief',
  discard,
  onCommit,
}: DockInfoBarProps) {
  const { t } = useTranslation();
  let body: React.ReactNode;

  if (discard) {
    body = (
      <span data-testid="hand-info-text">
        {item && <b className="font-semibold text-acc-bright">{item.name} · </b>}
        {t('mobile.dock.discardInfo', discard)}
      </span>
    );
  } else if (item && verdict) {
    const target = cardTargetKind(item.card, role);
    body = (
      <span data-testid="hand-info-text">
        <b className="font-semibold text-acc-bright" data-testid="hand-info-name">
          {item.name}
        </b>
        {' · '}
        {t(`handInfo.category.${cardCategoryOf(item.card)}`)}
        {target && ` · ${t(`handInfo.target.${target}`)}`}
        {' —— '}
        <span className={cn(verdict.canPlay ? 'text-ok' : 'text-dim')}>
          {t(`handInfo.verdict.${verdict.reason}`)}
        </span>
      </span>
    );
  } else {
    body = <span data-testid="hand-info-text">{t('mobile.dock.hint')}</span>;
  }

  return (
    <div
      data-testid="hand-info"
      className="flex shrink-0 items-center gap-3 border-b border-dashed border-line px-4 pb-2 pt-0.5 font-mono text-[10px] leading-relaxed tracking-[.03em] text-dim tablet:px-6 tablet:text-xs short-land:px-3 short-land:py-1.5"
    >
      <p className="min-w-0 flex-1">{body}</p>
      {!discard && verdict?.canPlay && item && (
        <button
          type="button"
          onClick={onCommit}
          data-testid="hand-commit-play"
          className="min-h-11 shrink-0 touch-manipulation border border-acc bg-acc px-4 text-[11.5px] font-semibold tracking-[.08em] text-background active:translate-y-px tablet:min-h-12 tablet:text-sm"
        >
          {t('dock.commit')}
        </button>
      )}
    </div>
  );
}
