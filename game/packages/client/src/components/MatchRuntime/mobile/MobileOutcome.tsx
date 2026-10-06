// 胜负结果：全屏覆盖层，含胜负文案、原因与「再来一局 / 返回大厅」按钮

import { useTranslation } from 'react-i18next';
import { RotateCcw, Trophy } from 'lucide-react';

interface MobileOutcomeProps {
  readonly winner: string;
  readonly winReason: string | null;
  /** 联机对局回大厅，本地对局再来一局 */
  readonly isRemote: boolean;
  readonly onRestart?: () => void;
}

export function MobileOutcome({ winner, winReason, isRemote, onRestart }: MobileOutcomeProps) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-background/90 p-6 pb-safe pt-safe"
      role="dialog"
      aria-modal="true"
      aria-label={t('mobile.outcome.aria')}
    >
      <div
        className="w-full max-w-sm border border-line-strong bg-panel p-6 text-center"
        data-testid="winner-banner"
      >
        <Trophy className="mx-auto mb-2 size-8 text-acc-bright" aria-hidden />
        <h2 className="font-heading text-xl font-bold tracking-[.08em]">
          {winner === 'thief' ? t('localMatch.thiefWins') : t('localMatch.masterWins')}
        </h2>
        {winReason && (
          <p className="mt-1 text-xs text-dim" data-testid="win-reason">
            {t(`localMatch.winReason.${winReason}`, { defaultValue: winReason })}
          </p>
        )}
        <button
          type="button"
          onClick={onRestart}
          data-testid="restart-button"
          className="mt-5 inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 border border-acc bg-acc px-6 text-sm font-semibold text-background"
        >
          <RotateCcw className="size-4" aria-hidden />
          {isRemote
            ? t('match.back_to_lobby', { defaultValue: '返回大厅' })
            : t('localMatch.restart')}
        </button>
      </div>
    </div>
  );
}
