// 「陀螺未停」皮肤：陀螺仪 + 梦层塔的中央舞台、迷宫底纹背景、层级调色

import { lazy } from 'react';
import { TotemAmbient } from '../../components/MatchRuntime/stages/totem/TotemAmbient';
import type { ThemeSkin } from './types';

export const totemSkin: ThemeSkin = {
  id: 'totem',
  CenterStage: lazy(() =>
    import('../../components/MatchRuntime/stages/totem/TotemStage').then((m) => ({
      default: m.TotemStage,
    })),
  ),
  Ambient: TotemAmbient,
  center: { widthRatio: 0.44, minWidth: 400, maxWidth: 640, minHeight: 350 },
};
