// 房间码分享：显示房间码、复制房间码与邀请链接、调起系统分享、展示二维码

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Link2, QrCode, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { copyText } from '../../lib/clipboard';
import { buildInviteUrl } from '../../lib/inviteLink';
import { logger } from '../../lib/logger';
import { encodeQr } from '../../lib/qrEncoder';
import { QrImage } from './QrImage';

interface RoomCodeShareProps {
  code: string;
}

type Feedback = 'code' | 'link' | 'selected' | 'failed' | null;

/** 提示文字停留多久（毫秒） */
const FEEDBACK_MS = 2_500;

export function RoomCodeShare({ code }: RoomCodeShareProps) {
  const { t } = useTranslation();
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [qrOpen, setQrOpen] = useState(false);

  const link = useMemo(() => buildInviteUrl(code), [code]);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  // 链接太长（自定义了很长的站点地址）时放不进二维码，隐藏入口
  const qrAvailable = useMemo(() => {
    try {
      encodeQr(link);
      return true;
    } catch {
      return false;
    }
  }, [link]);

  useEffect(() => {
    if (feedback === null) return;
    const timer = setTimeout(() => setFeedback(null), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [feedback]);

  const copyCode = useCallback(async () => {
    const outcome = await copyText(code);
    setFeedback(outcome === 'clipboard' ? 'code' : 'failed');
    logger.flow('room', 'copy code', { code, outcome });
  }, [code]);

  const copyLink = useCallback(async () => {
    const outcome = await copyText(link, linkInputRef.current);
    setFeedback(outcome === 'clipboard' ? 'link' : outcome);
    logger.flow('room', 'copy link', { code, outcome });
  }, [link, code]);

  const shareNative = useCallback(async () => {
    try {
      await navigator.share({
        title: t('room.shareTitle'),
        text: t('room.shareText', { code }),
        url: link,
      });
      logger.flow('room', 'native share', { code });
    } catch (err) {
      // 用户在系统分享面板里取消不算失败；其他原因退回复制链接
      if (err instanceof DOMException && err.name === 'AbortError') return;
      logger.warn('room', 'native share failed', err);
      await copyLink();
    }
  }, [t, code, link, copyLink]);

  const feedbackText =
    feedback === 'code'
      ? t('room.copied')
      : feedback === 'link'
        ? t('room.linkCopied')
        : feedback === 'selected'
          ? t('room.copySelected')
          : feedback === 'failed'
            ? t('room.copyFailed')
            : '';

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-3"
      data-testid="room-share"
      aria-label={t('room.share')}
    >
      <h2 className="text-sm font-semibold text-dim">{t('room.share')}</h2>

      <button
        type="button"
        onClick={copyCode}
        aria-label={t('room.copy')}
        className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-line-strong bg-background px-4 py-3 font-mono text-2xl uppercase tracking-widest hover:bg-foreground/10"
        data-testid="room-copy"
      >
        {code}
        {feedback === 'code' ? <Check size={18} className="text-ok" /> : <Copy size={18} />}
      </button>

      <input
        ref={linkInputRef}
        type="text"
        readOnly
        value={link}
        aria-label={t('room.linkLabel')}
        onFocus={(e) => e.currentTarget.select()}
        className="min-h-11 w-full min-w-0 rounded-md border border-line bg-background px-3 py-2 font-mono text-xs text-dim"
        data-testid="room-share-link"
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={copyLink}
          className="h-9 flex-1 gap-1.5 border-line-strong px-3"
          data-testid="room-copy-link"
        >
          <Link2 size={14} />
          {t('room.copyLink')}
        </Button>
        {canShare && (
          <Button
            type="button"
            variant="outline"
            onClick={shareNative}
            className="h-9 flex-1 gap-1.5 border-line-strong px-3"
            data-testid="room-native-share"
          >
            <Share2 size={14} />
            {t('room.shareNative')}
          </Button>
        )}
        {qrAvailable && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setQrOpen((v) => !v)}
            aria-expanded={qrOpen}
            className="h-9 flex-1 gap-1.5 border-line-strong px-3"
            data-testid="room-qr-toggle"
          >
            <QrCode size={14} />
            {qrOpen ? t('room.hideQr') : t('room.showQr')}
          </Button>
        )}
      </div>

      {qrOpen && qrAvailable && (
        <div className="qr-frame mx-auto w-48 max-w-full rounded-md" data-testid="room-qr">
          <QrImage value={link} label={t('room.qrLabel', { code })} className="block size-full" />
        </div>
      )}

      <p
        className="min-h-4 text-center text-xs text-dim"
        role="status"
        aria-live="polite"
        data-testid="room-share-feedback"
      >
        {feedbackText}
      </p>
    </section>
  );
}
