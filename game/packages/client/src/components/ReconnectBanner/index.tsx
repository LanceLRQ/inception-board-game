// ReconnectBanner - 顶部重连状态横幅
// 对照：plans/design/06-frontend-design.md 错误态与断线 UI
//
// 状态：
//   - reconnecting: 黄色横幅 "正在重连..."
//   - stale:        橙色横幅 "网络不稳定，已断开 Ns"
//   - dead:         红色横幅 "连接已断开 · 返回大厅" 按钮

import { useTranslation } from 'react-i18next';
import type { ReconnectState } from '../../hooks/useReconnect';

export interface ReconnectBannerProps {
  readonly state: ReconnectState;
  readonly onExit?: () => void;
}

export function ReconnectBanner({ state, onExit }: ReconnectBannerProps) {
  const { t } = useTranslation();

  if (state.status === 'healthy') return null;

  // lastTick 由 useReconnect 内部每秒更新（非 healthy 状态），避免 render 中调 Date.now()
  const elapsedSec =
    state.disconnectedAt && state.lastTick > state.disconnectedAt
      ? Math.floor((state.lastTick - state.disconnectedAt) / 1000)
      : 0;

  const classes: Record<Exclude<ReconnectState['status'], 'healthy'>, string> = {
    reconnecting: 'bg-yellow-400/90 text-yellow-950',
    stale: 'bg-orange-500/95 text-white',
    dead: 'bg-red-600 text-white',
  };

  const labelKey: Record<Exclude<ReconnectState['status'], 'healthy'>, string> = {
    reconnecting: 'network.reconnecting',
    stale: 'network.stale',
    dead: 'network.dead',
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-0 inset-x-0 z-50 px-4 py-2 text-sm font-medium flex items-center justify-between ${classes[state.status]}`}
    >
      <span>
        {t(labelKey[state.status], { defaultValue: defaultLabel(state.status) })}
        {state.status !== 'dead' && elapsedSec > 0 ? ` (${elapsedSec}s)` : ''}
      </span>
      {state.status === 'dead' && onExit ? (
        <button
          type="button"
          onClick={onExit}
          className="ml-2 rounded bg-white/20 px-3 py-1 text-white hover:bg-white/30"
        >
          {t('network.back_to_lobby', { defaultValue: '返回大厅' })}
        </button>
      ) : null}
    </div>
  );
}

function defaultLabel(status: Exclude<ReconnectState['status'], 'healthy'>): string {
  switch (status) {
    case 'reconnecting':
      return '正在重连...';
    case 'stale':
      return '网络不稳定';
    case 'dead':
      return '连接已断开';
  }
}
