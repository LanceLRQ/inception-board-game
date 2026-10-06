// 主题皮肤：令牌之外，每个主题还有一份皮肤
//
// 主题分三层：令牌（颜色 / 字体，见 themes.ts）、皮肤件（样式钩子类名，见 styles/skins/<id>.css）、
// 中央舞台（本文件的 CenterStage，每个主题一个结构不同的组件，按需加载）。
// 这里只放确实要在脚本里用到的皮肤参数：样式差异一律写在皮肤 CSS 里。

import type { ComponentType, LazyExoticComponent } from 'react';
import type { CenterStageProps } from '../../components/MatchRuntime/stages/types';
import type { ThemeId } from '../themes';

/** 中央舞台在桌面舞台上占的区域：座位规划按它给中央区让出位置 */
export interface CenterFootprint {
  /** 占舞台宽度的比例 */
  readonly widthRatio: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  /** 低于这个高度时中央舞台放不下，座位牌改用更紧凑的尺寸 */
  readonly minHeight: number;
}

export interface ThemeSkin {
  readonly id: ThemeId;
  /** 桌面端中央舞台，懒加载为独立 chunk，不进首屏包 */
  readonly CenterStage: LazyExoticComponent<ComponentType<CenterStageProps>>;
  /** 铺在桌面舞台最底层的背景氛围；没有就是纯底色 */
  readonly Ambient?: ComponentType;
  /** 铺在移动布局最底层的背景氛围；没有就是纯底色（移动端不分叉中央舞台，背景可以有） */
  readonly MobileAmbient?: ComponentType;
  readonly center: CenterFootprint;
  /**
   * 主题自带字体的按需加载函数（动态 import 字体样式）：应用这个主题时才触发，见 theme/fonts.ts。
   * 没有自带字体的主题不提供。
   */
  readonly loadFonts?: () => Promise<unknown>;
}
