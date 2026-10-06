// 主题选择器的小预览：每个主题一个示意图案 + 三段色（背景、面板、强调色）
//
// 深底加黄铜的主题在令牌上很接近，光靠色块分不出来，所以每个主题再配一个带自己特征的示意图案。
// 图案只用该主题的令牌画（见 MotifArt），不加载任何主题字体。

import type { ThemeDefinition, ThemeId } from '../../theme/themes';

export type ThemeMotif = 'film' | 'blueprint' | 'gyro' | 'rain' | 'ink';

/** 每个主题的示意图案：影院聚光、制图网格与楼板、陀螺与四层调色、数字雨、远山与朱印 */
export const THEME_MOTIFS: Readonly<Record<ThemeId, ThemeMotif>> = {
  noir: 'film',
  blueprint: 'blueprint',
  totem: 'gyro',
  matrix: 'rain',
  butterfly: 'ink',
};

/** 三段色：背景、面板、强调色 */
export function previewStripe(theme: ThemeDefinition): readonly [string, string, string] {
  return [theme.tokens.bg, theme.tokens.panel, theme.tokens.acc];
}

export function motifOf(id: ThemeId): ThemeMotif {
  return THEME_MOTIFS[id];
}
