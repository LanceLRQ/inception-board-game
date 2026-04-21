// 根 layout - 挂主题 effect + Framer Motion 全局 reduced-motion 配置 + 跳转主内容链接
// + 全局 Toaster（toast 事件通知；对照 plans/2-1-3-1-2-ui-cozy-wave.md）

import { Outlet } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useThemeEffect } from './hooks/useThemeEffect';
import { Toaster } from './components/ui/toaster';

export default function App() {
  useThemeEffect();
  const { t } = useTranslation();

  return (
    <MotionConfig reducedMotion="user">
      {/* 键盘 Tab 首焦：跳到 #main-content（对照 WCAG 2.4.1 Bypass Blocks） */}
      <a href="#main-content" className="skip-to-main">
        {t('a11y.skip_to_main', { defaultValue: '跳到主内容' })}
      </a>
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      {/* 全局 toast 渲染容器（右下角堆叠，自动消失） */}
      <Toaster />
    </MotionConfig>
  );
}
