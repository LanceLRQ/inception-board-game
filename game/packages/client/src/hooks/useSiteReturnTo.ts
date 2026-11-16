import { useLocation } from 'react-router';

/** 辅助页面只回首页或大厅；历史记录在刷新后仍保留入口。 */
export function useSiteReturnTo(): '/' | '/lobby' {
  const { pathname, state } = useLocation();
  if (pathname === '/') return '/';
  if (pathname === '/lobby') return '/lobby';
  return state?.returnTo === '/' ? '/' : '/lobby';
}
