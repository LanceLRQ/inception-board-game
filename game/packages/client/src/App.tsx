// 根 layout - 挂主题 effect + Framer Motion 全局 reduced-motion 配置 + 跳转主内容链接

import { Outlet } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useThemeEffect } from './hooks/useThemeEffect';

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
    </MotionConfig>
  );
}
