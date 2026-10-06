// 回合横幅的文案：「谁的回合 — 当前阶段」，所有主题的中央舞台共用

import { useTranslation } from 'react-i18next';
import type { BoardBanner } from '../model/boardModel';

export function useBannerText(banner: BoardBanner): string {
  const { t } = useTranslation();
  return t('board.banner.full', {
    turn: t(banner.key, banner.params),
    phase: t(banner.phaseKey, { defaultValue: banner.phaseKey }),
  });
}
