// 底部坞里的本人身份块：角色卡（点按看详情）、角色名、所在层 / 手牌数 / 技能状态、座位标识

import { useTranslation } from 'react-i18next';
import { getCardImageUrl } from '../../../lib/cardImages';
import { getCharacterSkillSummary } from '../../../lib/cards';
import { CardArt } from '../../CardArt';
import { SeatStatusBadges } from '../../SeatStatusBadges';
import type { SelfInfo } from '../controllerTypes';
import type { SeatMarker } from '../seatMarkers';

interface DockSelfProps {
  readonly self: SelfInfo;
  readonly handCount: number;
  /** 此刻可用的主动技能名；没有为 null */
  readonly skillName: string | null;
  /** 弃牌阶段需要弃的张数；不用弃为 0 */
  readonly mustDiscard: number;
  readonly markers: readonly SeatMarker[];
  readonly onPreview: (characterId: string) => void;
}

export function DockSelf({
  self,
  handCount,
  skillName,
  mustDiscard,
  markers,
  onPreview,
}: DockSelfProps) {
  const { t } = useTranslation();
  const summary = getCharacterSkillSummary(self.characterId);
  const name = summary?.name ?? t('localMatch.you');
  const layerText =
    self.layer === 0 ? t('dock.lostLayer') : t('dock.layerStatus', { layer: self.layer });

  return (
    <div
      className="ms-dock-self flex shrink-0 items-center gap-3 pr-4"
      style={{ width: 'clamp(196px, 16vw, 264px)' }}
      data-testid="dock-self"
    >
      <button
        type="button"
        disabled={!self.characterId}
        onClick={() => onPreview(self.characterId)}
        aria-label={t('seat.seeDetail', { name })}
        data-testid="human-character-preview"
        className="ms-card relative block h-[clamp(64px,11dvh,112px)] shrink-0 aspect-[3/4] overflow-hidden disabled:cursor-default"
      >
        <CardArt src={getCardImageUrl(self.characterId)} className="size-full" />
      </button>
      <div className="min-w-0" data-testid="human-character">
        <b className="block truncate font-heading text-[15px] font-bold tracking-[.08em]">{name}</b>
        <span className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-[9.5px] leading-snug tracking-[.12em] whitespace-nowrap text-dim">
          <span>{layerText}</span>
          <span>{t('desktop.dock.handCount', { n: handCount })}</span>
        </span>
        {skillName && (
          <span className="mt-0.5 block truncate text-[10.5px] text-acc">
            {t('dock.skillReady', { name: skillName })}
          </span>
        )}
        {mustDiscard > 0 && (
          <span className="mt-0.5 block text-[10.5px] text-acc-bright" data-testid="must-discard">
            {t('localMatch.mustDiscard', { n: mustDiscard })}
          </span>
        )}
        {self.bribeReceived > 0 && (
          <span
            className="mt-1 inline-block bg-acc-soft px-1.5 py-0.5 text-[10px] text-acc-bright"
            data-testid="human-bribe-received"
          >
            {t('localMatch.bribeReceived', { n: self.bribeReceived })}
          </span>
        )}
        <SeatStatusBadges markers={markers} seatId={self.seat} size="sm" className="mt-1" />
      </div>
    </div>
  );
}
