import type { CSSProperties } from 'react';
import { getCardImageUrl } from '../../lib/cardImages';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { PlayerName, type PlayerNameProps } from './PlayerName';

const PORTRAITS = new Set([
  'thief_space_queen',
  'thief_apollo',
  'thief_tourist',
  'thief_capricornus',
  'thief_lord_of_war',
]);

interface PlayerAvatarProps extends PlayerNameProps {
  highlighted?: boolean;
  current?: boolean;
  size?: number;
  className?: string;
  testId?: string;
  onOpenCard?: (id: string) => void;
}

export function PlayerAvatar({
  name,
  characterId,
  highlighted = false,
  current = false,
  size = 44,
  className = '',
  testId,
  onOpenCard,
}: PlayerAvatarProps) {
  const cropped = !!characterId && PORTRAITS.has(characterId);
  return (
    <Tooltip>
      <TooltipTrigger
        className={`player-avatar ${className}`}
        data-testid={testId}
        data-highlighted={highlighted || undefined}
        data-current={current || undefined}
        style={{ '--avatar-size': `${size}px` } as CSSProperties}
        aria-label={`查看${name}角色`}
        disabled={!characterId || !onOpenCard}
        onClick={() => characterId && onOpenCard?.(characterId)}
      >
        <span
          className="player-avatar-face"
          data-cropped={cropped}
          data-character={characterId}
          data-master={characterId?.startsWith('dm_') || undefined}
        >
          {characterId ? (
            <img
              src={
                cropped ? `/tabletop/portraits/${characterId}.webp` : getCardImageUrl(characterId)
              }
              alt=""
            />
          ) : (
            name.slice(0, 1)
          )}
        </span>
        {current && <i className="player-avatar-dot" aria-hidden />}
      </TooltipTrigger>
      <TooltipContent>
        <PlayerName name={name} characterId={characterId} />
        {current ? ' · 行动中' : ''}
      </TooltipContent>
    </Tooltip>
  );
}
