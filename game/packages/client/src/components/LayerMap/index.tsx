// 梦境层可视化
// 展示 L1-L4 + 迷失层 L0（死亡玩家），每层内显示心锁值、金库、玩家列表
// 人类玩家高亮，梦主徽标，死亡玩家在迷失层
//
// 对照：plans/design/02-game-rules-spec.md §2.3 梦境层

import { useTranslation } from 'react-i18next';
import { Coins, Crown, Gem, Heart, Lock, Skull, Unlock, User } from 'lucide-react';
import { cn } from '../../lib/utils';

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
  playerIds: string[];
}

export interface LayerMapProps {
  readonly layers: LayerView[];
  readonly players: Record<string, PlayerView>;
  readonly humanPlayerId: string;
  readonly dreamMasterId: string;
  readonly currentPlayerId: string;
}

export function LayerMap({
  layers,
  players,
  humanPlayerId,
  dreamMasterId,
  currentPlayerId,
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
}: {
  layer: LayerView;
  players: Record<string, PlayerView>;
  humanPlayerId: string;
  dreamMasterId: string;
  currentPlayerId: string;
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
      {layer.vaultCount > 0 && (
        <div className="flex items-center gap-1 text-muted-foreground" title="未打开金库数">
          <Lock className="h-3 w-3 text-amber-400" />
          <span>{layer.vaultCount}</span>
        </div>
      )}
      {layer.openedVaults.map((v, i) => (
        <span
          key={`opened-${i}`}
          className={cn(
            'inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px]',
            v.contentType === 'secret' && 'bg-rose-500/20 text-rose-300',
            v.contentType === 'coin' && 'bg-yellow-500/20 text-yellow-300',
            v.contentType === 'empty' && 'bg-muted text-muted-foreground',
          )}
          title={v.contentType === 'secret' ? '秘密' : v.contentType === 'coin' ? '金币' : '空'}
        >
          <Unlock className="h-2.5 w-2.5" />
          {v.contentType === 'secret' && <Gem className="h-2.5 w-2.5" />}
          {v.contentType === 'coin' && <Coins className="h-2.5 w-2.5" />}
        </span>
      ))}
      {layer.nightmareRevealed && (
        <span className="rounded bg-destructive/20 px-1.5 py-0.5 text-[10px] text-destructive">
          梦魇
        </span>
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
