import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button, buttonVariants } from '@/components/ui/button';
import { api, ApiRequestError } from '../../lib/api';
import { requestErrorMessage } from '../../lib/roomQueries';

type MatchmakingStatus =
  | { status: 'idle' }
  | { status: 'queued' | 'matching'; playerCount: number; ticketId: number }
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
    mutationFn: (cancelTicket?: number) =>
      cancelTicket === undefined
        ? api.post<MatchmakingStatus>('/matchmake', { playerCount })
        : api.del<MatchmakingStatus>(`/matchmake?ticketId=${cancelTicket}`),
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
          className={buttonVariants({ className: 'h-10 w-full font-bold' })}
        >
          {t('matchmaking.enter')}
        </Link>
      ) : ticket?.status === 'queued' || ticket?.status === 'matching' ? (
        <>
          <p role="status" className="mb-3 text-sm text-dim">
            {t(`matchmaking.${ticket.status}`, { count: ticket.playerCount })}
          </p>
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full font-bold"
            disabled={change.isPending || ticket.status === 'matching'}
            onClick={() => change.mutate(ticket.ticketId)}
          >
            {t('matchmaking.cancel')}
          </Button>
        </>
      ) : (
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-2 block text-sm text-dim" htmlFor="lobby-quick-size">
              {t('matchmaking.players')}
            </label>
            <select
              id="lobby-quick-size"
              value={playerCount}
              onChange={(e) => setPlayerCount(Number(e.target.value))}
              disabled={change.isPending}
              className="h-10 w-full rounded-md border border-line-strong bg-background px-3 text-foreground"
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
            className="h-10 font-bold"
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
          <p className="text-sm text-destructive" role="alert">
            {requestErrorMessage(error)}
          </p>
          <Button
            type="button"
            variant="outline"
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
