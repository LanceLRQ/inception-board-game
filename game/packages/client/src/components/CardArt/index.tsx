// 卡图：加载失败或占位模式（VITE_ASSETS_MODE=placeholder）时降级为「卡名文字 + 类别色块」，不留破图

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isPlaceholderMode } from '../../lib/assetsMode';
import { cn } from '../../lib/utils';
import { artFallbackFor, CATEGORY_TONE } from './fallback';

interface CardArtProps {
  readonly src: string | undefined;
  /** 图片的替代文字；装饰性卡图传空串 */
  readonly alt?: string;
  readonly className?: string;
  /** 没有图时的占位文字；不给就按图片地址查卡名，查不到显示类别名 */
  readonly fallback?: string;
}

export function CardArt({ src, alt = '', className, fallback }: CardArtProps) {
  const { t } = useTranslation();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src || isPlaceholderMode()) {
    const fb = artFallbackFor(src, fallback);
    const text = fb.name ?? (fb.category ? t(`cardArt.category.${fb.category}`) : '');
    return (
      <span
        className={cn(
          'flex items-center justify-center overflow-hidden p-0.5 text-center text-[9px] leading-tight break-words',
          fb.category ? CATEGORY_TONE[fb.category] : 'text-faint',
          className,
        )}
        data-testid="card-art-fallback"
        data-category={fb.category ?? undefined}
        aria-hidden
      >
        {text}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      className={cn('block object-cover', className)}
      onError={() => setFailedSrc(src)}
    />
  );
}
