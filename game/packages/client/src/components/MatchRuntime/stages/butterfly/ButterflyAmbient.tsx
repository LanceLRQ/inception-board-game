// 「庄周梦蝶」的舞台背景：宣纸底色、四重远山（越远越淡）、纸纹
// 纯装饰，不拦截指针；纸纹可由 data-fx-off="paper" 关闭，样式在 styles/skins/butterfly.css。
// 移动布局铺在最底层，只留一重淡山与纸纹。

import { cn } from '../../../../lib/utils';

/** 远山：自远（浅）到近（深）的四条山脊，铺满舞台下半（视口 0 0 100 60，纵向拉伸铺满） */
const MOUNTAINS = [
  'M0 22 Q 8 10 17 17 T 36 15 T 58 14 T 80 16 T 100 12 L 100 60 L 0 60 Z',
  'M0 28 Q 12 15 24 24 T 46 22 T 68 23 T 100 20 L 100 60 L 0 60 Z',
  'M0 35 Q 10 22 22 31 T 44 29 T 66 32 T 100 28 L 100 60 L 0 60 Z',
  'M0 43 Q 14 30 30 39 T 58 37 T 100 40 L 100 60 L 0 60 Z',
] as const;

interface ButterflyAmbientProps {
  readonly variant?: 'desktop' | 'mobile';
}

export function ButterflyAmbient({ variant = 'desktop' }: ButterflyAmbientProps) {
  const paths = variant === 'mobile' ? MOUNTAINS.slice(0, 2) : MOUNTAINS;
  return (
    <div
      className={cn(
        'ms-ambient butterfly-ambient pointer-events-none absolute inset-0 overflow-hidden',
        variant === 'mobile' && '-z-10',
      )}
      data-variant={variant}
      aria-hidden
    >
      <svg
        className="butterfly-mountains absolute inset-x-0 bottom-0 h-3/5 w-full"
        viewBox="0 0 100 60"
        preserveAspectRatio="none"
        focusable="false"
      >
        {paths.map((d, i) => (
          <path key={d} className="butterfly-mountain" data-depth={i + 1} d={d} />
        ))}
      </svg>
      <i className="butterfly-paper absolute inset-0" />
    </div>
  );
}

/** 移动布局的背景：同一幅山水，只留两重山 */
export function ButterflyMobileAmbient() {
  return <ButterflyAmbient variant="mobile" />;
}
