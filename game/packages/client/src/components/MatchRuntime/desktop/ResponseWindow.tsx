// 解封响应窗口：舞台右上角的内联窗口，取代弹窗
// 逻辑与移动端响应条、解封响应弹窗完全一致（共用 useUnlockResponse，发出的也是同样的 move）；
// 本地来源到点自动放弃，联机由服务端代发。样式钩子类名：ms-response。

import { useTranslation } from 'react-i18next';
import { Hourglass } from 'lucide-react';
import { useUnlockResponse } from '../../UnlockResponse/useUnlockResponse';
import type { MatchController } from '../controllerTypes';

interface ResponseWindowProps {
  readonly controller: MatchController;
}

export function ResponseWindow({ controller }: ResponseWindowProps) {
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
      data-testid="unlock-response-window"
      className="ms-response relative w-full overflow-hidden px-3.5 py-3"
    >
      {fraction !== null && (
        <i
          className="absolute left-0 top-0 h-0.5 bg-acc transition-[width] duration-1000 ease-linear"
          style={{ width: `${Math.round(fraction * 100)}%` }}
          data-testid="unlock-response-progress"
        />
      )}
      <p className="font-mono text-[10px] tracking-[.26em] text-acc">
        {t('desktop.response.title')}
      </p>
      <p className="my-2 text-xs leading-relaxed text-foreground">
        {t('desktop.response.body', { name, layer: state.layer ?? '?' })}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!state.canCancel}
          onClick={() => void controller.makeMove('respondCancelUnlock', [])}
          data-testid="unlock-response-cancel"
          className="ms-btn min-h-8 px-3.5 text-[11.5px] tracking-[.14em]"
          data-variant="primary"
        >
          {t('response.play')}
        </button>
        <button
          type="button"
          onClick={() => void controller.makeMove('passResponse', [])}
          data-testid="unlock-response-pass"
          className="ms-btn min-h-8 px-3.5 text-[11.5px] tracking-[.14em]"
        >
          {t('response.pass')}
        </button>
      </div>
      <p className="mt-2 flex items-center gap-1 font-mono text-[9.5px] tracking-[.06em] text-faint">
        <Hourglass className="size-2.5 shrink-0" aria-hidden />
        {sub}
      </p>
    </div>
  );
}
