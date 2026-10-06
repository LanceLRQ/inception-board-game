// 「梦境矩阵」的焦点层详情：进程表下面的一块「选中行」检视区
// 层号与层名、心锁骰、占位者（含已翻露的角色名）与这一层的说明。只展示，不处理出牌与选目标。

import { useTranslation } from 'react-i18next';
import { Crown, Play } from 'lucide-react';
import { Die } from '../../../Die';
import type { BoardLayer } from '../../model/boardModel';
import { PixelAvatar } from '../../../PixelAvatar';

interface MatrixDetailProps {
  readonly row: BoardLayer;
}

export function MatrixDetail({ row }: MatrixDetailProps) {
  const { t } = useTranslation();
  const lost = row.layer === 0;

  return (
    <section
      className="matrix-detail flex shrink-0 flex-col gap-1.5 px-3 py-2"
      data-testid="matrix-detail"
      data-layer={row.layer}
      aria-live="polite"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Play className="size-3 shrink-0 fill-current text-acc" aria-hidden />
        <b className="truncate text-[13px] font-bold tracking-[.12em]">
          L{row.layer} · {t(`board.layerName.${row.layer}`)}
        </b>
        <span className="matrix-dim ml-auto shrink-0 font-mono text-[9px] tracking-[.2em]">
          {t('desktop.board.focusLayerTag')}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {!lost && <Die value={row.heartLock} kind="lock" size={22} />}
        {row.occupants.map((o) => (
          <span
            key={o.id}
            data-testid={`occupant-${o.id}`}
            data-self={o.isSelf || undefined}
            className="matrix-occ flex max-w-44 items-center gap-1 text-[11px]"
          >
            <PixelAvatar seed={o.avatarSeed} size={14} rounded={false} />
            {o.isMaster && <Crown className="size-3 shrink-0 text-acc-bright" aria-hidden />}
            <span className="truncate">
              {o.isSelf ? t('seat.me') : o.name}
              {o.characterName && ` · ${o.characterName}`}
            </span>
          </span>
        ))}
      </div>
      <p className="matrix-detail-note matrix-dim truncate font-mono text-[10px] tracking-[.04em]">
        {t(row.note.key, row.note.params)}
      </p>
    </section>
  );
}
