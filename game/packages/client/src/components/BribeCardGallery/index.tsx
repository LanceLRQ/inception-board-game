import type { MatchView } from '@icgame/game-engine';
import { getCardImageUrl } from '../../lib/cardImages';
import { getCardMeta } from '../../lib/cards';
import { CardArt } from '../CardArt';

/** 只展示视图已授权的牌面；未知内容用原版卡背。 */
export function BribeCardGallery({
  bribes,
}: {
  bribes: readonly Pick<MatchView['bribePool'][number], 'id' | 'kind'>[];
}) {
  return (
    <div className="flex flex-wrap justify-center gap-4">
      {bribes.map((bribe) => {
        const cardId =
          bribe.kind === 'deal'
            ? 'bribe_success'
            : bribe.kind === 'fail'
              ? 'bribe_fail'
              : 'bribe_back';
        const card = getCardMeta(cardId);
        return (
          <figure
            key={bribe.id}
            className="flex w-[calc(50%-0.5rem)] max-w-full flex-col items-center gap-2 only:w-full"
          >
            <CardArt
              src={getCardImageUrl(cardId)}
              alt={card?.name ?? '贿赂牌背面'}
              trimBorder={false}
              className="h-auto max-h-[min(42dvh,360px)] w-auto max-w-full rounded-md"
            />
            <figcaption className="text-center text-xs text-muted-foreground">
              <strong className="block">{card?.name ?? '未知'}</strong>
              {card?.category === 'bribe' && <p className="mt-1">{card.description}</p>}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
