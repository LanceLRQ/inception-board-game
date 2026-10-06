// 「陀螺未停」中央舞台的左半：陀螺仪
// 一枚侧视的陀螺立在表圈中央：表圈的描边长度就是牌库剩余（陀螺未停，游戏未终），
// 陀螺碟肩上的两道虚环流动表示自旋，整体绕支点微晃。下方是牌库读数。
// 纯展示；旋转与微晃可由 data-fx-off="totem" 单独关闭，样式在 styles/skins/totem.css。

import { useTranslation } from 'react-i18next';
import type { BoardDeck } from '../../model/boardModel';
import {
  GAUGE_CIRCUMFERENCE,
  GAUGE_RADIUS,
  GAUGE_TICKS,
  deckPercent,
  gaugeDashOffset,
} from './gyro';

/** 陀螺侧影：细针朝天、大碟肩、下锥收点 */
const TOP_BODY =
  'M60 10 C60.8 26 61.6 42 62.6 56 C64 64 74 70 88 75 C100 79.5 109 83 111 87 C106 95 92 101 80 107 C71 112 64 128 61.4 146 L60 162 L58.6 146 C56 128 49 112 40 107 C28 101 14 95 9 87 C11 83 20 79.5 32 75 C46 70 56 64 57.4 56 C58.4 42 59.2 26 60 10 Z';

export function TotemGyro({ deck }: { deck: BoardDeck }) {
  const { t } = useTranslation();
  const percent = deckPercent(deck.remaining, deck.total);

  return (
    <div
      className="totem-gyro grid shrink-0 grid-cols-[auto_1fr] items-center gap-x-3 @min-[520px]:flex @min-[520px]:w-[clamp(150px,36cqw,212px)] @min-[520px]:flex-col @min-[520px]:gap-0"
      data-testid="deck-meter"
    >
      <h2 className="totem-gyro-title col-start-2 row-start-1 self-end font-heading text-[13px] font-bold tracking-[.24em] whitespace-nowrap @min-[520px]:w-full">
        {t('desktop.board.totem.gyro')}
      </h2>
      <div
        role="progressbar"
        aria-label={t('desktop.board.deckAria')}
        aria-valuemin={0}
        aria-valuemax={deck.total}
        aria-valuenow={deck.remaining}
        className="totem-dial relative col-start-1 row-span-2 row-start-1 shrink-0"
      >
        <svg className="totem-gauge absolute" viewBox="0 0 140 140" aria-hidden focusable="false">
          <circle className="totem-gauge-track" cx="70" cy="70" r={GAUGE_RADIUS} />
          <circle
            className="totem-gauge-fill"
            cx="70"
            cy="70"
            r={GAUGE_RADIUS}
            strokeDasharray={GAUGE_CIRCUMFERENCE}
            strokeDashoffset={gaugeDashOffset(deck.remaining, deck.total)}
          />
          {GAUGE_TICKS.map((angle) => (
            <line
              key={angle}
              className="totem-gauge-tick"
              x1="70"
              y1="9"
              x2="70"
              y2="14"
              transform={`rotate(${angle} 70 70)`}
            />
          ))}
        </svg>
        <svg className="totem-top absolute" viewBox="0 0 120 180" aria-hidden focusable="false">
          <defs>
            <linearGradient id="totem-top-body" x1="0" y1="0" x2="1" y2="0">
              <stop className="totem-stop-0" offset="0" />
              <stop className="totem-stop-1" offset=".16" />
              <stop className="totem-stop-2" offset=".34" />
              <stop className="totem-stop-3" offset=".52" />
              <stop className="totem-stop-4" offset=".78" />
              <stop className="totem-stop-5" offset="1" />
            </linearGradient>
            <filter id="totem-top-blur" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.2" />
            </filter>
          </defs>
          <ellipse
            className="totem-top-shadow"
            cx="60"
            cy="164"
            rx="26"
            ry="4.6"
            filter="url(#totem-top-blur)"
          />
          <path
            className="totem-top-ghost"
            d={TOP_BODY}
            fill="url(#totem-top-body)"
            filter="url(#totem-top-blur)"
          />
          <path d={TOP_BODY} fill="url(#totem-top-body)" />
          <path className="totem-top-lit" d="M33 76.5 C44 71.5 54 66.5 57.5 60" />
          <path className="totem-top-lit-dim" d="M88 76 C98 80.5 106 84 109.5 87.5" />
          <path className="totem-top-cut" d="M15 90 C28 98 44 103 57 110" />
          <ellipse
            className="totem-spin totem-spin-a"
            cx="60"
            cy="87"
            rx="48"
            ry="8"
            strokeDasharray="10 15"
          />
          <ellipse
            className="totem-spin totem-spin-b"
            cx="60"
            cy="88"
            rx="54"
            ry="10"
            strokeDasharray="6 19"
          />
        </svg>
        <i className="totem-glow absolute" aria-hidden />
      </div>
      <p className="totem-read col-start-2 row-start-2 flex min-w-0 flex-col gap-0.5 self-start font-mono text-[10px] tracking-[.14em] @min-[520px]:items-center @min-[520px]:self-center @min-[520px]:text-center">
        <span className="tabular-nums whitespace-nowrap">
          {t('desktop.board.deck', { remaining: deck.remaining, total: deck.total })}
        </span>
        <span className="totem-read-sub tabular-nums whitespace-nowrap">
          {t('desktop.board.totem.left', { percent })}
        </span>
      </p>
    </div>
  );
}
