// 「庄周梦蝶」皮肤：宣纸亮色、四重山水长卷式的中央舞台、远山背景与按需加载的楷体

import { lazy } from 'react';
import {
  ButterflyAmbient,
  ButterflyMobileAmbient,
} from '../../components/MatchRuntime/stages/butterfly/ButterflyAmbient';
import type { ThemeSkin } from './types';

export const butterflySkin: ThemeSkin = {
  id: 'butterfly',
  CenterStage: lazy(() =>
    import('../../components/MatchRuntime/stages/butterfly/ButterflyStage').then((m) => ({
      default: m.ButterflyStage,
    })),
  ),
  Ambient: ButterflyAmbient,
  MobileAmbient: ButterflyMobileAmbient,
  center: { widthRatio: 0.5, minWidth: 460, maxWidth: 760, minHeight: 340 },
  // 霞鹜文楷屏幕版（SIL OFL 1.1）：按字符集分片，浏览器只下载用到的字所在的分片，且不进 PWA 预缓存。
  // 取 GB 字形版：简体中文按国标字形显示。
  loadFonts: () => import('lxgw-wenkai-screen-webfont/lxgwwenkaigbscreen.css'),
};
