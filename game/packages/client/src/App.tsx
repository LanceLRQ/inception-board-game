// 根 layout - 挂主题 effect 与全局 provider（路由 Outlet 渲染子页）

import { Outlet } from 'react-router-dom';
import { useThemeEffect } from './hooks/useThemeEffect';

export default function App() {
  useThemeEffect();
  return <Outlet />;
}
