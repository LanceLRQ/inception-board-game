import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../ui/dialog';
import { useTranslation } from 'react-i18next';
import { Hourglass } from 'lucide-react';
import { getCardName } from '../../../lib/cards';
import type { MatchController } from '../controllerTypes';
import { awaitedCopy } from '../shared/awaitedCopy';

interface AwaitedWindowProps {
  readonly controller: MatchController;
}

export function AwaitedWindow({ controller }: AwaitedWindowProps) {
  const { t } = useTranslation();
  const { awaited, actions, deadlineSeconds, perform } = controller.response;
  if (awaited === null || controller.response.sheet.open !== null) return null;

  const copy = awaitedCopy(awaited, {
    nicknameOf: controller.nicknameOf,
    cardNameOf: getCardName,
  });

  return (
    <Dialog
      open
      aria-label={t('awaited.aria')}
      data-testid="awaited-window"
      className="tabletop-response-dialog"
    >
      <DialogHeader>
        <DialogTitle>{t(copy.titleKey)}</DialogTitle>
        <DialogDescription>{t(copy.bodyKey, copy.bodyParams)}</DialogDescription>
      </DialogHeader>
      {copy.notes.map((note) => (
        <p key={note.key} className="mb-2 text-[11px] leading-snug text-dim">
          {t(note.key, note.params)}
        </p>
      ))}
      <DialogFooter>
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={action.disabled}
            onClick={() => perform(action)}
            data-testid={`awaited-action-${action.id}`}
            data-decline={action.decline ? 'true' : undefined}
            className={action.tone === 'primary' ? 'tabletop-primary' : 'tabletop-secondary'}
            data-variant={action.tone === 'primary' ? 'primary' : undefined}
          >
            <span>{t(action.labelKey, action.labelParams)}</span>
            {action.hintKey && (
              <span className="ml-1 text-[10px] opacity-80">· {t(action.hintKey)}</span>
            )}
          </button>
        ))}
      </DialogFooter>
      {deadlineSeconds !== null && (
        <p
          className="mt-2 flex items-center gap-1 font-mono text-[9.5px] tracking-[.06em] text-faint"
          data-testid="awaited-countdown"
        >
          <Hourglass className="size-2.5 shrink-0" aria-hidden />
          {t('awaited.countdown', { seconds: deadlineSeconds })}
        </p>
      )}
    </Dialog>
  );
}
