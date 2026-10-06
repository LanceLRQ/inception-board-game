// 解封响应条：坞上方拇指够得着的位置
// 逻辑与桌面的解封响应弹窗完全一致（共用 useUnlockResponse，发出的也是同样的 move）；
// 本地来源到点自动放弃，联机由服务端代发。

import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import { useUnlockResponse } from '../../UnlockResponse/useUnlockResponse';
import type { MatchController } from '../controllerTypes';

interface MobileResponseBarProps {
  readonly controller: MatchController;
}

export function MobileResponseBar({ controller }: MobileResponseBarProps) {
  const { t } = useTranslation();
  const { state, remainingSec, fraction } = useUnlockResponse({
    G: controller.view,
    viewerPlayerID: controller.viewerSeat,
    makeMove: controller.makeMove,
    autoPass: controller.kind === 'local',
    deadlineAt: controller.turn.deadlineAt,
  });
  if (!state.visible) return null;

  const name = state.unlockerID ? controller.nicknameOf(state.unlockerID) : '—';
  const sub = !state.canCancel
    ? t('response.noCard')
    : remainingSec === null
      ? t('response.noTimer')
      : t('response.countdown', { seconds: remainingSec });

  return (
    <div
      role="group"
      aria-label={t('response.aria')}
      data-testid="unlock-response-bar"
      className="relative shrink-0 border-t border-line bg-acc-soft px-3"
    >
      {fraction !== null && (
        <i
          className="absolute -top-px left-0 h-0.5 bg-acc shadow-[0_0_8px_var(--ms-acc)] transition-[width] duration-1000 ease-linear"
          style={{ width: `${Math.round(fraction * 100)}%` }}
          data-testid="unlock-response-progress"
        />
      )}
      <div className="flex items-center gap-2 py-2">
        <div className="min-w-0 flex-1 text-[11px] leading-snug">
          <b className="text-acc-bright">
            {t('response.title', { name, layer: state.layer ?? '?' })}
          </b>
          <br />
          <span className="font-mono text-[8.5px] tracking-[.04em] text-dim">{sub}</span>
        </div>
        <button
          type="button"
          disabled={!state.canCancel}
          onClick={() => void controller.makeMove('respondCancelUnlock', [])}
          data-testid="unlock-response-cancel"
          className={cn(
            'min-h-[42px] shrink-0 touch-manipulation border px-3 text-[11.5px] font-semibold tracking-[.05em] whitespace-nowrap active:translate-y-px',
            'border-acc bg-acc text-background disabled:border-line-strong disabled:bg-panel disabled:font-normal disabled:text-faint',
          )}
        >
          {t('response.play')}
        </button>
        <button
          type="button"
          onClick={() => void controller.makeMove('passResponse', [])}
          data-testid="unlock-response-pass"
          className="min-h-[42px] shrink-0 touch-manipulation border border-line-strong bg-panel px-3 text-[11.5px] tracking-[.05em] whitespace-nowrap text-dim active:translate-y-px"
        >
          {t('response.pass')}
        </button>
      </div>
    </div>
  );
}
