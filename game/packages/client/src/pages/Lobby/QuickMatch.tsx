import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button, buttonVariants } from '@/components/ui/button';
import { api, ApiRequestError, getAuthToken } from '../../lib/api';
import { identityApi } from '../../lib/identityApi';
import { requestErrorMessage } from '../../lib/roomQueries';

const FINGERPRINT_MATCH_WAIT_MS = 800;

type MatchmakingStatus =
  | { status: 'idle' }
  | { status: 'queued' | 'matching'; playerCount: number; ticketId: number; lowReputation?: true }
  | { status: 'matched'; matchId: string };

export function QuickMatch({
  playerId,
  sizes,
  roomBusy,
  onWaitingChange,
}: {
  playerId: string;
  sizes: number[];
  roomBusy: boolean;
  onWaitingChange: (waiting: boolean) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const key = ['matchmaking', playerId];
  const [playerCount, setPlayerCount] = useState(sizes[0]!);
  const wasWaiting = useRef(false);
  const queue = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      api.get<MatchmakingStatus>('/matchmake', { signal, cache: 'no-store' }),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchIntervalInBackground: true,
    refetchInterval: ({ state }) =>
      state.data?.status === 'queued' || state.data?.status === 'matching' ? 3000 : false,
  });
  const change = useMutation({
    mutationFn: async (cancelTicket?: number): Promise<MatchmakingStatus> => {
      if (cancelTicket !== undefined) {
        return api.del<MatchmakingStatus>(`/matchmake?ticketId=${cancelTicket}`);
      }
      const token = getAuthToken();
      if (token) {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          identityApi.registerFingerprint(token),
          new Promise<void>((resolve) => {
            timeout = setTimeout(resolve, FINGERPRINT_MATCH_WAIT_MS);
          }),
        ]);
        clearTimeout(timeout);
        if (getAuthToken() !== token) return { status: 'idle' };
      }
      return api.post<MatchmakingStatus>('/matchmake', { playerCount });
    },
    onMutate: () => client.cancelQueries({ queryKey: key }),
    onSuccess: async (ticket) => {
      await client.cancelQueries({ queryKey: key });
      client.setQueryData(key, ticket);
    },
    onError: () => client.invalidateQueries({ queryKey: key }),
  });
  const ticket = queue.data;
  const error = change.error ?? queue.error;
  const waiting = ticket?.status === 'queued' || ticket?.status === 'matching';
  useEffect(
    () => onWaitingChange(waiting || ticket?.status === 'matched' || change.isPending),
    [waiting, ticket?.status, change.isPending, onWaitingChange],
  );
  useEffect(() => {
    if (waiting) wasWaiting.current = true;
    if (ticket?.status === 'idle') wasWaiting.current = false;
    if (ticket?.status === 'matched' && wasWaiting.current && !roomBusy) {
      wasWaiting.current = false;
      void navigate(`/game/${encodeURIComponent(ticket.matchId)}?online=1`, { replace: true });
    }
  }, [waiting, ticket, roomBusy, navigate]);

  if (error instanceof ApiRequestError && error.status === 404 && !ticket) return null;

  return (
    <section
      aria-labelledby="lobby-quick-heading"
      className="rounded-lg border border-line bg-panel p-4"
    >
      <h2 id="lobby-quick-heading" className="mb-3 text-lg font-semibold">
        {t('matchmaking.title')}
      </h2>
      {ticket?.status === 'matched' ? (
        <Link
          to={`/game/${encodeURIComponent(ticket.matchId)}?online=1`}
          className={buttonVariants({ className: 'min-h-11 w-full font-bold' })}
        >
          {t('matchmaking.enter')}
        </Link>
      ) : ticket?.status === 'queued' || ticket?.status === 'matching' ? (
        <>
          <p role="status" className="mb-3 text-sm text-dim">
            {t(`matchmaking.${ticket.status}`, { count: ticket.playerCount })}
            {ticket.lowReputation && (
              <span className="mt-1 block">{t('matchmaking.lowReputation')}</span>
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full font-bold"
            disabled={change.isPending || ticket.status === 'matching'}
            onClick={() => change.mutate(ticket.ticketId)}
          >
            {t('matchmaking.cancel')}
          </Button>
        </>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <label className="mb-2 block text-sm text-dim" htmlFor="lobby-quick-size">
              {t('matchmaking.players')}
            </label>
            <select
              id="lobby-quick-size"
              value={playerCount}
              onChange={(e) => setPlayerCount(Number(e.target.value))}
              disabled={change.isPending}
              className="min-h-11 w-full rounded-md border border-line-strong bg-background px-3 text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {sizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            className="min-h-11 font-bold"
            onClick={() => {
              wasWaiting.current = true;
              change.mutate(undefined);
            }}
            disabled={roomBusy || change.isPending || queue.isPending || !ticket}
          >
            {t('matchmaking.start')}
          </Button>
        </div>
      )}
      {error && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm text-foreground" role="alert">
            {requestErrorMessage(error)}
          </p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={queue.isFetching}
            onClick={() => {
              change.reset();
              void queue.refetch();
            }}
          >
            {t('common.retry')}
          </Button>
        </div>
      )}
    </section>
  );
}
