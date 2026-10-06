// ReportDialog - 举报弹窗：选理由 + 选填描述
// 举报入口

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';

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

  // 举报弹窗不可点背景或按 Esc 关闭：只能走「取消」或「提交举报」
  return (
    <Dialog open blocking size="md">
      <DialogHeader>
        <DialogTitle className="text-lg font-bold text-foreground">
          {t('report.dialog_title', { defaultValue: '举报玩家' })}
        </DialogTitle>
        <DialogDescription className="text-sm">
          {t('report.target_label', {
            defaultValue: '举报目标：{{name}}',
            name: targetNickname,
          })}
        </DialogDescription>
      </DialogHeader>

      <div className="mb-4 space-y-2">
        {REASONS.map((r) => (
          <label
            key={r.id}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors',
              reason === r.id
                ? 'border-blood bg-blood/10'
                : 'hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <input
              type="radio"
              name="report-reason"
              value={r.id}
              checked={reason === r.id}
              onChange={() => setReason(r.id)}
              className="accent-blood"
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

      <DialogFooter className="mt-0">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-full"
        >
          {t('common.cancel', { defaultValue: '取消' })}
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={handleSubmit}
          disabled={!reason || submitting}
          className="rounded-full"
        >
          {submitting
            ? t('report.submitting', { defaultValue: '提交中...' })
            : t('report.submit', { defaultValue: '提交举报' })}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
