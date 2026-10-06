// 胜负结果：全屏覆盖层，含胜负文案、原因与「再来一局 / 返回大厅」按钮（移动、桌面共用）

import { useTranslation } from 'react-i18next';
import { RotateCcw, Trophy } from 'lucide-react';
import type { ReportModel } from '../controllerTypes';
import { OutcomeReport } from './OutcomeReport';

interface MatchOutcomeProps {
  readonly winner: string;
  readonly winReason: string | null;
  /** 联机对局回大厅，本地对局再来一局 */
  readonly isRemote: boolean;
  readonly onRestart?: () => void;
  /** 局后举报；本地人机对局与没有真人对手时为 null */
  readonly report?: ReportModel | null;
}

export function MatchOutcome({
  winner,
  winReason,
  isRemote,
  onRestart,
  report = null,
}: MatchOutcomeProps) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-background/90 p-6 pb-safe pt-safe"
      role="dialog"
      aria-modal="true"
      aria-label={t('outcome.aria')}
    >
      <div
        className="max-h-full w-full max-w-sm overflow-y-auto border border-line-strong bg-panel p-6 text-center"
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
        {report && <OutcomeReport report={report} />}
      </div>
    </div>
  );
}
