// Lobby · 好友房入口
// 首次访问若没有 identity，先走 initIdentity；之后显示创建/加入入口。

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, DoorOpen, KeyRound, Plus, RotateCcw } from 'lucide-react';
import { ApiRequestError } from '../../lib/api';
import { roomApi } from '../../lib/roomApi';
import { logger } from '../../lib/logger';
import { readOnlineMatch } from '../../lib/onlineMatchMemo';
import { useAuth } from '../../hooks/useAuth';
import { useIdentityStore } from '../../stores/useIdentityStore';
import {
  RecoveryCodeDialog,
  type RecoveryCodeDialogKind,
} from '../../components/RecoveryCodeDialog';
import {
  formatRecoveryCodeInput,
  isRecoveryCodeComplete,
  recoverErrorKey,
} from '../../lib/recoveryCode';

/** 待展示的恢复码；只存在于本页组件状态里，确认后即丢弃 */
interface PendingRecoveryCode {
  code: string;
  warning: string;
  kind: RecoveryCodeDialogKind;
}

export default function Lobby() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, isInitialized, initIdentity, recoverIdentity, nickname, playerId } =
    useAuth();
  const avatarSeed = useIdentityStore((s) => s.avatarSeed);

  // 昵称初始化
  const [inputNickname, setInputNickname] = useState('');
  // 创建房间参数
  const [maxPlayers, setMaxPlayers] = useState(6);
  // 加入房间
  const [joinCode, setJoinCode] = useState('');

  // 进行中的联机对局（刷新或误退后可回去）
  const [resumable] = useState(() => readOnlineMatch());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 恢复码弹窗与恢复入口
  const [pendingCode, setPendingCode] = useState<PendingRecoveryCode | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreInput, setRestoreInput] = useState('');
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const handleInitIdentity = useCallback(async () => {
    const name = inputNickname.trim();
    if (name.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const res = await initIdentity(name);
      // 离线模拟身份没有真实恢复码，recoveryCode 为 null 时不弹
      if (res.recoveryCode) {
        setPendingCode({ code: res.recoveryCode, warning: res.warning, kind: 'created' });
      }
    } catch (e) {
      const msg = e instanceof ApiRequestError ? e.message : String(e);
      setError(t('lobby.errorGeneric', { message: msg }));
    } finally {
      setLoading(false);
    }
  }, [inputNickname, initIdentity, t]);

  const handleRestore = useCallback(async () => {
    if (!isRecoveryCodeComplete(restoreInput)) return;
    setLoading(true);
    setRestoreError(null);
    try {
      const res = await recoverIdentity(restoreInput);
      if (res.recoveryCode) {
        setPendingCode({ code: res.recoveryCode, warning: res.warning, kind: 'recovered' });
      }
      setRestoreInput('');
    } catch (e) {
      setRestoreError(t(recoverErrorKey(e)));
    } finally {
      setLoading(false);
    }
  }, [restoreInput, recoverIdentity, t]);

  const handleCreateRoom = useCallback(async () => {
    if (!playerId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await roomApi.createRoom(
        { playerId, nickname, avatarSeed: String(avatarSeed) },
        { maxPlayers },
      );
      logger.flow('lobby', 'createRoom ok', { code: res.code, maxPlayers });
      navigate(`/room/${res.code}`);
    } catch (e) {
      const msg = e instanceof ApiRequestError ? e.message : String(e);
      logger.error('lobby', 'createRoom failed', e);
      setError(t('lobby.errorGeneric', { message: msg }));
    } finally {
      setLoading(false);
    }
  }, [playerId, nickname, avatarSeed, maxPlayers, navigate, t]);

  const handleJoinRoom = useCallback(async () => {
    const code = joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setError(t('lobby.codeInvalid'));
      return;
    }
    if (!playerId) return;
    setLoading(true);
    setError(null);
    try {
      await roomApi.joinRoom(code, { playerId, nickname, avatarSeed: String(avatarSeed) });
      logger.flow('lobby', 'joinRoom ok', { code });
      navigate(`/room/${code}`);
    } catch (e) {
      const msg = e instanceof ApiRequestError ? e.message : String(e);
      logger.warn('lobby', 'joinRoom failed', e);
      setError(t('lobby.errorGeneric', { message: msg }));
    } finally {
      setLoading(false);
    }
  }, [joinCode, playerId, nickname, avatarSeed, navigate, t]);

  const handleResume = useCallback(() => {
    if (!resumable) return;
    logger.flow('lobby', 'resume online match', { matchID: resumable.matchID });
    const params = new URLSearchParams({ online: '1' });
    if (resumable.code) params.set('code', resumable.code);
    navigate(`/game/${resumable.matchID}?${params.toString()}`);
  }, [resumable, navigate]);

  if (!isInitialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary text-text-secondary">
        {t('lobby.loading')}
      </div>
    );
  }

  const recoveryDialog = pendingCode && (
    <RecoveryCodeDialog
      open
      code={pendingCode.code}
      warning={pendingCode.warning}
      kind={pendingCode.kind}
      onConfirm={() => setPendingCode(null)}
    />
  );

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

        <div className="mt-4 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={() => setRestoreOpen((v) => !v)}
            aria-expanded={restoreOpen}
            className="flex items-center gap-2 text-sm text-gray-300 underline-offset-4 hover:underline"
            data-testid="lobby-restore-toggle"
          >
            <KeyRound size={14} />
            {t('recovery.restore.entry')}
          </button>
          {restoreOpen && (
            <div className="mt-3 flex flex-col gap-2">
              <label className="text-sm text-gray-300" htmlFor="lobby-restore-code">
                {t('recovery.restore.label')}
              </label>
              <input
                id="lobby-restore-code"
                type="text"
                className="rounded-md border border-white/20 bg-bg-secondary px-3 py-2 font-mono text-lg uppercase tracking-widest text-white"
                placeholder={t('recovery.restore.placeholder')}
                value={restoreInput}
                onChange={(e) => setRestoreInput(formatRecoveryCodeInput(e.target.value))}
                maxLength={9}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                data-testid="lobby-restore-input"
              />
              <p className="text-xs text-gray-400">{t('recovery.restore.hint')}</p>
              {restoreError && (
                <div
                  className="text-sm text-red-400"
                  role="alert"
                  data-testid="lobby-restore-error"
                >
                  {restoreError}
                </div>
              )}
              <button
                type="button"
                onClick={handleRestore}
                disabled={loading || !isRecoveryCodeComplete(restoreInput)}
                className="rounded-md border border-white/20 px-4 py-2 font-bold text-white disabled:opacity-50"
                data-testid="lobby-restore-submit"
              >
                {t('recovery.restore.submit')}
              </button>
            </div>
          )}
        </div>
        {recoveryDialog}
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

      {resumable && (
        <button
          type="button"
          onClick={handleResume}
          className="flex items-center justify-center gap-2 rounded-md border border-primary/50 bg-primary/20 px-4 py-3 font-bold text-white"
          data-testid="resume-online-match"
        >
          <RotateCcw size={16} />
          {t('lobby.resume_match', { defaultValue: '回到对局' })}
        </button>
      )}

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
      {recoveryDialog}
    </div>
  );
}
