// ReportDialog - 举报弹窗：选理由 + 选填描述
// 对照：plans/design/06-frontend-design.md 举报入口

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

export type ReportReason = 'cheating' | 'afk' | 'abusive' | 'other';

const REASONS: ReadonlyArray<{
  readonly id: ReportReason;
  readonly labelKey: string;
  readonly defaultLabel: string;
}> = [
  { id: 'cheating', labelKey: 'report.reason.cheating', defaultLabel: '作弊行为' },
  { id: 'afk', labelKey: 'report.reason.afk', defaultLabel: '挂机/弃局' },
  { id: 'abusive', labelKey: 'report.reason.abusive', defaultLabel: '言语不当' },
  { id: 'other', labelKey: 'report.reason.other', defaultLabel: '其他原因' },
];

export interface ReportDialogProps {
  readonly targetNickname: string;
  readonly onSubmit: (reason: ReportReason, description?: string) => Promise<void> | void;
  readonly onCancel: () => void;
}

export function ReportDialog({ targetNickname, onSubmit, onCancel }: ReportDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(reason, description.trim() || undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('report.dialog_title', { defaultValue: '举报玩家' })}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl">
        <h2 className="mb-2 text-lg font-bold text-foreground">
          {t('report.dialog_title', { defaultValue: '举报玩家' })}
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {t('report.target_label', {
            defaultValue: '举报目标：{{name}}',
            name: targetNickname,
          })}
        </p>

        <div className="mb-4 space-y-2">
          {REASONS.map((r) => (
            <label
              key={r.id}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors',
                reason === r.id
                  ? 'border-red-500 bg-red-500/10'
                  : 'hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <input
                type="radio"
                name="report-reason"
                value={r.id}
                checked={reason === r.id}
                onChange={() => setReason(r.id)}
                className="accent-red-500"
              />
              <span>{t(r.labelKey, { defaultValue: r.defaultLabel })}</span>
            </label>
          ))}
        </div>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs text-muted-foreground">
            {t('report.description_label', { defaultValue: '详细描述（可选，最多 500 字）' })}
          </span>
          <textarea
            value={description}
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:border-ring focus:outline-none"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-full border border-border px-4 py-2 text-sm hover:bg-muted"
          >
            {t('common.cancel', { defaultValue: '取消' })}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!reason || submitting}
            className={cn(
              'rounded-full px-4 py-2 text-sm transition-colors',
              reason && !submitting
                ? 'bg-red-500 text-white hover:bg-red-500/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
          >
            {submitting
              ? t('report.submitting', { defaultValue: '提交中...' })
              : t('report.submit', { defaultValue: '提交举报' })}
          </button>
        </div>
      </div>
    </div>
  );
}
