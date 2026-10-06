// Room · 房间等待页
// 房主：可补 AI、开始游戏；非房主：等待开始。
// 房间变化由服务端推送（见 useRoomSync），推送不可用时退回低频轮询。
// 开始后：真实后端 → 全体进入同一局联机对局；本地模拟 → 本地人机对局。

import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, LogOut, Play, Users } from 'lucide-react';
import { MATCH_MIN_PLAYERS } from '@icgame/shared';
import { isMockMode, roomApi } from '../../lib/roomApi';
import { joinOrAttach, requestErrorMessage, roomKeys } from '../../lib/roomQueries';
import { logger } from '../../lib/logger';
import { useAuth } from '../../hooks/useAuth';
import { useAvatar } from '../../hooks/useAvatar';
import { PixelAvatar } from '../../components/PixelAvatar';
import { RoomCodeShare } from '../../components/RoomCodeShare';
import { isRoomMember, resolveGameRedirect, roomPlayerAvatarSeed, startGate } from './roomLogic';
import { useRoomSync } from './useRoomSync';
import { Button } from '@/components/ui/button';

export default function Room() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { code: rawCode } = useParams<{ code: string }>();
  const code = (rawCode ?? '').toUpperCase();
  const { isAuthenticated, isInitialized, playerId, nickname } = useAuth();
  const { seed: avatarSeed } = useAvatar();

  // 进入页面时加入一次房间（已在房间里的人刷新页面时按已加入处理）；加入成功后房间数据写进查询缓存
  const join = useMutation({
    mutationKey: ['room', 'join', code],
    mutationFn: () =>
      joinOrAttach(code, {
        playerId: playerId ?? '',
        nickname,
        avatarSeed,
      }),
    onSuccess: (next) => {
      logger.flow('room', 'joined', { code, players: next.players.length });
      queryClient.setQueryData(roomKeys.detail(code), next);
    },
  });
  const { mutate: joinMutate } = join;
  const joinedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!isInitialized || !isAuthenticated || !code || !playerId) return;
    // 同一个房间只加入一次（严格模式下 effect 会跑两遍）
    if (joinedFor.current === code) return;
    joinedFor.current = code;
    joinMutate();
  }, [isInitialized, isAuthenticated, code, playerId, joinMutate]);

  const sync = useRoomSync({
    code,
    enabled: join.isSuccess,
    onRemoved: () => navigate('/lobby', { replace: true }),
  });
  const room = sync.room;

  // 曾经在成员里、后来不在了（被移出）：回大厅
  const wasMember = useRef(false);
  useEffect(() => {
    if (!room) return;
    if (isRoomMember(room, playerId)) {
      wasMember.current = true;
    } else if (wasMember.current) {
      logger.flow('room', 'no longer a member, back to lobby', { code });
      navigate('/lobby', { replace: true });
    }
  }, [room, playerId, code, navigate]);

  // status 变为 playing 时跳 Game：真实后端进入联机对局，本地模拟保持原行为
  useEffect(() => {
    const target = resolveGameRedirect(room, playerId, isMockMode());
    if (target) navigate(target, { replace: true });
  }, [room, playerId, navigate]);

  const isOwner = !!room && !!playerId && room.ownerPlayerId === playerId;
  const { canStart, missing: missingPlayers } = startGate(room);

  const fillAi = useMutation({
    mutationKey: ['room', 'fillAi', code],
    mutationFn: () => roomApi.fillAI(code),
    onSuccess: (next) => {
      logger.flow('room', 'fillAI ok', { code, players: next.players.length });
      queryClient.setQueryData(roomKeys.detail(code), next);
    },
  });

  const start = useMutation({
    mutationKey: ['room', 'start', code],
    mutationFn: () => roomApi.startGame(code),
    onSuccess: (res) => {
      if (!room) return;
      logger.flow('room', 'startGame ok', {
        matchId: res.matchId,
        online: res.online,
        players: room.players.length,
      });
      const params = res.online
        ? new URLSearchParams({ online: '1', code: room.code })
        : new URLSearchParams({
            friend: '1',
            players: String(room.players.length),
            code: room.code,
          });
      navigate(`/game/${res.matchId}?${params.toString()}`, { replace: true });
    },
  });

  const leave = useMutation({
    mutationKey: ['room', 'leave', code],
    mutationFn: () => roomApi.leaveRoom(code, playerId ?? ''),
    onSettled: () => {
      logger.flow('room', 'leave', { code });
      queryClient.removeQueries({ queryKey: roomKeys.detail(code) });
      navigate('/lobby');
    },
  });

  const busy = fillAi.isPending || start.isPending;
  const failure = join.error ?? fillAi.error ?? start.error ?? sync.error;
  const error = failure ? requestErrorMessage(failure) : null;

  // 未认证时跳回 Lobby（放到 effect 里避免渲染中 setState 警告）
  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      navigate('/lobby', { replace: true });
    }
  }, [isInitialized, isAuthenticated, navigate]);

  if (!isInitialized || !isAuthenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-dim">
        {t('common.loading')}
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background p-6 text-foreground">
        <div className="mb-4 text-dim">{t('common.loading')}</div>
        {error && <div className="text-destructive">{error}</div>}
      </div>
    );
  }

  const emptySeats = Math.max(0, room.maxPlayers - room.players.length);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background p-6 text-foreground">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('room.title', { code: room.code })}</h1>
        <Button
          type="button"
          variant="outline"
          onClick={() => leave.mutate()}
          disabled={leave.isPending}
          className="h-8 border-line-strong px-3"
          data-testid="room-leave"
        >
          <LogOut size={14} />
          {t('room.leave')}
        </Button>
      </div>

      <RoomCodeShare code={room.code} />

      <div className="flex items-center gap-2 text-sm text-dim">
        <Users size={16} />
        <span data-testid="room-count">
          {t('room.currentPlayers', { current: room.players.length, max: room.maxPlayers })}
        </span>
      </div>

      <ul className="flex flex-col gap-2" data-testid="room-players">
        {room.players.map((p) => (
          <li
            key={p.playerId}
            className="flex items-center justify-between rounded-md border border-line bg-panel px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <PixelAvatar seed={roomPlayerAvatarSeed(p)} size={28} />
              {p.isBot && <Bot size={14} className="text-primary" />}
              <span className="truncate" data-testid={`room-player-${p.seat}`}>
                {p.nickname}
              </span>
              {p.playerId === playerId && (
                <span className="rounded bg-panel-2 px-1.5 py-0.5 text-xs text-foreground">
                  {t('room.you')}
                </span>
              )}
              {p.playerId === room.ownerPlayerId && (
                <span className="rounded bg-primary/30 px-1.5 py-0.5 text-xs">
                  {t('room.owner')}
                </span>
              )}
            </div>
            <span className="text-xs text-dim">{t('room.seat', { n: p.seat + 1 })}</span>
          </li>
        ))}
        {Array.from({ length: emptySeats }).map((_, i) => (
          <li
            key={`empty-${i}`}
            className="rounded-md border border-dashed border-line px-3 py-2 text-center text-xs text-faint"
          >
            {t('room.empty')}
          </li>
        ))}
      </ul>

      {isOwner ? (
        <div className="flex flex-col gap-2">
          {emptySeats > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => fillAi.mutate()}
              disabled={busy}
              className="h-10 gap-2 border-primary/50 bg-primary/20 px-4 font-bold text-foreground hover:bg-primary/30"
              data-testid="room-fill-ai"
            >
              <Bot size={16} />
              {t('room.fillAi')}
            </Button>
          )}
          <Button
            type="button"
            onClick={() => start.mutate()}
            disabled={busy || !canStart}
            className="h-11 gap-2 px-4 font-bold"
            data-testid="room-start"
          >
            <Play size={16} />
            {t('room.start')}
          </Button>
          {!canStart && (
            <p className="text-center text-xs text-dim" data-testid="room-need-players">
              {t('room.needPlayers', { n: missingPlayers, min: MATCH_MIN_PLAYERS })}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-line p-3 text-center text-sm text-dim">
          {t('room.notOwner')}
        </div>
      )}

      {error && (
        <div className="rounded-md bg-blood/20 p-3 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
