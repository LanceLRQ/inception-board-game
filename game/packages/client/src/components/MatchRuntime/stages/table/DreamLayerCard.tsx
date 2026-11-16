import { useMediaQuery } from '../../../../hooks/useMediaQuery';
import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { getCardImageUrl } from '../../../../lib/cardImages';
import { getCardName } from '../../../../lib/cards';
import { CardArt } from '../../../CardArt';
import { Die } from '../../../Die';
import { PlayerAvatar } from '../../../PlayerIdentity/PlayerAvatar';
import type { BoardLayer, BoardOccupant } from '../../model/boardModel';

interface DreamLayerCardProps {
  readonly row: BoardLayer;
  readonly focus: boolean;
  readonly onFocus: (layer: number) => void;
  readonly onOpenCard: (cardId: string) => void;
}
export function OccupantChip({
  occupant,
  onOpenCard,
}: {
  occupant: BoardOccupant;
  onOpenCard?: (id: string) => void;
}) {
  return (
    <PlayerAvatar
      name={occupant.name}
      characterId={occupant.characterId}
      highlighted={occupant.isSelf || occupant.isCurrent}
      current={occupant.isCurrent}
      size={32}
      className="tabletop-occupant"
      testId={`occupant-${occupant.id}`}
      onOpenCard={onOpenCard}
    />
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
  const vaultName = getCardName(face);
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
        <span className="tabletop-layer-flipper">
          <span className="tabletop-layer-front" aria-hidden={flipped}>
            <span className="tabletop-layer-texture" aria-hidden>
              {Array.from({ length: 8 }, (_, i) => (
                <span
                  key={i}
                  style={{ backgroundImage: `url(/tabletop/layers/texture-${row.layer}.webp)` }}
                />
              ))}
            </span>
            <span className="tabletop-layer-number">
              <img src={`/tabletop/layers/number-${row.layer}.webp`} alt={`第 ${row.layer} 层`} />
            </span>
          </span>
          <span className="tabletop-layer-back" aria-hidden={!flipped}>
            <CardArt
              className="tabletop-vault-cover"
              src={getCardImageUrl(face)}
              alt={vaultName}
              fallback={vaultName}
              trimBorder={false}
            />
          </span>
        </span>
      </button>
      <div className="tabletop-layer-players">
        {row.occupants.map((o) => (
          <OccupantChip key={o.id} occupant={o} onOpenCard={onOpenCard} />
        ))}
      </div>
      <span className="tabletop-layer-die">
        <Die value={row.heartLock} size={29} />
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
