import { useState, useEffect } from 'react';
import { RotateCw, X } from 'lucide-react';
import type { CardID } from '@icgame/shared';
import { Dialog } from '../ui/dialog';
import { CardArt } from '../CardArt';
import { getCardImageUrl, getCardBackImageUrl, hasCardBackImage } from '../../lib/cardImages';
import { getCardName } from '../../lib/cards';
import { ReferenceText } from '../GameGuide/ReferenceText';
import { CARD_REFERENCES, GUIDE_CATEGORIES } from '../../lib/cardReference';

export interface CardDetailModalProps {
  cardId: CardID | null;
  onClose: () => void;
  /** 金库等私密卡不允许由解析窗口绕过牌面可见性。 */
  disableFlip?: boolean;
}
export function shouldShowFlipButton(cardId: CardID | null, disableFlip?: boolean): boolean {
  return !!cardId && !disableFlip && hasCardBackImage(cardId);
}

function ModalContent({
  cardId,
  onClose,
  disableFlip,
  active,
}: {
  cardId: CardID;
  onClose: () => void;
  disableFlip?: boolean;
  active: boolean;
}) {
  const [showBack, setShowBack] = useState(false);
  const [zoom, setZoom] = useState(false);
  const hasBack = shouldShowFlipButton(cardId, disableFlip);
  useEffect(() => {
    if (!active || !hasBack) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        e.target.matches('input, textarea, [contenteditable=true]')
      )
        return;
      if (e.key.toLowerCase() === 'f') setShowBack((value) => !value);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, hasBack]);
  const displayId = showBack
    ? cardId.endsWith('_back')
      ? cardId.slice(0, -5)
      : `${cardId}_back`
    : cardId;
  const reference = CARD_REFERENCES[displayId];
  const displayUrl = showBack ? getCardBackImageUrl(cardId) : getCardImageUrl(cardId);
  const displayName = reference?.name ?? getCardName(displayId);
  return (
    <>
      <header className="tabletop-dialog-header">
        <span>原卡与完整解析</span>
        <button type="button" onClick={onClose} data-testid="card-detail-close">
          关闭 <X size={16} />
        </button>
      </header>
      <div className="tabletop-detail-layout" data-zoom={zoom}>
        <div className="tabletop-detail-art" tabIndex={0} aria-label="原卡，可滚动查看">
          <CardArt
            src={displayUrl}
            alt={displayName}
            fallback={displayName}
            trimBorder={false}
            className="tabletop-detail-image"
          />
          <div className="tabletop-detail-tools">
            <button
              type="button"
              className="tabletop-secondary"
              aria-pressed={zoom}
              onClick={() => setZoom(!zoom)}
            >
              {zoom ? '还原原卡' : '放大原卡'}
            </button>
            {hasBack && (
              <button
                type="button"
                className="tabletop-secondary"
                data-testid="card-detail-flip"
                aria-label="翻面"
                onClick={() => setShowBack(!showBack)}
              >
                <RotateCw size={16} />
                {showBack ? '看正面' : '看背面'}
              </button>
            )}
          </div>
        </div>
        <article className="tabletop-detail-copy" tabIndex={0} aria-label="完整文字说明，可滚动">
          <small>{reference ? GUIDE_CATEGORIES[reference.category] : '卡牌背面'}</small>
          <h2>{displayName}</h2>
          <div className="tabletop-fulltext">
            <ReferenceText text={reference?.fullText ?? '此为卡牌背面，尚无可公开的牌面内容。'} />
          </div>
          <p className="tabletop-source-note">
            文字来源：原版说明书与卡牌资料。完整原图保留，便于逐项对照。
          </p>
        </article>
      </div>
    </>
  );
}

export function CardDetailModal({ cardId, onClose, disableFlip }: CardDetailModalProps) {
  const [lastCardId, setLastCardId] = useState<CardID | null>(cardId);
  if (cardId && cardId !== lastCardId) setLastCardId(cardId);
  const displayId = cardId ?? lastCardId;
  return (
    <Dialog
      open={Boolean(cardId)}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      blocking={false}
      showClose={false}
      aria-label="卡牌详情"
      data-testid="card-detail-modal"
      className="tabletop-detail-dialog"
    >
      {displayId && (
        <ModalContent
          key={displayId}
          cardId={displayId}
          onClose={onClose}
          disableFlip={disableFlip}
          active={Boolean(cardId)}
        />
      )}
    </Dialog>
  );
}
