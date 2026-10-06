// 皮肤注册表：每个主题 id 对应一份皮肤
// 新增主题时在这里登记，并加 stages/<id>/ 中央舞台与 styles/skins/<id>.css（见 CLAUDE.md「新增主题」）。

import type { ThemeId } from '../themes';
import { noirSkin } from './noir';
import type { ThemeSkin } from './types';

export const SKINS: Readonly<Record<ThemeId, ThemeSkin>> = {
  noir: noirSkin,
};

export function getSkin(id: ThemeId): ThemeSkin {
  return SKINS[id];
}

export type { CenterFootprint, ThemeSkin } from './types';
