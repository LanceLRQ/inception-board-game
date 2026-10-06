// RecoveryCodeDialog - 恢复码展示弹窗
//
// 恢复码只在签发这一刻以明文出现，之后服务端只存哈希，所以弹窗必须点「我已保存」才能关：
// 不响应遮罩点击与 Esc。恢复码只活在调用方的组件状态里，不写任何持久化位置，也不进日志。

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/** 弹窗出现的原因，决定标题与"旧码已失效"提示 */
export type RecoveryCodeDialogKind = 'created' | 'recovered' | 'rotated';

export interface RecoveryCodeDialogProps {
  readonly open: boolean;
  readonly code: string;
  /** 服务端给的提示语；为空时用本地文案 */
  readonly warning?: string;
  readonly kind: RecoveryCodeDialogKind;
  readonly onConfirm: () => void;
}

type CopyState = 'idle' | 'copied' | 'failed';

export function RecoveryCodeDialog({
  open,
  code,
  warning,
  kind,
  onConfirm,
}: RecoveryCodeDialogProps) {
  const { t } = useTranslation();
  const [copyState, setCopyState] = useState<CopyState>('idle');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyState('copied');
    } catch {
      // 非安全上下文或权限被拒：让用户手动抄写
      setCopyState('failed');
    }
  };

  const handleConfirm = () => {
    setCopyState('idle');
    onConfirm();
  };

  return (
    <Dialog open={open} blocking size="md" data-testid="recovery-code-dialog">
      <DialogHeader>
        <DialogTitle>{t(`recovery.dialog.title.${kind}`)}</DialogTitle>
        <DialogDescription>{warning || t('recovery.dialog.defaultWarning')}</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div
          className="select-all rounded-lg border border-border bg-muted px-3 py-4 text-center font-mono text-3xl font-bold tracking-widest"
          data-testid="recovery-code-value"
        >
          {code}
        </div>
        {kind !== 'created' && (
          <p className="text-xs text-destructive" data-testid="recovery-code-old-revoked">
            {t('recovery.dialog.oldRevoked')}
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleCopy}
          data-testid="recovery-code-copy"
        >
          {copyState === 'copied' ? <Check /> : <Copy />}
          {copyState === 'copied' ? t('recovery.dialog.copied') : t('recovery.dialog.copy')}
        </Button>
        {copyState === 'failed' && (
          <p className="text-xs text-destructive" role="alert">
            {t('recovery.dialog.copyFailed')}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button type="button" onClick={handleConfirm} data-testid="recovery-code-confirm">
          {t('recovery.dialog.confirm')}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
