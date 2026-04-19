// Lobby · 好友房入口
// 对照：plans/design/07-backend-network.md §7.3.2.3 /rooms REST
// 首次访问若没有 identity，先走 initIdentity；之后显示创建/加入入口。

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, DoorOpen, Plus } from 'lucide-react';
import { api, ApiRequestError } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';

interface CreateRoomResponse {
  id: string;
  code: string;
  ownerPlayerId: string;
  maxPlayers: number;
  currentPlayers: number;
  status: 'waiting' | 'playing' | 'finished';
}

export default function Lobby() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, isInitialized, initIdentity, nickname } = useAuth();

  // 昵称初始化
  const [inputNickname, setInputNickname] = useState('');
  // 创建房间参数
  const [maxPlayers, setMaxPlayers] = useState(6);
  // 加入房间
  const [joinCode, setJoinCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInitIdentity = useCallback(async () => {
    const name = inputNickname.trim();
    if (name.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      await initIdentity(name);
    } catch (e) {
      const msg = e instanceof ApiRequestError ? e.message : String(e);
      setError(t('lobby.errorGeneric', { message: msg }));
    } finally {
      setLoading(false);
    }
  }, [inputNickname, initIdentity, t]);

  const handleCreateRoom = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<CreateRoomResponse>('/rooms', { maxPlayers });
      navigate(`/room/${res.code}`);
    } catch (e) {
      const msg = e instanceof ApiRequestError ? e.message : String(e);
      setError(t('lobby.errorGeneric', { message: msg }));
    } finally {
      setLoading(false);
    }
  }, [maxPlayers, navigate, t]);

  const handleJoinRoom = useCallback(async () => {
    const code = joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setError(t('lobby.codeInvalid'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 后端 :id 实际是 code（参见 api/rooms.ts）
      await api.post(`/rooms/${code}/join`);
      navigate(`/room/${code}`);
    } catch (e) {
      const msg = e instanceof ApiRequestError ? e.message : String(e);
      setError(t('lobby.errorGeneric', { message: msg }));
    } finally {
      setLoading(false);
    }
  }, [joinCode, navigate, t]);

  if (!isInitialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary text-text-secondary">
        {t('lobby.loading')}
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 bg-bg-primary p-6 text-white">
        <h1 className="text-2xl font-bold">{t('lobby.title')}</h1>
        <label className="block text-sm text-gray-300" htmlFor="lobby-nickname">
          {t('lobby.nicknameLabel')}
        </label>
        <input
          id="lobby-nickname"
          type="text"
          className="rounded-md border border-white/20 bg-bg-secondary px-3 py-2 text-white"
          placeholder={t('lobby.nicknamePlaceholder')}
          value={inputNickname}
          onChange={(e) => setInputNickname(e.target.value)}
          maxLength={12}
          autoFocus
        />
        {error && (
          <div className="text-sm text-red-400" role="alert">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={handleInitIdentity}
          disabled={loading || inputNickname.trim().length < 2}
          className="flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 font-bold text-white disabled:opacity-50"
        >
          {t('lobby.continue')}
          <ArrowRight size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 bg-bg-primary p-6 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('lobby.title')}</h1>
        <span className="text-sm text-gray-400" data-testid="lobby-nickname">
          {nickname}
        </span>
      </div>

      <section className="rounded-lg border border-white/10 bg-bg-secondary p-4">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <Plus size={18} />
          {t('lobby.createRoom')}
        </h2>
        <label className="mb-2 block text-sm text-gray-300" htmlFor="lobby-maxPlayers">
          {t('lobby.maxPlayers')}
        </label>
        <select
          id="lobby-maxPlayers"
          className="mb-3 w-full rounded-md border border-white/20 bg-bg-primary px-3 py-2 text-white"
          value={maxPlayers}
          onChange={(e) => setMaxPlayers(Number(e.target.value))}
        >
          {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleCreateRoom}
          disabled={loading}
          className="w-full rounded-md bg-accent px-4 py-2 font-bold text-white disabled:opacity-50"
          data-testid="lobby-create"
        >
          {t('lobby.createRoom')}
        </button>
      </section>

      <section className="rounded-lg border border-white/10 bg-bg-secondary p-4">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <DoorOpen size={18} />
          {t('lobby.joinRoom')}
        </h2>
        <label className="mb-2 block text-sm text-gray-300" htmlFor="lobby-joinCode">
          {t('lobby.codeHint')}
        </label>
        <input
          id="lobby-joinCode"
          type="text"
          className="mb-3 w-full rounded-md border border-white/20 bg-bg-primary px-3 py-2 font-mono text-lg uppercase tracking-widest text-white"
          placeholder="ABC123"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          maxLength={6}
        />
        <button
          type="button"
          onClick={handleJoinRoom}
          disabled={loading || joinCode.length !== 6}
          className="w-full rounded-md border border-white/20 px-4 py-2 font-bold text-white disabled:opacity-50"
          data-testid="lobby-join"
        >
          {t('lobby.joinRoom')}
        </button>
      </section>

      {error && (
        <div className="rounded-md bg-red-500/20 p-3 text-sm text-red-200" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
