// Lobby · 多人房间入口
// 首次访问若没有 identity，先走 initIdentity；之后显示创建/加入入口。

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ChevronDown, DoorOpen, KeyRound, Plus, RotateCcw } from 'lucide-react';
import {
  MATCH_MAX_PLAYERS,
  MATCH_MIN_PLAYERS,
  RECOVERY_CODE_FORMATTED_LENGTH,
} from '@icgame/shared';
import { ApiRequestError } from '../../lib/api';
import { isMockMode, roomApi } from '../../lib/roomApi';
import { identityApi, isOfflineIdentity } from '../../lib/identityApi';
import { useIdentityStore } from '../../stores/useIdentityStore';
import { requestErrorMessage } from '../../lib/roomQueries';
import { logger } from '../../lib/logger';
import { readOnlineMatch } from '../../lib/onlineMatchMemo';
import { useAuth } from '../../hooks/useAuth';
import { useAvatar } from '../../hooks/useAvatar';
import { PixelAvatar } from '../../components/PixelAvatar';
import { SitePage } from '../../components/SitePage';
import {
  RecoveryCodeDialog,
  type RecoveryCodeDialogKind,
} from '../../components/RecoveryCodeDialog';
import {
  formatRecoveryCodeInput,
  isRecoveryCodeComplete,
  recoverErrorKey,
} from '../../lib/recoveryCode';
import { Button } from '@/components/ui/button';
import { QuickMatch } from './QuickMatch';

/** 待展示的恢复码；只存在于本页组件状态里，确认后即丢弃 */
interface PendingRecoveryCode {
  code: string;
  warning: string;
  kind: RecoveryCodeDialogKind;
}

/** 建房可选的人数：与服务端、引擎共用的人数范围 */
const PLAYER_COUNT_OPTIONS = Array.from(
  { length: MATCH_MAX_PLAYERS - MATCH_MIN_PLAYERS + 1 },
  (_, i) => MATCH_MIN_PLAYERS + i,
);

export default function Lobby() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated, isInitialized, initIdentity, recoverIdentity, nickname, playerId } =
    useAuth();
  const { seed: avatarSeed } = useAvatar();

  // 昵称初始化
  const [inputNickname, setInputNickname] = useState('');
  // 创建房间参数
  const [maxPlayers, setMaxPlayers] = useState(6);
  const token = useIdentityStore((state) => state.token);
  const onlineLobby = isAuthenticated && !!token && !isOfflineIdentity(token) && !isMockMode();
  useEffect(() => {
    if (isInitialized && onlineLobby && token) void identityApi.registerFingerprint(token);
  }, [isInitialized, onlineLobby, token]);
  const [isPublic, setIsPublic] = useState(false);
  const [publicSize, setPublicSize] = useState<number | null>(null);
  const [matchmakingWaiting, setMatchmakingWaiting] = useState(false);
  const [seriesMode, setSeriesMode] = useState('unlimited');
  const [seriesLength, setSeriesLength] = useState(7);
  // 加入房间
  const [joinCode, setJoinCode] = useState('');
  const [joinCodeInvalid, setJoinCodeInvalid] = useState(false);

  // 进行中的联机对局（刷新或误退后可回去）
  const [resumable] = useState(() => readOnlineMatch());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 恢复码弹窗与恢复入口
  const [pendingCode, setPendingCode] = useState<PendingRecoveryCode | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreInput, setRestoreInput] = useState('');
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const publicRooms = useInfiniteQuery({
    queryKey: ['lobby', 'publicRooms', playerId, publicSize],
    queryFn: ({ pageParam, signal }) => roomApi.listPublicRooms(publicSize, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: onlineLobby,
    staleTime: 0,
  });

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

  // 建房与加入房间是写操作：用 mutation 承载，成功后进入房间页
  const createRoomMutation = useMutation({
    mutationKey: ['lobby', 'createRoom'],
    mutationFn: (size: number) =>
      roomApi.createRoom(
        { playerId: playerId ?? '', nickname, avatarSeed },
        {
          maxPlayers: size,
          ...(onlineLobby && isPublic && { isPublic: true }),
          seriesLength:
            seriesMode === 'unlimited'
              ? undefined
              : seriesMode === 'custom'
                ? seriesLength
                : Number(seriesMode),
        },
      ),
    onSuccess: (res, size) => {
      logger.flow('lobby', 'createRoom ok', { code: res.code, maxPlayers: size });
      navigate(`/room/${res.code}`);
    },
  });

  const joinRoomMutation = useMutation({
    mutationKey: ['lobby', 'joinRoom'],
    mutationFn: ({ roomCode, fromPublicList }: { roomCode: string; fromPublicList?: boolean }) =>
      fromPublicList
        ? roomApi.joinPublicRoom(roomCode)
        : roomApi.joinRoom(roomCode, { playerId: playerId ?? '', nickname, avatarSeed }),
    onSuccess: (_room, { roomCode }) => {
      logger.flow('lobby', 'joinRoom ok', { code: roomCode });
      navigate(`/room/${roomCode}`);
    },
    onError: (_error, { fromPublicList }) => {
      if (fromPublicList)
        void queryClient.invalidateQueries({ queryKey: ['lobby', 'publicRooms'] });
    },
  });

  const roomBusy = createRoomMutation.isPending || joinRoomMutation.isPending;
  const roomActionsDisabled = roomBusy || matchmakingWaiting;

  const handleCreateRoom = useCallback(() => {
    if (!playerId) return;
    createRoomMutation.mutate(maxPlayers);
  }, [playerId, maxPlayers, createRoomMutation]);

  const handleJoinRoom = () => {
    if (!playerId || roomActionsDisabled || loading || joinCode.length !== 6) return;
    const roomCode = joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
      setJoinCodeInvalid(true);
      return;
    }
    joinRoomMutation.mutate({ roomCode });
  };

  const handleResume = useCallback(() => {
    if (!resumable) return;
    logger.flow('lobby', 'resume online match', { matchID: resumable.matchID });
    const params = new URLSearchParams({ online: '1' });
    if (resumable.code) params.set('code', resumable.code);
    navigate(`/game/${resumable.matchID}?${params.toString()}`);
  }, [resumable, navigate]);

  if (!isInitialized) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-dim">
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
  const fingerprintNotice = !isMockMode() && (
    <p className="text-xs text-dim">{t('lobby.fingerprintNotice')}</p>
  );

  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 bg-background p-6 text-foreground">
        <h1 className="text-2xl font-bold">{t('lobby.title')}</h1>
        <label className="block text-sm text-dim" htmlFor="lobby-nickname">
          {t('lobby.nicknameLabel')}
        </label>
        <input
          id="lobby-nickname"
          type="text"
          className="min-h-11 rounded-md border border-line-strong bg-panel px-3 py-2 text-foreground"
          placeholder={t('lobby.nicknamePlaceholder')}
          value={inputNickname}
          onChange={(e) => setInputNickname(e.target.value)}
          maxLength={12}
          autoFocus
        />
        {error && (
          <div className="text-sm text-destructive" role="alert">
            {error}
          </div>
        )}
        <Button
          type="button"
          onClick={handleInitIdentity}
          disabled={loading || inputNickname.trim().length < 2}
          className="h-10 gap-2 px-4 font-bold"
        >
          {t('lobby.continue')}
          <ArrowRight size={16} />
        </Button>
        {fingerprintNotice}

        <div className="mt-4 border-t border-line pt-4">
          <Button
            type="button"
            variant="link"
            onClick={() => setRestoreOpen((v) => !v)}
            aria-expanded={restoreOpen}
            className="h-auto gap-2 p-0 text-sm text-dim"
            data-testid="lobby-restore-toggle"
          >
            <KeyRound size={14} />
            {t('recovery.restore.entry')}
          </Button>
          {restoreOpen && (
            <div className="mt-3 flex flex-col gap-2">
              <label className="text-sm text-dim" htmlFor="lobby-restore-code">
                {t('recovery.restore.label')}
              </label>
              <input
                id="lobby-restore-code"
                type="text"
                className="min-h-11 rounded-md border border-line-strong bg-panel px-3 py-2 font-mono text-lg uppercase tracking-widest text-foreground"
                placeholder={t('recovery.restore.placeholder')}
                value={restoreInput}
                onChange={(e) => setRestoreInput(formatRecoveryCodeInput(e.target.value))}
                maxLength={RECOVERY_CODE_FORMATTED_LENGTH}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                data-testid="lobby-restore-input"
              />
              <p className="text-xs text-dim">{t('recovery.restore.hint')}</p>
              {restoreError && (
                <div
                  className="text-sm text-destructive"
                  role="alert"
                  data-testid="lobby-restore-error"
                >
                  {restoreError}
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={handleRestore}
                disabled={loading || !isRecoveryCodeComplete(restoreInput)}
                className="h-10 border-line-strong px-4 font-bold"
                data-testid="lobby-restore-submit"
              >
                {t('recovery.restore.submit')}
              </Button>
            </div>
          )}
        </div>
        {recoveryDialog}
      </div>
    );
  }

  const publicJoin = joinRoomMutation.variables?.fromPublicList;
  const profilePath =
    playerId && token && !isOfflineIdentity(token)
      ? `/players/${encodeURIComponent(playerId)}`
      : null;
  const manualJoinError = joinCodeInvalid
    ? t('lobby.codeInvalid')
    : !publicJoin && joinRoomMutation.error
      ? t('lobby.errorGeneric', { message: requestErrorMessage(joinRoomMutation.error) })
      : null;

  return (
    <SitePage
      title={t('landing.multiplayer')}
      actions={
        <div className="flex min-w-0 flex-wrap items-center gap-x-3">
          <Link
            to={profilePath ?? '/settings'}
            state={{ returnTo: '/lobby' }}
            className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-md text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label={profilePath ? t('profile.openFor', { nickname }) : t('settings.title')}
          >
            <PixelAvatar seed={avatarSeed} size={28} />
            <span className="truncate" data-testid="lobby-nickname">
              {nickname}
            </span>
          </Link>
          {resumable && (
            <Button
              type="button"
              variant="outline"
              onClick={handleResume}
              className="min-h-11 gap-2"
              data-testid="resume-online-match"
            >
              <RotateCcw size={16} aria-hidden="true" />
              {t('lobby.resume_match', { defaultValue: '回到对局' })}
            </Button>
          )}
        </div>
      }
    >
      <div className="grid items-start gap-4 md:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <section className="rounded-lg border border-line bg-panel p-4">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <DoorOpen size={18} aria-hidden="true" />
              {t('lobby.joinRoom')}
            </h2>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleJoinRoom();
              }}
            >
              <label className="mb-2 block text-sm text-dim" htmlFor="lobby-joinCode">
                {t('lobby.codeHint')}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="lobby-joinCode"
                  type="text"
                  className="min-h-11 min-w-28 flex-1 rounded-md border border-line-strong bg-background px-3 py-2 font-mono text-lg uppercase tracking-widest text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  placeholder="ABC123"
                  value={joinCode}
                  onChange={(e) => {
                    setJoinCode(e.target.value.toUpperCase());
                    setJoinCodeInvalid(false);
                    if (!publicJoin && joinRoomMutation.isError) joinRoomMutation.reset();
                  }}
                  aria-invalid={joinCodeInvalid || undefined}
                  aria-describedby={manualJoinError ? 'lobby-join-error' : undefined}
                  maxLength={6}
                  autoCapitalize="characters"
                  autoComplete="off"
                  enterKeyHint="go"
                  spellCheck={false}
                />
                <Button
                  type="submit"
                  disabled={loading || roomActionsDisabled || joinCode.length !== 6}
                  className="min-h-11 font-bold"
                  data-testid="lobby-join"
                >
                  {t(
                    joinRoomMutation.isPending && !publicJoin
                      ? 'lobby.joiningRoom'
                      : 'lobby.joinButton',
                  )}
                </Button>
              </div>
              {manualJoinError && (
                <p
                  id="lobby-join-error"
                  role="alert"
                  className="mt-3 rounded-md border border-blood/50 px-3 py-2 text-sm"
                >
                  {manualJoinError}
                </p>
              )}
            </form>
          </section>
          {onlineLobby && playerId && !resumable && (
            <QuickMatch
              key={playerId}
              playerId={playerId}
              sizes={PLAYER_COUNT_OPTIONS}
              roomBusy={roomBusy}
              onWaitingChange={setMatchmakingWaiting}
            />
          )}
        </div>
        <section className="rounded-lg border border-line bg-panel p-4">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Plus size={18} aria-hidden="true" />
            {t('lobby.createRoom')}
          </h2>
          <label className="mb-2 block text-sm text-dim" htmlFor="lobby-maxPlayers">
            {t('lobby.maxPlayers')}
          </label>
          <select
            id="lobby-maxPlayers"
            className="mb-3 min-h-11 w-full rounded-md border border-line-strong bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-ring text-foreground"
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
          >
            {PLAYER_COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <details className="group mb-3 rounded-md border border-line">
            <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              <span className="font-medium">{t('lobby.roomOptions')}</span>
              <span className="flex items-center gap-2 text-xs text-dim">
                {onlineLobby && (
                  <>{t(isPublic ? 'lobby.visibilityPublic' : 'lobby.visibilityPrivate')} · </>
                )}
                {seriesMode === 'unlimited'
                  ? t('series.unlimited')
                  : seriesMode === 'custom'
                    ? Number.isNaN(seriesLength)
                      ? t('series.custom')
                      : t('lobby.seriesRounds', { count: seriesLength })
                    : `BO${seriesMode}`}
                <ChevronDown className="size-4 shrink-0 group-open:rotate-180" aria-hidden="true" />
              </span>
            </summary>
            <div className="border-t border-line px-3 pt-3 pb-1">
              <label className="mb-2 block text-sm text-dim" htmlFor="lobby-series">
                {t('series.format')}
              </label>
              <select
                id="lobby-series"
                className="mb-3 min-h-11 w-full rounded-md border border-line-strong bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-ring text-foreground"
                value={seriesMode}
                onChange={(e) => setSeriesMode(e.target.value)}
              >
                <option value="unlimited">{t('series.unlimited')}</option>
                <option value="3">BO3</option>
                <option value="5">BO5</option>
                <option value="custom">{t('series.custom')}</option>
              </select>
              {seriesMode === 'custom' && (
                <input
                  aria-label={t('series.rounds')}
                  type="number"
                  min={1}
                  max={99}
                  step={1}
                  value={Number.isNaN(seriesLength) ? '' : seriesLength}
                  onChange={(e) => setSeriesLength(e.target.valueAsNumber)}
                  className="mb-3 min-h-11 w-full rounded-md border border-line-strong bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-ring"
                />
              )}
              {onlineLobby && (
                <label className="mb-2 flex min-h-11 cursor-pointer items-center gap-2 text-sm text-dim">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                  />
                  {t('lobby.listRoomPublicly')}
                </label>
              )}
            </div>
          </details>
          {createRoomMutation.error && (
            <p role="alert" className="mb-3 rounded-md border border-blood/50 px-3 py-2 text-sm">
              {t('lobby.errorGeneric', { message: requestErrorMessage(createRoomMutation.error) })}
            </p>
          )}
          <Button
            type="button"
            onClick={handleCreateRoom}
            disabled={
              loading ||
              roomActionsDisabled ||
              (seriesMode === 'custom' &&
                (!Number.isInteger(seriesLength) || seriesLength < 1 || seriesLength > 99))
            }
            className="min-h-11 w-full font-bold"
            data-testid="lobby-create"
          >
            {t(createRoomMutation.isPending ? 'lobby.creatingRoom' : 'lobby.createRoom')}
          </Button>
        </section>
      </div>

      {onlineLobby && (
        <section
          aria-labelledby="lobby-public-heading"
          className="mt-4 rounded-lg border border-line bg-panel p-4"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 id="lobby-public-heading" className="text-lg font-semibold">
              {t('lobby.publicRooms')}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label={t('lobby.refreshPublicRooms')}
              disabled={publicRooms.isFetching}
              onClick={() => void publicRooms.refetch()}
            >
              <RotateCcw size={16} aria-hidden="true" />
            </Button>
          </div>
          <label className="mb-2 block text-sm text-dim" htmlFor="lobby-public-size">
            {t('lobby.maxPlayers')}
          </label>
          <select
            id="lobby-public-size"
            value={publicSize ?? ''}
            onChange={(e) => setPublicSize(e.target.value ? Number(e.target.value) : null)}
            className="mb-3 min-h-11 w-full max-w-48 rounded-md border border-line-strong bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <option value="">{t('lobby.allSizes')}</option>
            {PLAYER_COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {publicRooms.isPending && (
            <p role="status" className="text-sm text-dim">
              {t('common.loading')}
            </p>
          )}
          {publicRooms.isSuccess && publicRooms.data.pages[0]?.data.length === 0 && (
            <p role="status" className="text-sm text-dim">
              {t('lobby.noPublicRooms')}
            </p>
          )}
          {publicRooms.data?.pages[0]?.data.length ? (
            <ul className="divide-y divide-line">
              {publicRooms.data.pages
                .flatMap((page) => page.data)
                .map((room) => (
                  <li
                    key={room.code}
                    className="flex min-h-12 items-center justify-between gap-3 py-1.5"
                  >
                    <span className="font-mono text-sm tracking-widest">{room.code}</span>
                    <span className="ml-auto whitespace-nowrap text-sm tabular-nums text-dim">
                      {room.currentPlayers} / {room.maxPlayers}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      aria-label={t('lobby.joinPublicRoom', { code: room.code })}
                      className="min-h-11"
                      disabled={roomActionsDisabled}
                      onClick={() =>
                        joinRoomMutation.mutate({ roomCode: room.code, fromPublicList: true })
                      }
                    >
                      {t(
                        joinRoomMutation.isPending &&
                          publicJoin &&
                          joinRoomMutation.variables?.roomCode === room.code
                          ? 'lobby.joiningRoom'
                          : 'lobby.joinButton',
                      )}
                    </Button>
                  </li>
                ))}
            </ul>
          ) : null}
          {publicJoin && joinRoomMutation.error && (
            <p role="alert" className="mt-3 rounded-md border border-blood/50 px-3 py-2 text-sm">
              {t('lobby.errorGeneric', { message: requestErrorMessage(joinRoomMutation.error) })}
            </p>
          )}
          {publicRooms.isError && (
            <div className="mt-2 flex items-center justify-between gap-3">
              <p role="alert" className="text-sm text-foreground">
                {t('lobby.publicRoomsError')}
              </p>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={publicRooms.isFetching}
                onClick={() => void publicRooms.refetch()}
              >
                {t('common.retry')}
              </Button>
            </div>
          )}
          {publicRooms.hasNextPage && !publicRooms.isError && (
            <Button
              type="button"
              variant="outline"
              className="mt-3 min-h-11 w-full sm:w-auto"
              disabled={publicRooms.isFetching}
              onClick={() => void publicRooms.fetchNextPage()}
            >
              {publicRooms.isFetchingNextPage ? t('common.loading') : t('lobby.loadMoreRooms')}
            </Button>
          )}
        </section>
      )}

      {recoveryDialog}
    </SitePage>
  );
}
