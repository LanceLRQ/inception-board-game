// 「筑梦蓝图」皮肤：轴测楼板式剖面中央舞台 + 图纸网格背景

import { lazy } from 'react';
import { BlueprintAmbient } from '../../components/MatchRuntime/stages/blueprint/BlueprintAmbient';
import type { ThemeSkin } from './types';

export const blueprintSkin: ThemeSkin = {
  id: 'blueprint',
  CenterStage: lazy(() =>
    import('../../components/MatchRuntime/stages/blueprint/BlueprintStage').then((m) => ({
      default: m.BlueprintStage,
    })),
  ),
  Ambient: BlueprintAmbient,
  center: { widthRatio: 0.36, minWidth: 380, maxWidth: 600, minHeight: 340 },
};
