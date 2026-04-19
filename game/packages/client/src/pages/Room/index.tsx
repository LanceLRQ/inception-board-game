// Room · 房间等待页
// 对照：plans/design/07-backend-network.md §7.3.2.3 /rooms REST
// 房主：可补 AI、开始游戏；非房主：等待开始；轮询每 3s 刷新房间状态。

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bot, Copy, LogOut, Play, Users } from 'lucide-react';
import { ApiRequestError } from '../../lib/api';
import { roomApi, type RoomState } from '../../lib/roomApi';
import { useAuth } from '../../hooks/useAuth';
import { useIdentityStore } from '../../stores/useIdentityStore';

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

  // 房间详情靠轮询（下一轮接入 WS 后切推送）
  const fetchRoom = useCallback(async () => {
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
      const msg = e instanceof ApiRequestError ? e.message : String(e);
      setError(msg);
    }
  }, [code, playerId, nickname, avatarSeed]);

  useEffect(() => {
    if (!isInitialized || !isAuthenticated || !code) return;
    // 轮询外部（服务端）房间状态；setState 由 fetchRoom 内部触发是合理模式
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchRoom();
    const timer = setInterval(() => void fetchRoom(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isInitialized, isAuthenticated, code, fetchRoom]);

  // status 变为 playing 时自动跳 Game
  useEffect(() => {
    if (room?.status === 'playing') {
      navigate(`/game/${room.id}`);
    }
  }, [room?.status, room?.id, navigate]);

  const isOwner = !!room && !!playerId && room.ownerPlayerId === playerId;
  const canStart = !!room && room.players.length >= MIN_PLAYERS;

  const handleFillAI = useCallback(async () => {
    if (!code) return;
    setBusy(true);
    try {
      const next = await roomApi.fillAI(code);
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
      const params = new URLSearchParams({
        friend: '1',
        players: String(room.players.length),
        code: room.code,
      });
      navigate(`/game/${res.matchId}?${params.toString()}`);
    } catch (e) {
      const msg = e instanceof ApiRequestError ? e.message : String(e);
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
      <div className="flex min-h-screen items-center justify-center bg-bg-primary text-text-secondary">
        {t('common.loading')}
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg-primary p-6 text-white">
        <div className="mb-4 text-text-secondary">{t('common.loading')}</div>
        {error && <div className="text-red-400">{error}</div>}
      </div>
    );
  }

  const emptySeats = Math.max(0, room.maxPlayers - room.players.length);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-bg-primary p-6 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('room.title', { code: room.code })}</h1>
        <button
          type="button"
          onClick={handleLeave}
          className="flex items-center gap-1 rounded-md border border-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/10"
          data-testid="room-leave"
        >
          <LogOut size={14} />
          {t('room.leave')}
        </button>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        className="flex items-center justify-center gap-2 rounded-md border border-white/20 bg-bg-secondary px-4 py-3 font-mono text-2xl uppercase tracking-widest hover:bg-white/10"
        data-testid="room-copy"
      >
        {room.code}
        <Copy size={18} />
        {copied && <span className="ml-2 text-sm text-green-400">{t('room.copied')}</span>}
      </button>

      <div className="flex items-center gap-2 text-sm text-gray-300">
        <Users size={16} />
        <span data-testid="room-count">
          {t('room.currentPlayers', { current: room.players.length, max: room.maxPlayers })}
        </span>
      </div>

      <ul className="flex flex-col gap-2" data-testid="room-players">
        {room.players.map((p) => (
          <li
            key={p.playerId}
            className="flex items-center justify-between rounded-md border border-white/10 bg-bg-secondary px-3 py-2"
          >
            <div className="flex items-center gap-2">
              {p.isBot && <Bot size={14} className="text-primary" />}
              <span>{p.nickname}</span>
              {p.playerId === playerId && (
                <span className="rounded bg-accent/30 px-1.5 py-0.5 text-xs">{t('room.you')}</span>
              )}
              {p.playerId === room.ownerPlayerId && (
                <span className="rounded bg-primary/30 px-1.5 py-0.5 text-xs">
                  {t('room.owner')}
                </span>
              )}
            </div>
            <span className="text-xs text-gray-400">{t('room.seat', { n: p.seat + 1 })}</span>
          </li>
        ))}
        {Array.from({ length: emptySeats }).map((_, i) => (
          <li
            key={`empty-${i}`}
            className="rounded-md border border-dashed border-white/10 px-3 py-2 text-center text-xs text-gray-500"
          >
            {t('room.empty')}
          </li>
        ))}
      </ul>

      {isOwner ? (
        <div className="flex flex-col gap-2">
          {emptySeats > 0 && (
            <button
              type="button"
              onClick={handleFillAI}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-md border border-primary/50 bg-primary/20 px-4 py-2 font-bold text-white disabled:opacity-50"
              data-testid="room-fill-ai"
            >
              <Bot size={16} />
              {t('room.fillAi')}
            </button>
          )}
          <button
            type="button"
            onClick={handleStart}
            disabled={busy || !canStart}
            className="flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-3 font-bold text-white disabled:opacity-50"
            data-testid="room-start"
          >
            <Play size={16} />
            {t('room.start')}
          </button>
          {!canStart && (
            <p className="text-center text-xs text-gray-400">
              {t('room.needPlayers', { n: MIN_PLAYERS })}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-white/10 p-3 text-center text-sm text-gray-300">
          {t('room.notOwner')}
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-500/20 p-3 text-sm text-red-200" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
