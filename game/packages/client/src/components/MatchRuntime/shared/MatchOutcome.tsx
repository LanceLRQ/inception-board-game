// 终局保留牌桌，按需打开结算、返回入口与举报。

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Film, RotateCcw, Trophy } from 'lucide-react';
import { Link, useParams } from 'react-router';
import type { ReportModel } from '../controllerTypes';
import { Dialog, DialogTitle } from '../../ui/dialog';
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
  const { matchId } = useParams();
  const [open, setOpen] = useState(false);
  const title = winner === 'thief' ? t('localMatch.thiefWins') : t('localMatch.masterWins');
  return (
    <>
      <div className="tabletop-outcome" data-testid="winner-banner" role="status">
        <div>
          <strong>{title}</strong>
          <p>终局牌桌保留，可继续翻看金库。</p>
        </div>
        <button type="button" onClick={() => setOpen(true)}>
          查看结算
        </button>
      </div>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        blocking={false}
        aria-label={t('outcome.aria')}
        className="tabletop-outcome-dialog"
      >
        <Trophy className="size-8 text-acc" aria-hidden />
        <DialogTitle>{title}</DialogTitle>
        {winReason && (
          <p className="mt-3 text-sm text-dim" data-testid="win-reason">
            {t(`localMatch.winReason.${winReason}`, { defaultValue: winReason })}
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRestart}
            data-testid="restart-button"
            className="tabletop-primary inline-flex items-center gap-2"
          >
            <RotateCcw size={16} aria-hidden />
            {isRemote
              ? t('match.back_to_lobby', { defaultValue: '返回大厅' })
              : t('localMatch.restart')}
          </button>
          {isRemote && matchId && (
            <Link
              to={`/replay/${encodeURIComponent(matchId)}`}
              className="tabletop-secondary inline-flex items-center gap-2"
            >
              <Film size={16} aria-hidden />
              {t('replay.open')}
            </Link>
          )}
        </div>
        {report && <OutcomeReport report={report} />}
      </Dialog>
    </>
  );
}
