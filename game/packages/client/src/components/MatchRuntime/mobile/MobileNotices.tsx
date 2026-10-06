// 手牌坞上方的提示区：托管横幅、等待提示、解封响应条
// 都收在这里，不占主体高度；没有任何提示时整块不渲染。

import { useTranslation } from 'react-i18next';
import { SelfTakeoverBanner } from '../../SelfTakeoverBanner';
import type { MatchController } from '../controllerTypes';
import { MobileResponseBar } from './MobileResponseBar';

interface MobileNoticesProps {
  readonly controller: MatchController;
}

export function MobileNotices({ controller }: MobileNoticesProps) {
  const { t } = useTranslation();
  const { turn, takeover } = controller;
  return (
    <div className="shrink-0" data-testid="mobile-notices">
      <SelfTakeoverBanner compact visible={takeover.bannerVisible} onResume={takeover.resume} />
      {turn.awaiting && (
        <div
          className="border-t border-line bg-panel px-3 py-1.5 text-xs text-dim"
          role="status"
          data-testid="awaiting-notice"
        >
          {turn.awaiting.mine
            ? t('match.waiting_auto', {
                defaultValue: '这一步暂时不能手动操作，到时间后由系统代为处理',
              })
            : t('match.waiting_others', { defaultValue: '等待其他玩家应答' })}
        </div>
      )}
      <MobileResponseBar controller={controller} />
    </div>
  );
}
