// 「深眠影院」皮肤：影院式剖面中央舞台 + 轨道线背景

import { lazy } from 'react';
import { NoirAmbient } from '../../components/MatchRuntime/stages/noir/NoirAmbient';
import type { ThemeSkin } from './types';

export const noirSkin: ThemeSkin = {
  id: 'noir',
  CenterStage: lazy(() =>
    import('../../components/MatchRuntime/stages/noir/NoirStage').then((m) => ({
      default: m.NoirStage,
    })),
  ),
  Ambient: NoirAmbient,
  center: { widthRatio: 0.34, minWidth: 340, maxWidth: 600, minHeight: 330 },
};
