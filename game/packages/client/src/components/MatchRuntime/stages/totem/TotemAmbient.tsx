// 「陀螺未停」的舞台背景：阿里阿德涅的迷宫（同心的断弧）+ 中央微光
// 纯装饰，不拦截指针；迷宫可由 data-fx-off="maze" 单独关闭，样式在 styles/skins/totem.css。

/** 迷宫的七圈断弧：每圈在右上与左下各留一段，半径从外到内 */
const MAZE_RADII = [94, 82, 70, 58, 46, 34, 22] as const;

export function TotemAmbient() {
  return (
    <div className="ms-ambient totem-ambient pointer-events-none absolute inset-0" aria-hidden>
      <svg className="totem-maze" viewBox="0 0 200 200" fill="none" focusable="false">
        {MAZE_RADII.map((r) => (
          <path
            key={r}
            d={`M100 ${100 - r} a${r} ${r} 0 0 1 ${r} ${r} M100 ${100 + r} A${r} ${r} 0 0 1 ${100 - r} 100`}
          />
        ))}
        <circle cx="100" cy="100" r="3" />
      </svg>
    </div>
  );
}
