// 胜负覆盖层里的举报区：列出每位真人对手，各有一个举报入口
// 只在联机对局出现（来源提供了举报通道且有真人对手）。

import { useTranslation } from 'react-i18next';
import { PixelAvatar } from '../../PixelAvatar';
import { ReportButton } from '../../ReportButton';
import type { ReportModel } from '../controllerTypes';

export function OutcomeReport({ report }: { readonly report: ReportModel }) {
  const { t } = useTranslation();
  return (
    <section
      className="mt-4 border-t border-line pt-3 text-left"
      aria-label={t('report.section')}
      data-testid="outcome-report"
    >
      <h3 className="mb-1.5 text-xs text-dim">{t('report.section')}</h3>
      <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
        {report.targets.map((target) => (
          <li
            key={target.seat}
            className="flex items-center gap-2"
            data-testid={`report-row-${target.seat}`}
          >
            <PixelAvatar seed={target.avatarSeed} size={24} />
            <span className="min-w-0 flex-1 truncate text-sm">{target.nickname}</span>
            <ReportButton
              seat={target.seat}
              targetNickname={target.nickname}
              onSubmit={(reason, description) => report.submit(target.seat, reason, description)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
