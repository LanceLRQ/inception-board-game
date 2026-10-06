// 移动布局的视口形态：订阅两条媒体查询，换算成 phone / tablet / compact-landscape

import { useMediaQuery } from '../../../hooks/useMediaQuery';
import {
  COMPACT_LANDSCAPE_QUERY,
  TABLET_QUERY,
  resolveMobileMode,
  type MobileMode,
} from '../viewportMode';

export function useMobileMode(): MobileMode {
  const compactLandscape = useMediaQuery(COMPACT_LANDSCAPE_QUERY);
  const tablet = useMediaQuery(TABLET_QUERY);
  return resolveMobileMode({ compactLandscape, tablet });
}
