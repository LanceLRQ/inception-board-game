// 卡图：加载失败或占位模式（VITE_ASSETS_MODE=placeholder）时降级为文字占位，不留破图

import { useState } from 'react';
import { isPlaceholderMode } from '../../lib/assetsMode';
import { cn } from '../../lib/utils';

interface CardArtProps {
  readonly src: string | undefined;
  /** 图片的替代文字；装饰性卡图传空串 */
  readonly alt?: string;
  readonly className?: string;
  /** 没有图时的占位文字（缺省为空） */
  readonly fallback?: string;
}

export function CardArt({ src, alt = '', className, fallback = '' }: CardArtProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src || isPlaceholderMode()) {
    return (
      <span
        className={cn(
          'flex items-center justify-center text-center text-[9px] text-faint',
          className,
        )}
        aria-hidden
      >
        {fallback}
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
