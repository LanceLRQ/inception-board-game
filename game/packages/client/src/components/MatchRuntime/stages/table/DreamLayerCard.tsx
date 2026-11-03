import { useMediaQuery } from '../../../../hooks/useMediaQuery';
import { useState } from 'react';
import { Info, TriangleAlert } from 'lucide-react';
import { getCardImageUrl } from '../../../../lib/cardImages';
import { getCardName } from '../../../../lib/cards';
import { Die } from '../../../Die';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../../ui/tooltip';
import type { BoardLayer, BoardOccupant } from '../../model/boardModel';

interface DreamLayerCardProps {
  readonly row: BoardLayer;
  readonly focus: boolean;
  readonly onFocus: (layer: number) => void;
  readonly onOpenCard: (cardId: string) => void;
}
export function OccupantChip({ occupant, named }: { occupant: BoardOccupant; named: boolean }) {
  const name = `${occupant.name}${occupant.isSelf ? ' · 你' : ''}${occupant.isCurrent ? ' · 行动中' : ''}`;
  return (
    <Tooltip>
      <TooltipTrigger
        className="tabletop-occupant"
        data-self={occupant.isSelf}
        data-current={occupant.isCurrent}
        data-testid={`occupant-${occupant.id}`}
        aria-label={name}
      >
        {occupant.characterId ? (
          <img src={getCardImageUrl(occupant.characterId)} alt="" />
        ) : (
          <span>{occupant.name.slice(0, 1)}</span>
        )}
        {named && <span>{name}</span>}
      </TooltipTrigger>
      <TooltipContent>
        {name} · {occupant.characterName}
      </TooltipContent>
    </Tooltip>
  );
}
export function DreamLayerCard({ row, focus, onFocus, onOpenCard }: DreamLayerCardProps) {
  const mobile = useMediaQuery('(max-width: 1023px)');
  const [flipped, setFlipped] = useState(false);
  const [vaultIndex, setVaultIndex] = useState(0);
  const vault = row.vaults[vaultIndex] ?? row.vaults[0];
  const face =
    vault?.contentType === 'secret'
      ? 'vault_secret'
      : vault?.contentType === 'coin'
        ? 'vault_gold'
        : 'vault_back';
  const status = vault?.opened
    ? '已公开'
    : vault?.contentType !== 'hidden' && vault
      ? '仅你可见'
      : '未查看';
  return (
    <div
      className="tabletop-layer"
      data-testid={`layer-row-${row.layer}`}
      data-layer={row.layer}
      data-focus={focus}
      data-viewer-layer={row.hasViewer}
      data-unlocking={row.unlocking}
      data-flipped={flipped}
      style={{ backgroundImage: `url(/tabletop/layers/texture-${row.layer}.webp)` }}
    >
      <button
        type="button"
        className="tabletop-layer-face"
        data-testid={`layer-focus-${row.layer}`}
        aria-label={`第 ${row.layer} 层，${status}，点击翻看金库`}
        aria-pressed={flipped}
        onClick={() => {
          onFocus(row.layer);
          if (mobile) onOpenCard(face);
          else setFlipped(!flipped);
        }}
      >
        {flipped && vault ? (
          <img
            className="tabletop-vault-cover"
            src={getCardImageUrl(face)}
            alt={getCardName(face)}
          />
        ) : (
          <img
            className="tabletop-layer-number"
            src={`/tabletop/layers/number-${row.layer}.webp`}
            alt={`第 ${row.layer} 层`}
          />
        )}
      </button>
      <div className="tabletop-layer-players">
        {row.occupants.map((o) => (
          <OccupantChip key={o.id} occupant={o} named={false} />
        ))}
      </div>
      <span className="tabletop-layer-die">
        <Die value={row.heartLock} size={30} />
        {row.heartLock === 0 && <span>0</span>}
      </span>
      <div className="tabletop-layer-status">
        {row.vaults.map((v, i) => (
          <button
            type="button"
            key={v.id}
            data-testid={`vault-thumb-${v.id}`}
            aria-label={`金库 ${i + 1}：${v.opened ? '已公开' : v.contentType === 'hidden' ? '未查看' : '仅你可见'}`}
            onClick={() => {
              setVaultIndex(i);
              if (mobile)
                onOpenCard(
                  v.contentType === 'secret'
                    ? 'vault_secret'
                    : v.contentType === 'coin'
                      ? 'vault_gold'
                      : 'vault_back',
                );
              else setFlipped(true);
            }}
          >
            {row.vaults.length > 1 ? `${i + 1} · ` : ''}
            {v.opened ? '已公开' : v.contentType === 'hidden' ? '未查看' : '仅你可见'}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="tabletop-layer-info"
        onClick={() => onOpenCard(flipped ? face : row.dreamCardId)}
        aria-label={`第 ${row.layer} 层说明`}
      >
        <Info size={16} />
        <span>说明</span>
      </button>
      {row.nightmare && (
        <button
          type="button"
          className="tabletop-nightmare"
          disabled={!row.nightmare.cardId}
          onClick={() => row.nightmare?.cardId && onOpenCard(row.nightmare.cardId)}
        >
          <TriangleAlert size={14} />
          {row.nightmare.cardId ? getCardName(row.nightmare.cardId) : '梦魇未公开'}
        </button>
      )}
    </div>
  );
}
