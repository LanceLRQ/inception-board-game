// ReportButton - 举报按钮（配合 ReportDialog 弹窗）
// 对照：plans/design/06-frontend-design.md 举报入口 / plans/design/08-security-ai.md §8.4b

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ReportDialog, type ReportReason } from './ReportDialog';
import { cn } from '../../lib/utils';

export interface ReportButtonProps {
  /** 被举报的玩家 ID */
  readonly targetPlayerId: string;
  /** 被举报玩家昵称（展示用） */
  readonly targetNickname?: string;
  /** 对局 ID */
  readonly matchID: string;
  /** 提交回调：由上层处理 API 调用 */
  readonly onSubmit: (input: {
    matchID: string;
    targetPlayerId: string;
    reason: ReportReason;
    description?: string;
  }) => Promise<void> | void;
  readonly className?: string;
  readonly disabled?: boolean;
}

export function ReportButton({
  targetPlayerId,
  targetNickname,
  matchID,
  onSubmit,
  className,
  disabled,
}: ReportButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const handleSubmit = useCallback(
    async (reason: ReportReason, description?: string) => {
      const payload: {
        matchID: string;
        targetPlayerId: string;
        reason: ReportReason;
        description?: string;
      } = { matchID, targetPlayerId, reason };
      if (description) payload.description = description;
      await onSubmit(payload);
      setOpen(false);
    },
    [matchID, targetPlayerId, onSubmit],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-red-500/40 px-2 py-0.5 text-xs text-red-500 transition-colors hover:bg-red-500/10 active:scale-95',
          disabled && 'opacity-50 cursor-not-allowed',
          className,
        )}
        aria-label={t('report.button_aria', { defaultValue: '举报玩家' })}
      >
        ⚠️ {t('report.button', { defaultValue: '举报' })}
      </button>

      {open ? (
        <ReportDialog
          targetNickname={targetNickname ?? targetPlayerId}
          onSubmit={handleSubmit}
          onCancel={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
