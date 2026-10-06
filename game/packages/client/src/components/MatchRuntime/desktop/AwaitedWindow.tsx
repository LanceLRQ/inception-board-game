// 本人应答窗口：舞台右上角的内联窗口，与【解封】响应窗口同一外壳（ms-response）。
// 同一时间只有一个待应答：被 SHOOT 时的响应、天秤、意念判官、处女、白羊。
// 简单的选择直接在窗口里点；要选牌 / 分牌 / 选层的打开应答弹窗。联机有截止时间时显示倒计时。

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
  if (awaited === null) return null;

  const copy = awaitedCopy(awaited, {
    nicknameOf: controller.nicknameOf,
    cardNameOf: getCardName,
  });

  return (
    <div
      role="group"
      aria-label={t('awaited.aria')}
      data-testid="awaited-window"
      data-kind={awaited.kind}
      className="ms-response relative w-full overflow-hidden px-3.5 py-3"
    >
      <p className="font-mono text-[10px] tracking-[.26em] text-acc">{t(copy.titleKey)}</p>
      <p className="my-2 text-xs leading-relaxed text-foreground">
        {t(copy.bodyKey, copy.bodyParams)}
      </p>
      {copy.notes.map((note) => (
        <p key={note.key} className="mb-2 text-[11px] leading-snug text-dim">
          {t(note.key, note.params)}
        </p>
      ))}
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={action.disabled}
            onClick={() => perform(action)}
            data-testid={`awaited-action-${action.id}`}
            data-decline={action.decline ? 'true' : undefined}
            className="ms-btn min-h-8 px-3 text-[11.5px] tracking-[.1em]"
            data-variant={action.tone === 'primary' ? 'primary' : undefined}
          >
            <span>{t(action.labelKey, action.labelParams)}</span>
            {action.hintKey && (
              <span className="ml-1 text-[10px] opacity-80">· {t(action.hintKey)}</span>
            )}
          </button>
        ))}
      </div>
      {deadlineSeconds !== null && (
        <p
          className="mt-2 flex items-center gap-1 font-mono text-[9.5px] tracking-[.06em] text-faint"
          data-testid="awaited-countdown"
        >
          <Hourglass className="size-2.5 shrink-0" aria-hidden />
          {t('awaited.countdown', { seconds: deadlineSeconds })}
        </p>
      )}
    </div>
  );
}
