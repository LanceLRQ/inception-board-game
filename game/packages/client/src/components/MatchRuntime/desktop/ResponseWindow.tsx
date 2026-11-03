import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../ui/dialog';
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
    <Dialog
      open
      aria-label={t('response.aria')}
      data-testid="unlock-response-window"
      className="tabletop-response-dialog"
    >
      {fraction !== null && (
        <i
          className="absolute left-0 top-0 h-0.5 bg-acc transition-[width] duration-1000 ease-linear"
          style={{ width: `${Math.round(fraction * 100)}%` }}
          data-testid="unlock-response-progress"
        />
      )}
      <DialogHeader>
        <DialogTitle>{t('desktop.response.title')}</DialogTitle>
        <DialogDescription>
          {t('desktop.response.body', { name, layer: state.layer ?? '?' })}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <button
          type="button"
          disabled={!state.canCancel}
          onClick={() => void controller.makeMove('respondCancelUnlock', [])}
          data-testid="unlock-response-cancel"
          className="tabletop-primary"
        >
          {t('response.play')}
        </button>
        <button
          type="button"
          onClick={() => void controller.makeMove('passResponse', [])}
          data-testid="unlock-response-pass"
          className="tabletop-secondary"
        >
          {t('response.pass')}
        </button>
      </DialogFooter>
      <p className="mt-2 flex items-center gap-1 font-mono text-[9.5px] tracking-[.06em] text-faint">
        <Hourglass className="size-2.5 shrink-0" aria-hidden />
        {sub}
      </p>
    </Dialog>
  );
}
