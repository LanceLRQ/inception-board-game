// 梦魇发动时的附加参数表单：回音萦绕选层与方式，邪念瘟疫点名要派发贿赂牌的盗梦者。
// 金库三选一、技能面板里的发动、白羊·星尘的应答三处入口共用。只负责展示与收集点按，草稿由调用方持有。
// 参数的推导与拼装见 lib/nightmareParams.ts。

import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ECHO_LAYER_CHOICES,
  togglePlagueTarget,
  type NightmareParamDraft,
  type NightmareParamKind,
} from '../../lib/nightmareParams';

export interface NightmareParamsFormProps {
  readonly kind: NightmareParamKind;
  readonly draft: NightmareParamDraft;
  readonly onChange: (draft: NightmareParamDraft) => void;
  /** 邪念瘟疫能点名的盗梦者 */
  readonly candidates: readonly string[];
  /** 贿赂池里还没派出的张数（点名人数上限） */
  readonly poolCount: number;
  readonly nicknameOf: (id: string) => string;
  /** data-testid 前缀，各入口分开，端到端用例好定位 */
  readonly testIdPrefix: string;
}

const CHIP =
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] hover:border-acc/60';
const CHIP_ON = 'border-acc bg-acc/30 text-acc-bright';
const CHIP_OFF = 'border-border bg-card';

export function NightmareParamsForm({
  kind,
  draft,
  onChange,
  candidates,
  poolCount,
  nicknameOf,
  testIdPrefix,
}: NightmareParamsFormProps) {
  const { t } = useTranslation();
  if (kind === 'none') return null;

  if (kind === 'echo') {
    return (
      <div className="space-y-2" data-testid={`${testIdPrefix}-echo`}>
        <p className="text-[11px] text-muted-foreground">{t('nightmare.echo.desc')}</p>
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label={t('nightmare.echo.layerLabel')}
        >
          <span className="text-[11px] text-muted-foreground">
            {t('nightmare.echo.layerLabel')}
          </span>
          {ECHO_LAYER_CHOICES.map((layer) => (
            <button
              key={layer}
              type="button"
              aria-pressed={draft.echoLayer === layer}
              onClick={() => onChange({ ...draft, echoLayer: layer })}
              data-testid={`${testIdPrefix}-echo-layer-${layer}`}
              className={cn(CHIP, draft.echoLayer === layer ? CHIP_ON : CHIP_OFF)}
            >
              {draft.echoLayer === layer && <Check className="size-3" aria-hidden />}
              {t('nightmare.layer', { layer })}
            </button>
          ))}
        </div>
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label={t('nightmare.echo.actionLabel')}
        >
          <span className="text-[11px] text-muted-foreground">
            {t('nightmare.echo.actionLabel')}
          </span>
          {(['restore', 'add'] as const).map((action) => (
            <button
              key={action}
              type="button"
              aria-pressed={draft.echoAction === action}
              onClick={() => onChange({ ...draft, echoAction: action })}
              data-testid={`${testIdPrefix}-echo-${action}`}
              className={cn(CHIP, draft.echoAction === action ? CHIP_ON : CHIP_OFF)}
            >
              {draft.echoAction === action && <Check className="size-3" aria-hidden />}
              {t(`nightmare.echo.${action}`)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-plague`}>
      <p className="text-[11px] text-muted-foreground">
        {t('nightmare.plague.desc', { count: poolCount })}
      </p>
      {candidates.length === 0 ? (
        <p className="text-[12px] text-faint">{t('nightmare.plague.none')}</p>
      ) : (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('nightmare.plague.label')}>
          {candidates.map((id) => {
            const on = draft.bribed.includes(id);
            const full = !on && draft.bribed.length >= poolCount;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                aria-disabled={full || undefined}
                title={full ? t('nightmare.plague.poolFull') : undefined}
                onClick={() =>
                  onChange({
                    ...draft,
                    bribed: [...togglePlagueTarget(draft.bribed, id, poolCount)],
                  })
                }
                data-testid={`${testIdPrefix}-plague-${id}`}
                className={cn(
                  CHIP,
                  on ? CHIP_ON : CHIP_OFF,
                  full && 'cursor-not-allowed opacity-50',
                )}
              >
                {on && <Check className="size-3" aria-hidden />}
                {nicknameOf(id)}
              </button>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground" data-testid={`${testIdPrefix}-plague-count`}>
        {t('nightmare.plague.chosen', { count: draft.bribed.length, max: poolCount })}
      </p>
    </div>
  );
}
