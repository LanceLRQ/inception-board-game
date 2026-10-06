// 「梦境矩阵」的舞台背景：数字雨（canvas）+ CRT 暗角
// 纯装饰，不拦截指针。数字雨的开关与降级：
//   data-fx-off="rain" 不画；系统「减少动效」或 data-motion="reduced" 只画静态一帧；页面不可见时暂停。
// 扫描线是另一层纯 CSS 叠层（styles/skins/matrix.css），由 data-fx-off="scan" 单独关闭。
// 移动端档位更稀更暗，铺在布局最底层（见 MobileLayout）。

import { useEffect, useRef } from 'react';
import { logger } from '../../../../lib/logger';
import { cn } from '../../../../lib/utils';
import { RAIN_PROFILES, type RainVariant } from './rain';
import { createRainController, type RainDisplayState } from './rainController';
import { createDomRainEnv } from './rainDom';

interface MatrixAmbientProps {
  readonly variant?: RainVariant;
}

export function MatrixAmbient({ variant = 'desktop' }: MatrixAmbientProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      logger.warn('ui/matrix', 'canvas 2d unavailable, digital rain disabled');
      return;
    }
    const controller = createRainController({
      canvas,
      onDisplayState: (state: RainDisplayState) => canvas.setAttribute('data-rain-state', state),
      ctx,
      env: createDomRainEnv(canvas, wrap),
      profile: RAIN_PROFILES[variant],
    });
    controller.start();
    return () => controller.dispose();
  }, [variant]);

  return (
    <div
      ref={wrapRef}
      className={cn(
        'ms-ambient matrix-ambient pointer-events-none absolute inset-0',
        variant === 'mobile' && '-z-10',
      )}
      data-variant={variant}
      aria-hidden
    >
      <canvas ref={canvasRef} className="matrix-rain absolute inset-0 size-full" />
      <i className="matrix-vignette absolute inset-0" />
    </div>
  );
}

/** 移动布局的背景：同一份雨，换稀疏暗淡的档位 */
export function MatrixMobileAmbient() {
  return <MatrixAmbient variant="mobile" />;
}
