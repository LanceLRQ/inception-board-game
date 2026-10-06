// ReportButton - 举报某位玩家的入口：点开 ReportDialog，提交成功或服务端判为重复后不再允许再点

import { Flag } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReportOutcome, ReportReason } from '../../lib/reportApi';
import { cn } from '../../lib/utils';
import { ReportDialog } from './ReportDialog';

export interface ReportButtonProps {
  /** 被举报玩家的座位号，用来区分各行的测试标识 */
  readonly seat: string;
  readonly targetNickname: string;
  /** 提交举报；由上层决定调哪个接口 */
  readonly onSubmit: (reason: ReportReason, description?: string) => Promise<ReportOutcome>;
  readonly className?: string;
}

export function ReportButton({ seat, targetNickname, onSubmit, className }: ReportButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [reported, setReported] = useState(false);

  const handleSubmit = async (reason: ReportReason, description?: string) => {
    const outcome = await onSubmit(reason, description);
    if (outcome.ok || outcome.code === 'duplicate') setReported(true);
    return outcome;
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={reported}
        aria-label={t('report.button_aria', { name: targetNickname })}
        data-testid={`report-button-${seat}`}
        data-reported={reported || undefined}
        className={cn(
          'inline-flex min-h-11 min-w-11 shrink-0 touch-manipulation items-center justify-center gap-1 border border-blood/50 px-2.5 text-xs text-blood active:translate-y-px disabled:border-line disabled:text-faint',
          className,
        )}
      >
        <Flag className="size-3.5" aria-hidden />
        {reported ? t('report.reported') : t('report.button')}
      </button>
      {open && (
        <ReportDialog
          targetNickname={targetNickname}
          onSubmit={handleSubmit}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
