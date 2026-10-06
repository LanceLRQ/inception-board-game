// 「梦境矩阵」皮肤：终端窗口式的进程表中央舞台、数字雨背景、扫描线与卡图降饱和

import { lazy } from 'react';
import {
  MatrixAmbient,
  MatrixMobileAmbient,
} from '../../components/MatchRuntime/stages/matrix/MatrixAmbient';
import type { ThemeSkin } from './types';

export const matrixSkin: ThemeSkin = {
  id: 'matrix',
  CenterStage: lazy(() =>
    import('../../components/MatchRuntime/stages/matrix/MatrixStage').then((m) => ({
      default: m.MatrixStage,
    })),
  ),
  Ambient: MatrixAmbient,
  MobileAmbient: MatrixMobileAmbient,
  center: { widthRatio: 0.46, minWidth: 440, maxWidth: 720, minHeight: 340 },
};
