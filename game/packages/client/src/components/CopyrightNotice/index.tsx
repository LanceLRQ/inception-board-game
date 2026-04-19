// CopyrightNotice - 版权声明组件（多 variant 适配四重展示点）
// 对照：NOTICE 根文件 / plans/design/06-frontend-design.md 版权展示
//
// Variants：
//   - 'footer'：一行紧凑（Landing 底部、Game 结算页小字）
//   - 'full'：完整多段（About 关于页）
//   - 'modal'：教学前弹窗（含"我已阅读"按钮）

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  COPYRIGHT,
  acknowledgeCopyright,
  getShortCopyrightLine,
  getTutorialCopyrightText,
} from '../../lib/copyright';
import { cn } from '../../lib/utils';

export interface CopyrightNoticeProps {
  readonly variant: 'footer' | 'full';
  readonly className?: string;
}

export function CopyrightNotice({ variant, className }: CopyrightNoticeProps) {
  const { t } = useTranslation();
  const shortLine = t('copyright.short', { defaultValue: getShortCopyrightLine() });

  if (variant === 'footer') {
    return (
      <div
        className={cn('text-center text-xs leading-relaxed text-muted-foreground', className)}
        role="contentinfo"
      >
        <p>{shortLine}</p>
      </div>
    );
  }

  // variant === 'full'
  return (
    <section
      className={cn('rounded-xl bg-card p-4 text-sm shadow-sm ring-1 ring-border', className)}
      aria-label={t('copyright.aria_label', { defaultValue: '版权声明' })}
    >
      <h2 className="mb-2 text-base font-semibold">
        {t('copyright.heading', { defaultValue: '版权声明' })}
      </h2>

      <div className="space-y-2 text-muted-foreground">
        <p>
          <strong>{COPYRIGHT.projectName}</strong>
          <br />
          {COPYRIGHT.projectCopyright} · {COPYRIGHT.projectLicense}
        </p>
        <p>
          {t('copyright.original_publisher', {
            defaultValue: `原版 ${COPYRIGHT.originalGameTitle} 版权归 ${COPYRIGHT.originalPublisher}（${COPYRIGHT.originalPublisherWebsite}）所有。`,
          })}
        </p>
        <p>{COPYRIGHT.usageNote}</p>
        <p className="text-xs opacity-75">{COPYRIGHT.takedownHint}</p>
      </div>
    </section>
  );
}

// === Modal 版本（教学前）===

export interface CopyrightModalProps {
  readonly open: boolean;
  readonly onAcknowledge: () => void;
}

export function CopyrightModal({ open, onAcknowledge }: CopyrightModalProps) {
  const { t } = useTranslation();
  const [confirmed, setConfirmed] = useState(false);

  if (!open) return null;

  const handleConfirm = () => {
    setConfirmed(true);
    acknowledgeCopyright();
    onAcknowledge();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('copyright.modal_title', { defaultValue: '版权与使用声明' })}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="max-w-lg rounded-2xl bg-card p-6 shadow-2xl">
        <h2 className="mb-3 text-lg font-bold text-foreground">
          {t('copyright.modal_title', { defaultValue: '版权与使用声明' })}
        </h2>
        <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
          {getTutorialCopyrightText()}
        </pre>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={confirmed}
            onClick={handleConfirm}
            className={cn(
              'rounded-full px-4 py-2 text-sm transition-colors',
              confirmed
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95',
            )}
          >
            {t('copyright.ack', { defaultValue: '我已阅读并同意' })}
          </button>
        </div>
      </div>
    </div>
  );
}
