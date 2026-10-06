// 手牌坞里的本人身份块：角色头像（点按看角色详情）、角色名、所在层 / 技能状态

import { useTranslation } from 'react-i18next';
import { getCardImageUrl } from '../../../lib/cardImages';
import { getCharacterSkillSummary } from '../../../lib/cards';
import type { SelfInfo } from '../controllerTypes';

interface DockSelfBlockProps {
  readonly self: SelfInfo;
  /** 此刻可用的主动技能名；没有为 null */
  readonly skillName: string | null;
  readonly onPreview: (characterId: string) => void;
}

export function DockSelfBlock({ self, skillName, onPreview }: DockSelfBlockProps) {
  const { t } = useTranslation();
  const summary = getCharacterSkillSummary(self.characterId);
  const imageUrl = getCardImageUrl(self.characterId);
  const name = summary?.name ?? t('localMatch.you');
  const layerText =
    self.layer === 0
      ? t('mobile.dock.lostLayer')
      : t('mobile.dock.layerStatus', { layer: self.layer });
  const status = skillName ? t('mobile.dock.skillReady', { name: skillName }) : null;

  return (
    <div
      className="flex w-[108px] shrink-0 items-center gap-2 max-[359px]:w-auto"
      data-testid="dock-self"
    >
      <button
        type="button"
        disabled={!self.characterId}
        onClick={() => onPreview(self.characterId)}
        aria-label={`${t('mobile.rail.seeDetail', { name })}`}
        data-testid="human-character-preview"
        className="relative size-11 shrink-0 touch-manipulation overflow-hidden rounded-[10px] border border-acc bg-panel"
      >
        {imageUrl && (
          <img src={imageUrl} alt="" draggable={false} className="size-full object-cover" />
        )}
      </button>
      <div className="min-w-0 max-[359px]:hidden" data-testid="human-character">
        <b className="block truncate font-heading text-xs font-bold tracking-[.06em]">{name}</b>
        <span className="mt-0.5 block truncate font-mono text-[8px] tracking-[.02em] text-dim">
          {layerText}
          {status && ` · ${status}`}
        </span>
      </div>
    </div>
  );
}
