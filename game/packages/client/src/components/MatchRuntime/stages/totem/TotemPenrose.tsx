// 彭罗斯阶梯：迷失层（L0）的徽记——往下永远走得通，正是迷失层的定义
// 纯装饰的小图形，线条颜色由皮肤样式给（styles/skins/totem.css）。

export function TotemPenrose({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 52"
      fill="none"
      aria-hidden
      focusable="false"
      width="64"
      height="52"
    >
      <path className="totem-penrose-base" d="M8 44 L8 32 L20 32 L20 44 Z" />
      <path className="totem-penrose-base" d="M20 32 L20 20 L32 20 L32 32 Z" />
      <path className="totem-penrose-base" d="M32 20 L32 8 L44 8 L44 20 Z" />
      <path className="totem-penrose-hot" d="M44 20 L56 20 L56 32 L44 32 Z" />
      <path className="totem-penrose-hot" d="M44 32 L44 44 L32 44 L32 32 Z" />
      <path className="totem-penrose-hot-line" d="M32 44 L20 44 L20 32" />
    </svg>
  );
}
