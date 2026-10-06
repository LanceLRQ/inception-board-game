// Room · 房间等待页
// 房主：可补 AI、开始游戏；非房主：等待开始；轮询每 3s 刷新房间状态。
// 开始后：真实后端 → 全体进入同一局联机对局；本地模拟 → 本地人机对局。

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Bot, Copy, LogOut, Play, Users } from 'lucide-react';
import { ApiRequestError } from '../../lib/api';
import { isMockMode, roomApi, type RoomState } from '../../lib/roomApi';
import { logger } from '../../lib/logger';
import { useAuth } from '../../hooks/useAuth';
import { useIdentityStore } from '../../stores/useIdentityStore';
import { isRoomMember, resolveGameRedirect } from './roomLogic';
import { Button } from '@/components/ui/button';

const POLL_INTERVAL_MS = 3_000;
const MIN_PLAYERS = 3;

export default function Room() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const { isAuthenticated, isInitialized, playerId, nickname } = useAuth();
  const avatarSeed = useIdentityStore((s) => s.avatarSeed);

  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  // 进入页面时加入一次房间。已在房间里的人刷新页面可能因「游戏已开始」等原因加入失败，
  // 此时若查得到房间且本人在成员里，就按已加入处理。
  const joinRoom = useCallback(async () => {
    if (!code || !playerId) return;
    try {
      const next = await roomApi.joinRoom(code, {
        playerId,
        nickname,
        avatarSeed: String(avatarSeed),
      });
      setRoom(next);
      setError(null);
    } catch (e) {
      try {
        const existing = await roomApi.getRoom(code);
        if (existing.players.some((p) => p.playerId === playerId)) {
          setRoom(existing);
          setError(null);
          return;
        }
      } catch {
        /* 查询也失败时报告加入时的错误 */
      }
      const msg = e instanceof ApiRequestError ? e.message : String(e);
      setError(msg);
    }
  }, [code, playerId, nickname, avatarSeed]);

  // 房间详情靠轮询（只读查询，不再借加入接口刷新）
  const pollRoom = useCallback(async () => {
    if (!code) return;
    try {
      const next = await roomApi.getRoom(code);
      // 只读查询对任何登录用户都成功；本人不在成员里说明没加入成功，保留加入时的错误
      if (!isRoomMember(next, playerId)) return;
      setRoom(next);
      setError(null);
    } catch (e) {
      // 轮询失败只显示错误，保留已有的房间信息；下一次轮询成功后自动恢复
      const msg = e instanceof ApiRequestError ? e.message : String(e);
      setError(msg);
    }
  }, [code, playerId]);

  useEffect(() => {
    if (!isInitialized || !isAuthenticated || !code) return;
    // 轮询外部（服务端）房间状态；setState 由回调内部触发是合理模式
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void joinRoom();
    const timer = setInterval(() => void pollRoom(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isInitialized, isAuthenticated, code, joinRoom, pollRoom]);

  // status 变为 playing 时跳 Game：真实后端进入联机对局，本地模拟保持原行为
  useEffect(() => {
    const target = resolveGameRedirect(room, playerId, isMockMode());
    if (target) navigate(target, { replace: true });
  }, [room, playerId, navigate]);

  const isOwner = !!room && !!playerId && room.ownerPlayerId === playerId;
  const canStart = !!room && room.players.length >= MIN_PLAYERS;

  const handleFillAI = useCallback(async () => {
    if (!code) return;
    setBusy(true);
    try {
      const next = await roomApi.fillAI(code);
      logger.flow('room', 'fillAI ok', { code, players: next.players.length });
      setRoom(next);
    } catch (e) {
      const msg = e instanceof ApiRequestError ? e.message : String(e);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }, [code]);

  const handleStart = useCallback(async () => {
    if (!code || !room) return;
    setBusy(true);
    try {
      const res = await roomApi.startGame(code);
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
    } catch (e) {
      const msg = e instanceof ApiRequestError ? e.message : String(e);
      logger.error('room', 'startGame failed', e);
      setError(msg);
      setBusy(false);
    }
  }, [code, navigate, room]);

  const handleLeave = useCallback(async () => {
    if (!code || !playerId) return;
    try {
      await roomApi.leaveRoom(code, playerId);
    } finally {
      navigate('/lobby');
    }
  }, [code, playerId, navigate]);

  const handleCopy = useCallback(async () => {
    if (!code) return;
    try {
      await navigator.clipboard?.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [code]);

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
          onClick={handleLeave}
          className="h-8 border-line-strong px-3"
          data-testid="room-leave"
        >
          <LogOut size={14} />
          {t('room.leave')}
        </Button>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        className="flex items-center justify-center gap-2 rounded-md border border-line-strong bg-panel px-4 py-3 font-mono text-2xl uppercase tracking-widest hover:bg-foreground/10"
        data-testid="room-copy"
      >
        {room.code}
        <Copy size={18} />
        {copied && <span className="ml-2 text-sm text-ok">{t('room.copied')}</span>}
      </button>

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
            <div className="flex items-center gap-2">
              {p.isBot && <Bot size={14} className="text-primary" />}
              <span>{p.nickname}</span>
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
              onClick={handleFillAI}
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
            onClick={handleStart}
            disabled={busy || !canStart}
            className="h-11 gap-2 px-4 font-bold"
            data-testid="room-start"
          >
            <Play size={16} />
            {t('room.start')}
          </Button>
          {!canStart && (
            <p className="text-center text-xs text-dim">
              {t('room.needPlayers', { n: MIN_PLAYERS })}
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
