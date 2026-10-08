// 选牌按钮里的小缩略图 + 牌名
import { getCardName } from '../../lib/cards';
import { getCardImageUrl } from '../../lib/cardImages';

/** picker 按钮内小缩略图 + 中文名。兼容原先纯文字布局：inline-flex 横向 */
export function CardPickLabel({ cardId }: { cardId: string }) {
  const img = getCardImageUrl(cardId);
  return (
    <span className="inline-flex items-center gap-1.5">
      {img && (
        <img
          src={img}
          alt=""
          className="h-6 w-[16px] flex-shrink-0 rounded-sm object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      <span>{getCardName(cardId)}</span>
    </span>
  );
}
