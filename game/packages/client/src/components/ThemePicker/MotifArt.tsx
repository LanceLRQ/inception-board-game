// 主题小预览里的示意图案：只用该主题的令牌画，不依赖当前生效的主题
// （选择器是唯一需要在 A 主题下画出 B 主题颜色的地方，所以颜色取自主题表而不是 CSS 变量）

import { THEMES, type ThemeId } from '../../theme/themes';
import { TOTEM_LAYER_TINTS } from '../../theme/layerTints';
import { motifOf } from './preview';

export function MotifArt({ id }: { readonly id: ThemeId }) {
  const c = THEMES[id].tokens;
  const motif = motifOf(id);
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 72 44"
      preserveAspectRatio="xMidYMid slice"
      className="block h-full w-full"
    >
      <rect width="72" height="44" fill={c.bg} />
      {motif === 'film' && (
        <g>
          {/* 影院：聚光锥、银幕框与上下黑边 */}
          <polygon points="30,0 42,0 58,44 14,44" fill={c.accsoft} />
          <rect x="18" y="12" width="36" height="20" rx="1.5" fill="none" stroke={c.line2} />
          <circle cx="36" cy="22" r="3" fill={c.acc} />
          <rect width="72" height="5" fill={c.panel} />
          <rect y="39" width="72" height="5" fill={c.panel} />
        </g>
      )}
      {motif === 'blueprint' && (
        <g>
          {/* 蓝图：制图网格与两层轴测楼板 */}
          {[8, 16, 24, 32, 40, 48, 56, 64].map((x) => (
            <line key={`v${x}`} x1={x} y1="0" x2={x} y2="44" stroke={c.line} />
          ))}
          {[8, 16, 24, 32, 40].map((y) => (
            <line key={`h${y}`} x1="0" y1={y} x2="72" y2={y} stroke={c.line} />
          ))}
          <polygon points="36,23 58,31 36,39 14,31" fill="none" stroke={c.line2} />
          <polygon points="36,11 58,19 36,27 14,19" fill={c.accsoft} stroke={c.acc} />
        </g>
      )}
      {motif === 'gyro' && (
        <g>
          {/* 陀螺：圆环、自旋的陀螺，右侧是四层各自的调色 */}
          <circle cx="26" cy="22" r="15" fill="none" stroke={c.line2} />
          <ellipse cx="26" cy="15" rx="9" ry="3" fill="none" stroke={c.acc} />
          <polygon points="17,15 35,15 26,33" fill={c.accsoft} stroke={c.acc} />
          <line x1="26" y1="33" x2="26" y2="38" stroke={c.acc} />
          {([1, 2, 3, 4] as const).map((layer) => (
            <rect
              key={layer}
              x="52"
              y={6 + (layer - 1) * 9}
              width="14"
              height="6"
              rx="1"
              fill={TOTEM_LAYER_TINTS[layer]}
            />
          ))}
        </g>
      )}
      {motif === 'rain' && (
        <g fontFamily={c.mono} fontSize="7">
          {/* 矩阵：垂直的字符雨，雨头更亮 */}
          {[6, 15, 24, 33, 42, 51, 60].map((x, i) => (
            <g key={x} opacity={0.35 + ((i * 3) % 5) * 0.13}>
              <line
                x1={x + 3}
                y1="0"
                x2={x + 3}
                y2={14 + ((i * 7) % 5) * 5}
                stroke={c.acc}
                strokeWidth="5"
                strokeDasharray="2.2 1.6"
              />
              <rect x={x + 0.5} y={15 + ((i * 7) % 5) * 5} width="5" height="6" fill={c.accb} />
            </g>
          ))}
          <rect y="38" width="72" height="1" fill={c.line2} />
          <text x="3" y="43" fill={c.acc}>
            {'>_'}
          </text>
        </g>
      )}
      {motif === 'ink' && (
        <g>
          {/* 蝶梦：宣纸、三重远山与一枚朱印 */}
          <path d="M0,34 Q12,16 26,30 T52,26 T72,32 V44 H0 Z" fill={c.ink} opacity="0.1" />
          <path d="M0,38 Q18,24 34,36 T72,34 V44 H0 Z" fill={c.ink} opacity="0.18" />
          <path d="M0,42 Q24,34 44,41 T72,40 V44 H0 Z" fill={c.ink} opacity="0.3" />
          <rect x="54" y="6" width="9" height="9" rx="1" fill={c.acc} />
          <circle cx="22" cy="14" r="3" fill="none" stroke={c.lock} />
        </g>
      )}
    </svg>
  );
}
