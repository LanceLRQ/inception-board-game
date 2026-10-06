// 本人应答响应条：坞上方拇指够得着的位置，与【解封】响应条同一外观。
// 逻辑与桌面的应答窗口完全一致（共用控制层的 response 模型与文案）；
// 要选牌 / 分牌 / 选层的打开应答弹窗，联机有截止时间时显示倒计时。

import { useTranslation } from 'react-i18next';
import { getCardName } from '../../../lib/cards';
import { cn } from '../../../lib/utils';
import type { MatchController } from '../controllerTypes';
import { awaitedCopy } from '../shared/awaitedCopy';

interface MobileAwaitedBarProps {
  readonly controller: MatchController;
}

export function MobileAwaitedBar({ controller }: MobileAwaitedBarProps) {
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
      data-testid="awaited-bar"
      data-kind={awaited.kind}
      className="relative shrink-0 border-t border-line bg-acc-soft px-3 pb-3 pt-2 tablet:px-6"
    >
      <div className="text-[11px] leading-snug tablet:text-sm">
        <b className="text-acc-bright">{t(copy.titleKey)}</b>
        <span className="ml-1.5 text-foreground">{t(copy.bodyKey, copy.bodyParams)}</span>
        {copy.notes.map((note) => (
          <span key={note.key} className="mt-0.5 block text-[10.5px] text-dim">
            {t(note.key, note.params)}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={action.disabled}
            onClick={() => perform(action)}
            data-testid={`awaited-action-${action.id}`}
            data-decline={action.decline ? 'true' : undefined}
            className={cn(
              'min-h-11 flex-1 touch-manipulation border px-3 text-[11.5px] font-semibold tracking-[.05em] whitespace-nowrap active:translate-y-px tablet:min-h-12 tablet:text-sm',
              action.tone === 'primary'
                ? 'border-acc bg-acc text-background disabled:border-line-strong disabled:bg-panel disabled:font-normal disabled:text-faint'
                : 'border-line-strong bg-panel font-normal text-dim disabled:text-faint',
            )}
          >
            {t(action.labelKey, action.labelParams)}
            {action.hintKey && (
              <span className="ml-1 text-[10px] font-normal opacity-80">· {t(action.hintKey)}</span>
            )}
          </button>
        ))}
      </div>
      {deadlineSeconds !== null && (
        <p
          className="mt-1.5 font-mono text-[9px] tracking-[.04em] text-dim"
          data-testid="awaited-countdown"
        >
          {t('awaited.countdown', { seconds: deadlineSeconds })}
        </p>
      )}
    </div>
  );
}
