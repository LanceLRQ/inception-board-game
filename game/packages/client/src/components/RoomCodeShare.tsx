import { useTranslation } from 'react-i18next';

interface RoomCodeShareProps {
  code: string;
}

export function RoomCodeShare({ code }: RoomCodeShareProps) {
  const { t } = useTranslation();
  const shareUrl = `${window.location.origin}/room/${code}`;

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
  }

  async function shareNative() {
    if (navigator.share) {
      await navigator.share({ title: '盗梦都市 - 加入房间', url: shareUrl });
    } else {
      await copyLink();
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-bg-card p-4">
      <span className="text-sm text-text-secondary">{t('room.share')}</span>
      <span className="font-mono text-3xl font-bold tracking-[0.3em] text-white">{code}</span>
      <div className="flex gap-2">
        <button
          onClick={copyLink}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover"
        >
          复制链接
        </button>
        <button
          onClick={shareNative}
          className="rounded-lg border border-white/20 px-4 py-2 text-sm font-bold text-white hover:bg-white/10"
        >
          分享
        </button>
      </div>
    </div>
  );
}
