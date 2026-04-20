// 梦境层可视化
// 展示 L1-L4 + 迷失层 L0（死亡玩家），每层内显示心锁值、金库、玩家列表
// 人类玩家高亮，梦主徽标，死亡玩家在迷失层
//
// 对照：plans/design/02-game-rules-spec.md §2.3 梦境层

import { useTranslation } from 'react-i18next';
import { Crown, Heart, Skull, User } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getCardImageUrl } from '../../lib/cardImages';

interface PlayerView {
  id: string;
  nickname: string;
  faction: string;
  currentLayer: number;
  isAlive: boolean;
}

interface LayerView {
  layer: number;
  heartLockValue: number;
  vaultCount: number;
  /** 已打开且可见的金库内容（秘密/金币/空） */
  openedVaults: Array<{ contentType: 'secret' | 'coin' | 'empty' }>;
  nightmareRevealed: boolean;
  /** 已翻开的梦魇牌 cardId（用于展示真实卡图） */
  nightmareCardId?: string | null;
  playerIds: string[];
}

export interface LayerMapProps {
  readonly layers: LayerView[];
  readonly players: Record<string, PlayerView>;
  readonly humanPlayerId: string;
  readonly dreamMasterId: string;
  readonly currentPlayerId: string;
  /** 点击金库/梦魇缩略图时触发预览模态框（上游 setPreviewCard） */
  readonly onCardPreview?: (cardId: string) => void;
}

export function LayerMap({
  layers,
  players,
  humanPlayerId,
  dreamMasterId,
  currentPlayerId,
  onCardPreview,
}: LayerMapProps) {
  const { t } = useTranslation();
  // 按层序显示：L4 在上方（最深），L0（迷失层）在最下
  const sortedLayers = [...layers].sort((a, b) => b.layer - a.layer);

  const deadPlayers = Object.values(players).filter((p) => !p.isAlive);

  return (
    <div className="mb-4 space-y-1.5" data-testid="layer-map">
      {sortedLayers.map((layer) => (
        <LayerRow
          key={layer.layer}
          layer={layer}
          players={players}
          humanPlayerId={humanPlayerId}
          dreamMasterId={dreamMasterId}
          currentPlayerId={currentPlayerId}
          onCardPreview={onCardPreview}
        />
      ))}
      {deadPlayers.length > 0 && (
        <div
          className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs"
          data-testid="layer-lost"
        >
          <Skull className="h-3.5 w-3.5 text-destructive" />
          <span className="font-medium text-destructive">
            {t('localMatch.lostLayer', { defaultValue: '迷失层' })}
          </span>
          <div className="ml-auto flex flex-wrap gap-1">
            {deadPlayers.map((p) => (
              <PlayerBadge
                key={p.id}
                player={p}
                humanPlayerId={humanPlayerId}
                dreamMasterId={dreamMasterId}
                currentPlayerId={currentPlayerId}
                dim
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LayerRow({
  layer,
  players,
  humanPlayerId,
  dreamMasterId,
  currentPlayerId,
  onCardPreview,
}: {
  layer: LayerView;
  players: Record<string, PlayerView>;
  humanPlayerId: string;
  dreamMasterId: string;
  currentPlayerId: string;
  onCardPreview?: (cardId: string) => void;
}) {
  const occupants = layer.playerIds.map((id) => players[id]).filter((p): p is PlayerView => !!p);

  return (
    <div
      className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs"
      data-testid={`layer-${layer.layer}`}
    >
      <div className="flex w-10 items-center justify-center rounded bg-primary/10 px-1.5 py-0.5 font-mono text-sm font-bold text-primary">
        L{layer.layer}
      </div>
      <div className="flex items-center gap-1 text-muted-foreground">
        <Heart className="h-3 w-3 text-rose-400" />
        <span>{layer.heartLockValue}</span>
      </div>
      {/* 未开金库：卡背缩略图（叠加数量徽标） */}
      {layer.vaultCount > 0 && (
        <CardThumb
          cardId="vault_back"
          title={`未打开金库 ×${layer.vaultCount}`}
          badge={layer.vaultCount > 1 ? String(layer.vaultCount) : undefined}
          onClick={onCardPreview ? () => onCardPreview('vault_back') : undefined}
        />
      )}
      {/* 已开金库：按内容显示真实卡图（秘密/金币）或空占位 */}
      {layer.openedVaults.map((v, i) => {
        const cardId =
          v.contentType === 'secret'
            ? 'vault_secret'
            : v.contentType === 'coin'
              ? 'vault_gold'
              : null;
        return (
          <CardThumb
            key={`opened-${i}`}
            cardId={cardId}
            title={
              v.contentType === 'secret' ? '秘密' : v.contentType === 'coin' ? '金币' : '空金库'
            }
            emptyLabel={v.contentType === 'empty' ? '空' : undefined}
            onClick={onCardPreview && cardId ? () => onCardPreview(cardId) : undefined}
          />
        );
      })}
      {/* 已翻梦魇：真实梦魇卡图 */}
      {layer.nightmareRevealed && layer.nightmareCardId && (
        <CardThumb
          cardId={layer.nightmareCardId}
          title="梦魇（已翻开）"
          highlight="destructive"
          onClick={onCardPreview ? () => onCardPreview(layer.nightmareCardId!) : undefined}
        />
      )}
      <div className="ml-auto flex flex-wrap gap-1">
        {occupants.map((p) => (
          <PlayerBadge
            key={p.id}
            player={p}
            humanPlayerId={humanPlayerId}
            dreamMasterId={dreamMasterId}
            currentPlayerId={currentPlayerId}
          />
        ))}
      </div>
    </div>
  );
}

/** 金库/梦魇在 LayerMap 内的紧凑缩略图 · 点击触发预览 */
function CardThumb({
  cardId,
  title,
  badge,
  emptyLabel,
  highlight,
  onClick,
}: {
  cardId: string | null;
  title: string;
  badge?: string;
  emptyLabel?: string;
  highlight?: 'destructive';
  onClick?: () => void;
}) {
  const imgUrl = cardId ? getCardImageUrl(cardId) : undefined;
  const content = emptyLabel ? (
    <span className="flex h-full w-full items-center justify-center text-[9px] text-muted-foreground">
      {emptyLabel}
    </span>
  ) : imgUrl ? (
    <img
      src={imgUrl}
      alt={title}
      loading="lazy"
      className="h-full w-full object-cover"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = 'none';
      }}
    />
  ) : (
    <span className="flex h-full w-full items-center justify-center text-[9px] text-muted-foreground">
      ?
    </span>
  );

  const className = cn(
    'relative h-10 w-[28px] flex-shrink-0 overflow-hidden rounded-sm border transition-transform',
    highlight === 'destructive' ? 'border-destructive/60' : 'border-border',
    onClick && 'cursor-pointer hover:scale-110 hover:border-primary/60',
  );

  const inner = (
    <>
      {content}
      {badge && (
        <span className="absolute right-0 top-0 rounded-bl bg-primary px-1 text-[9px] font-bold text-primary-foreground">
          {badge}
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={className}
        title={title}
        aria-label={title}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className={className} title={title}>
      {inner}
    </div>
  );
}

function PlayerBadge({
  player,
  humanPlayerId,
  dreamMasterId,
  currentPlayerId,
  dim = false,
}: {
  player: PlayerView;
  humanPlayerId: string;
  dreamMasterId: string;
  currentPlayerId: string;
  dim?: boolean;
}) {
  const isHuman = player.id === humanPlayerId;
  const isMaster = player.id === dreamMasterId;
  const isCurrent = player.id === currentPlayerId;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]',
        isCurrent ? 'border-primary bg-primary/20 text-primary' : 'border-border bg-muted',
        isHuman && !isCurrent && 'ring-1 ring-primary/40',
        dim && 'opacity-60',
      )}
    >
      {isMaster ? (
        <Crown className="h-2.5 w-2.5 text-amber-400" />
      ) : (
        <User className="h-2.5 w-2.5" />
      )}
      {isHuman ? '你' : `AI ${player.id}`}
    </span>
  );
}
