// 蝶：线描的蝴蝶，两对翅膀加触须，颜色全由样式取（描边与翅面取令牌）
// 纯装饰：扇动与漂移可由 data-fx-off="drift" 关闭，样式在 styles/skins/butterfly.css。

interface ButterflyGlyphProps {
  readonly className?: string;
}

/** 右半边的上翅与下翅（左半边镜像得到） */
const UPPER_WING = 'M30 25 C 33 11, 45 2, 53 6 C 58 9, 56 19, 48 23 C 44 25, 37 26, 30 26 Z';
const LOWER_WING = 'M30 26 C 37 27, 45 29, 46 36 C 47 43, 38 46, 34 40 C 32 36, 31 31, 30 28 Z';

export function ButterflyGlyph({ className }: ButterflyGlyphProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 60 48"
      fill="none"
      aria-hidden
      focusable="false"
      data-testid="butterfly-glyph"
    >
      <g className="butterfly-wings">
        <path className="butterfly-wing" d={UPPER_WING} />
        <path className="butterfly-wing" d={LOWER_WING} />
        <g transform="translate(60 0) scale(-1 1)">
          <path className="butterfly-wing" d={UPPER_WING} />
          <path className="butterfly-wing" d={LOWER_WING} />
        </g>
      </g>
      <path
        className="butterfly-feeler"
        d="M30 22 C 29 16, 26 12, 23 10 M30 22 C 31 16, 34 12, 37 10"
      />
      <path className="butterfly-body" d="M30 20 L30 38" />
    </svg>
  );
}
