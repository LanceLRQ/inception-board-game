// CopyrightNotice - 版权声明组件（多 variant 适配四重展示点）
// 对照：NOTICE 根文件（版权展示）
//
// Variants：
//   - 'footer'：一行紧凑（Landing 底部、Game 结算页小字）
//   - 'line'：更小的单行弱化文字（占满视口的移动对局布局，放在手牌坞最底部）
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
import { Button } from '../ui/button';
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';

export interface CopyrightNoticeProps {
  readonly variant: 'footer' | 'full' | 'line';
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

  if (variant === 'line') {
    return (
      <p
        className={cn(
          'truncate text-center text-[9px] leading-none tracking-[.03em] text-faint',
          className,
        )}
        role="contentinfo"
        data-testid="copyright-line"
      >
        {shortLine}
      </p>
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
            title: COPYRIGHT.originalGameTitle,
            publisher: COPYRIGHT.originalPublisher,
            website: COPYRIGHT.originalPublisherWebsite,
            defaultValue: `原版 ${COPYRIGHT.originalGameTitle} 版权归 ${COPYRIGHT.originalPublisher}（${COPYRIGHT.originalPublisherWebsite}）所有。`,
          })}
        </p>
        <p>{COPYRIGHT.usageNote}</p>
        <p className="text-xs">{COPYRIGHT.takedownHint}</p>
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

  const handleConfirm = () => {
    setConfirmed(true);
    acknowledgeCopyright();
    onAcknowledge();
  };

  // 首次进入必须点按钮确认：不可点背景或按 Esc 关闭
  return (
    <Dialog open={open} blocking size="lg" className="p-6">
      <DialogHeader>
        <DialogTitle className="text-lg font-bold text-foreground">
          {t('copyright.modal_title', { defaultValue: '版权与使用声明' })}
        </DialogTitle>
      </DialogHeader>
      <DialogBody>
        <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
          {getTutorialCopyrightText()}
        </pre>
      </DialogBody>
      <DialogFooter>
        <Button type="button" disabled={confirmed} onClick={handleConfirm} className="rounded-full">
          {t('copyright.ack', { defaultValue: '我已阅读并同意' })}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
