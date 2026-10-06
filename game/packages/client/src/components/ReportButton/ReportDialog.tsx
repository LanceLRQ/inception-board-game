// ReportDialog - 局后举报弹窗：选理由 + 选填说明，提交后给出明确结果
//
// 理由与说明长度与服务端一致（lib/reportApi）。提交有四种归宿：
//   成功        显示「已收到」，只剩关闭；
//   已举报过    服务端按（对局、举报人、目标）判重，显示「已举报过」，只剩关闭；
//   其他失败    保留表单与已填内容，显示原因，可以改了再提交；
// 弹窗不可点背景或按 Esc 关闭，只能走「取消」或「关闭」，避免误触丢掉已填的内容。

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import {
  REPORT_DESCRIPTION_MAX,
  REPORT_REASONS,
  type ReportOutcome,
  type ReportReason,
} from '../../lib/reportApi';
import { Button } from '../ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';

export interface ReportDialogProps {
  readonly targetNickname: string;
  readonly onSubmit: (reason: ReportReason, description?: string) => Promise<ReportOutcome>;
  /** 弹窗关闭（取消，或结果出来后点「关闭」） */
  readonly onClose: () => void;
}

export function ReportDialog({ targetNickname, onSubmit, onClose }: ReportDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<ReportOutcome | null>(null);

  const finished = outcome !== null && (outcome.ok || outcome.code === 'duplicate');

  const handleSubmit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    try {
      setOutcome(await onSubmit(reason, description.trim() || undefined));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open blocking size="md" data-testid="report-dialog">
      <DialogHeader>
        <DialogTitle className="text-lg font-bold text-foreground">
          {t('report.dialog_title')}
        </DialogTitle>
        <DialogDescription className="text-sm">
          {t('report.target_label', { name: targetNickname })}
        </DialogDescription>
      </DialogHeader>

      {finished ? (
        <p
          className={cn('mb-4 text-sm', outcome.ok ? 'text-ok' : 'text-dim')}
          role="status"
          data-testid="report-result"
          data-result={outcome.ok ? 'ok' : outcome.code}
        >
          {outcome.ok ? t('report.done') : t('report.error.duplicate')}
        </p>
      ) : (
        <>
          <fieldset className="mb-4 space-y-2" disabled={submitting}>
            <legend className="sr-only">{t('report.reason_label')}</legend>
            {REPORT_REASONS.map((r) => (
              <label
                key={r}
                className={cn(
                  'relative flex min-h-11 cursor-pointer items-center gap-2 border px-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                  reason === r ? 'border-blood bg-blood/10' : 'border-line-strong hover:bg-muted',
                )}
              >
                {/* 单选框铺满整行：命中区就是整行（不小于 44px 高），圆点只是示意 */}
                <input
                  type="radio"
                  name="report-reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="peer absolute -inset-px h-[calc(100%+2px)] w-[calc(100%+2px)] cursor-pointer opacity-0"
                  data-testid={`report-reason-${r}`}
                />
                <span
                  aria-hidden
                  className="grid size-3.5 shrink-0 place-items-center rounded-full border border-line-strong peer-checked:border-blood peer-checked:after:size-2 peer-checked:after:rounded-full peer-checked:after:bg-blood"
                />
                <span>{t(`report.reason.${r}`)}</span>
              </label>
            ))}
          </fieldset>

          <label className="mb-3 block">
            <span className="mb-1 block text-xs text-dim">
              {t('report.description_label', { max: REPORT_DESCRIPTION_MAX })}
            </span>
            <textarea
              value={description}
              maxLength={REPORT_DESCRIPTION_MAX}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={submitting}
              data-testid="report-description"
              className="w-full border border-line-strong bg-background px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none"
            />
          </label>

          {outcome && !outcome.ok && (
            <p className="mb-3 text-sm text-blood" role="alert" data-testid="report-result">
              {t(`report.error.${outcome.code}`)}
            </p>
          )}
        </>
      )}

      <DialogFooter className="mt-0">
        {finished ? (
          <Button type="button" onClick={onClose} data-testid="report-close">
            {t('report.close')}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              data-testid="report-cancel"
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleSubmit}
              disabled={!reason || submitting}
              data-testid="report-submit"
            >
              {submitting ? t('report.submitting') : t('report.submit')}
            </Button>
          </>
        )}
      </DialogFooter>
    </Dialog>
  );
}
