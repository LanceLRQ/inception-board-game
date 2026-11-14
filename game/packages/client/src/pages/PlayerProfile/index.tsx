import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Film } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { PixelAvatar } from '../../components/PixelAvatar';
import { Button } from '../../components/ui/button';
import { api, ApiRequestError } from '../../lib/api';
import { isOfflineIdentity } from '../../lib/identityApi';
import { useIdentityStore } from '../../stores/useIdentityStore';

interface Profile {
  player: { id: string; nickname: string; avatarSeed: string };
  stats: {
    total: number;
    wins: number;
    losses: number;
    abandoned: number;
    mvps: number;
    winRate: number;
  };
}

interface MatchPage {
  data: Array<{
    matchId: string;
    seat: number;
    endedAt: string;
    won: boolean | null;
    abandoned: boolean;
    isMvp: boolean;
    score: number | null;
    mode: string;
  }>;
  nextCursor: string | null;
}

export default function PlayerProfile() {
  const { playerId = '' } = useParams();
  const { t, i18n } = useTranslation();
  const accountId = useIdentityStore((state) => state.playerId);
  const token = useIdentityStore((state) => state.token);
  const ownProfile = Boolean(token && !isOfflineIdentity(token) && accountId === playerId);
  const profile = useQuery({
    queryKey: ['player-stats', playerId],
    queryFn: ({ signal }) =>
      api.get<Profile>(`/players/${encodeURIComponent(playerId)}/stats`, { signal }),
    retry: (count, error) =>
      !(error instanceof ApiRequestError && error.status === 404) && count < 2,
  });
  const history = useInfiniteQuery({
    queryKey: ['my-match-history', playerId],
    queryFn: ({ pageParam, signal }) =>
      api.get<MatchPage>(
        `/players/me/matches${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`,
        { signal, cache: 'no-store' },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: ownProfile,
    gcTime: 0,
  });
  const stats = profile.data?.stats;
  const matches = history.data?.pages.flatMap((page) => page.data) ?? [];
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const percent = new Intl.NumberFormat(i18n.resolvedLanguage, {
    style: 'percent',
    maximumFractionDigits: 1,
  });

  return (
    <div className="min-h-dvh bg-background p-4 text-foreground sm:p-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <Link
          to="/lobby"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft size={16} aria-hidden />
          {t('match.back_to_lobby')}
        </Link>

        {profile.isPending && <p role="status">{t('common.loading')}</p>}
        {profile.isError && (
          <div className="flex flex-wrap items-center gap-3">
            <p role="alert">
              {t(
                profile.error instanceof ApiRequestError && profile.error.status === 404
                  ? 'profile.notFound'
                  : 'profile.loadFailed',
              )}
            </p>
            {(!(profile.error instanceof ApiRequestError) || profile.error.status !== 404) && (
              <Button variant="outline" onClick={() => void profile.refetch()}>
                {t('common.retry')}
              </Button>
            )}
          </div>
        )}
        {profile.data && stats && (
          <section className="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-6">
            <header className="flex items-center gap-3">
              <PixelAvatar seed={profile.data.player.avatarSeed} size={48} />
              <h1 className="text-2xl font-bold wrap-anywhere">{profile.data.player.nickname}</h1>
            </header>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(['total', 'wins', 'losses', 'winRate', 'abandoned', 'mvps'] as const).map((key) => (
                <div key={key} className="rounded-lg border border-border px-3 py-2">
                  <dt className="text-sm text-muted-foreground">{t(`profile.${key}`)}</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {key === 'winRate' ? percent.format(stats[key]) : stats[key]}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {ownProfile && (
          <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-6">
            <h2 className="text-lg font-semibold">{t('profile.history')}</h2>
            {history.isPending && <p role="status">{t('common.loading')}</p>}
            {history.isError && (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <p role="alert">{t('profile.historyFailed')}</p>
                <Button
                  variant="outline"
                  onClick={() =>
                    void (history.isFetchNextPageError
                      ? history.fetchNextPage()
                      : history.refetch())
                  }
                >
                  {t('common.retry')}
                </Button>
              </div>
            )}
            {history.isSuccess && matches.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('profile.noMatches')}</p>
            )}
            {matches.length > 0 && (
              <ul className="divide-y divide-border">
                {matches.map((match) => (
                  <li
                    key={`${match.matchId}-${match.seat}`}
                    className="flex flex-wrap items-center justify-between gap-x-4 py-2 text-sm"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2">
                        <strong>
                          {t(
                            match.abandoned
                              ? 'profile.left'
                              : match.won === null
                                ? 'profile.stopped'
                                : match.won
                                  ? 'profile.win'
                                  : 'profile.loss',
                          )}
                        </strong>
                        {match.isMvp && <span className="text-primary">MVP</span>}
                        {match.mode === 'matchmaking' && (
                          <span className="text-muted-foreground">{t('matchmaking.title')}</span>
                        )}
                        {match.score !== null && (
                          <span>{t('series.points', { score: match.score })}</span>
                        )}
                      </div>
                      <time className="text-muted-foreground" dateTime={match.endedAt}>
                        {date.format(new Date(match.endedAt))}
                      </time>
                    </div>
                    <Link
                      to={`/replay/${encodeURIComponent(match.matchId)}`}
                      className="inline-flex min-h-11 items-center gap-2 rounded px-2 text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Film size={16} aria-hidden />
                      {t('replay.open')}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {history.hasNextPage && !history.isFetchNextPageError && (
              <Button
                variant="outline"
                disabled={history.isFetchingNextPage}
                onClick={() => void history.fetchNextPage()}
              >
                {t(history.isFetchingNextPage ? 'common.loading' : 'profile.loadMore')}
              </Button>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
