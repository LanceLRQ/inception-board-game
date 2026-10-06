// 数字雨的 DOM 绑定：把时钟、帧回调、可见性、减少动效偏好、根元素属性与容器尺寸接给控制器
// 逻辑都在 rainController.ts（有单测）；这里只做浏览器 API 的转接。

import type { RainChange, RainEnv, RainStyle } from './rainController';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** 读一个主题令牌；取不到时回落到 currentColor（画布里指画布自身的文字色） */
function token(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = styles.getPropertyValue(name).trim();
  return value || fallback;
}

/** 容器所在布局的放大系数（--ms-scale）；没有或非法按 1 */
function layoutScale(container: HTMLElement): number {
  const raw = Number.parseFloat(getComputedStyle(container).getPropertyValue('--ms-scale'));
  return raw >= 1 ? raw : 1;
}

export function createDomRainEnv(canvas: HTMLCanvasElement, container: HTMLElement): RainEnv {
  const root = document.documentElement;
  const motion =
    typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION_QUERY) : null;

  return {
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (id) => window.cancelAnimationFrame(id),
    // 桌面布局在大屏上整体放大（--ms-scale）：画布要按放大后的物理像素绘制才不发虚
    devicePixelRatio: () => (window.devicePixelRatio || 1) * layoutScale(container),
    isHidden: () => document.visibilityState === 'hidden',
    prefersReducedMotion: () => motion?.matches ?? false,
    rootAttribute: (name) => root.getAttribute(name),
    size: () => {
      // 布局尺寸（不含 transform 放大），与画布的 CSS 尺寸一致
      return { width: container.offsetWidth, height: container.offsetHeight };
    },
    style: (): RainStyle => {
      const styles = getComputedStyle(canvas);
      return {
        body: token(styles, '--ms-acc', 'currentColor'),
        head: token(styles, '--ms-accb', 'currentColor'),
        fade: token(styles, '--ms-bg', 'currentColor'),
        fontFamily: token(styles, '--ms-mono', 'monospace'),
      };
    },
    listen: (onChange: (change: RainChange) => void) => {
      const onVisibility = () => onChange('visibility');
      const onMotion = () => onChange('motion');
      document.addEventListener('visibilitychange', onVisibility);
      motion?.addEventListener('change', onMotion);
      const attrs = new MutationObserver(() => onChange('attributes'));
      attrs.observe(root, { attributes: true, attributeFilter: ['data-fx-off', 'data-motion'] });
      const resize =
        typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => onChange('resize'));
      resize?.observe(container);
      return () => {
        document.removeEventListener('visibilitychange', onVisibility);
        motion?.removeEventListener('change', onMotion);
        attrs.disconnect();
        resize?.disconnect();
      };
    },
  };
}
