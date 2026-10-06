// 设置页「账号」区块：昵称、恢复码状态、重新生成恢复码
//
// 直接读身份 store 而不是 useAuth：useAuth 挂载时会再验一次令牌，设置页只需要展示。

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RecoveryCodeDialog } from '../../components/RecoveryCodeDialog';
import { identityApi, isOfflineIdentity, type RecoveryStatus } from '../../lib/identityApi';
import { rotateErrorKey } from '../../lib/recoveryCode';
import { logger } from '../../lib/logger';
import { useIdentityStore } from '../../stores/useIdentityStore';

export function AccountSection() {
  const { t } = useTranslation();
  const playerId = useIdentityStore((s) => s.playerId);
  const token = useIdentityStore((s) => s.token);
  const nickname = useIdentityStore((s) => s.nickname);

  const signedIn = !!playerId && !!token;
  const offline = signedIn && isOfflineIdentity(token);

  const [status, setStatus] = useState<RecoveryStatus | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 新恢复码只放在组件状态里，确认后丢弃
  const [newCode, setNewCode] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn || offline) return;
    let cancelled = false;
    identityApi
      .recoveryStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((err) => {
        logger.warn('identity', 'recovery status load failed', err);
        if (!cancelled) setStatusFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, offline]);

  const handleRotate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await identityApi.rotateRecoveryCode();
      setConfirmOpen(false);
      setNewCode(res.code);
      setStatus({ hasCode: true, createdAt: new Date().toISOString() });
      setStatusFailed(false);
    } catch (e) {
      setConfirmOpen(false);
      setError(t(rotateErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  let statusText: string;
  if (status) {
    statusText = status.hasCode
      ? status.createdAt
        ? `${t('recovery.account.hasCode')} · ${t('recovery.account.createdAt', {
            time: new Date(status.createdAt).toLocaleString(),
          })}`
        : t('recovery.account.hasCode')
      : t('recovery.account.noCode');
  } else {
    statusText = statusFailed ? t('recovery.account.statusUnknown') : '…';
  }

  return (
    <section
      className="mb-6 rounded-xl bg-card p-4 shadow-sm ring-1 ring-border"
      data-testid="settings-account"
    >
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
        {t('recovery.account.heading')}
      </h2>

      {!signedIn ? (
        <div className="flex flex-col gap-3 text-sm">
          <p>{t('recovery.account.notSignedIn')}</p>
          <Link
            to="/lobby"
            className="inline-flex min-h-11 min-w-11 items-center self-start text-primary underline-offset-4 hover:underline"
          >
            {t('recovery.account.toLobby')}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span>{t('recovery.account.nickname')}</span>
            <span className="font-medium" data-testid="settings-nickname">
              {nickname}
            </span>
          </div>
          {offline ? (
            <p className="text-xs text-muted-foreground" data-testid="settings-offline-note">
              {t('recovery.account.offlineNote')}
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <span>{t('recovery.account.status')}</span>
                <span className="text-right text-muted-foreground" data-testid="settings-status">
                  {statusText}
                </span>
              </div>
              {error && (
                <p className="text-xs text-destructive" role="alert">
                  {error}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                className="self-start"
                onClick={() => setConfirmOpen(true)}
                disabled={busy}
                data-testid="settings-rotate"
              >
                <KeyRound />
                {t('recovery.account.rotate')}
              </Button>
            </>
          )}
        </div>
      )}

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => !busy && setConfirmOpen(open)}
        blocking={false}
        size="sm"
        data-testid="settings-rotate-confirm"
      >
        <DialogHeader>
          <DialogTitle>{t('recovery.account.confirmTitle')}</DialogTitle>
          <DialogDescription>{t('recovery.account.confirmBody')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setConfirmOpen(false)}
            disabled={busy}
          >
            {t('recovery.account.confirmNo')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleRotate}
            disabled={busy}
            data-testid="settings-rotate-confirm-yes"
          >
            {t('recovery.account.confirmYes')}
          </Button>
        </DialogFooter>
      </Dialog>

      {newCode && (
        <RecoveryCodeDialog open code={newCode} kind="rotated" onConfirm={() => setNewCode(null)} />
      )}
    </section>
  );
}
