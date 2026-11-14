import { useEffect, useMemo, useReducer, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import type { MatchEvent } from '@icgame/game-engine';
import { CardArt } from '../../components/CardArt';
import { describeHistoryEvent } from '../../components/MatchRuntime/shared/historyEntries';
import { Button } from '../../components/ui/button';
import { api, ApiRequestError } from '../../lib/api';
import { getCardImageUrl } from '../../lib/cardImages';
import { getCardName } from '../../lib/cards';
import { useIdentityStore } from '../../stores/useIdentityStore';
import {
  initialPlayback,
  playbackDelay,
  replayPlayback,
  REPLAY_SPEEDS,
  visiblePrivateCards,
} from './playback';

interface ReplayArchive {
  startedAt: string;
  viewerID: string | null;
  complete: boolean;
  gaps: { from: number; to: number }[];
  players: { seat: number; nickname: string }[];
  steps: { stateID: number; events: MatchEvent[] }[];
}

export default function Replay() {
  const { t, i18n } = useTranslation();
  const { matchId = '' } = useParams();
  const accountId = useIdentityStore((state) => state.playerId);
  const replay = useQuery({
    queryKey: ['replay', matchId, accountId],
    queryFn: ({ signal }) =>
      api.get<ReplayArchive>(`/replays/${encodeURIComponent(matchId)}/download`, {
        signal,
        cache: 'no-store',
      }),
    gcTime: 0,
  });
  const archive = replay.data;
  const status = replay.error instanceof ApiRequestError ? replay.error.status : null;
  const errorKey = status === 409 ? 'unfinished' : status === 404 ? 'notFound' : 'loadFailed';

  return (
    <div className="min-h-dvh bg-background px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-foreground sm:px-8 sm:pt-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">{t('replay.title')}</h1>
            {archive && (
              <p className="mt-1 text-sm text-muted-foreground">
                <time dateTime={archive.startedAt}>
                  {new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(archive.startedAt))}
                </time>
                {' · '}
                {archive.viewerID === null
                  ? t('replay.publicView')
                  : t('replay.seatView', {
                      name:
                        archive.players.find((player) => String(player.seat) === archive.viewerID)
                          ?.nickname ?? archive.viewerID,
                    })}
              </p>
            )}
          </div>
          <Link
            to="/lobby"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft size={16} aria-hidden />
            {t('match.back_to_lobby')}
          </Link>
        </header>
        {replay.isFetching && !archive && <p role="status">{t('common.loading')}</p>}
        {replay.isError && !archive && (
          <section className="space-y-3 rounded-xl border border-border bg-card p-5">
            <p role="alert">{t(`replay.${errorKey}`)}</p>
            {status !== 404 && (
              <Button variant="outline" className="min-h-11" onClick={() => void replay.refetch()}>
                {t('common.retry')}
              </Button>
            )}
          </section>
        )}
        {archive && (
          <>
            {archive.steps.length > 0 && !archive.complete && (
              <p
                role="status"
                className="rounded-lg border border-border bg-muted px-4 py-3 text-sm"
              >
                {t('replay.incomplete')}
                {archive.gaps.length > 0 && (
                  <>
                    {' '}
                    {t('replay.gaps', {
                      steps: archive.gaps
                        .map(({ from, to }) => (from === to ? String(from) : `${from}–${to}`))
                        .join(', '),
                    })}
                  </>
                )}
              </p>
            )}
            {archive.steps.length > 0 ? (
              <ReplayPlayer key={`${matchId}:${accountId}:${archive.viewerID}`} archive={archive} />
            ) : (
              <p className="rounded-xl border border-border bg-card p-5">{t('replay.empty')}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ReplayPlayer({ archive }: { archive: ReplayArchive }) {
  const { t } = useTranslation();
  const [playback, dispatch] = useReducer(replayPlayback, initialPlayback);
  const listRef = useRef<HTMLOListElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const { position, speed, playing, eventIndex } = playback;
  const last = archive.steps.length - 1;
  const step = archive.steps[Math.min(position, last)]!;
  const names = useMemo(
    () => new Map(archive.players.map(({ seat, nickname }) => [String(seat), nickname])),
    [archive.players],
  );
  const eventsByStep = useMemo(
    () =>
      archive.steps.map(({ events }) =>
        events.map((event) => ({
          event,
          description: describeHistoryEvent(
            event,
            (seat) => names.get(seat) ?? t('replay.seat', { seat }),
            (key) => t(key),
          ),
        })),
      ),
    [archive.steps, names, t],
  );
  const events = eventsByStep[Math.min(position, last)]!;
  const activeEvent =
    eventIndex ??
    events.find(({ event }) => event.kind !== 'move')?.event.index ??
    events[0]?.event.index;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => dispatch({ type: 'tick', last }), playbackDelay(speed));
    return () => window.clearInterval(timer);
  }, [playing, speed, last]);

  useEffect(() => {
    const list = listRef.current;
    const active = activeRef.current;
    if (!list || !active) return;
    const itemBounds = active.getBoundingClientRect();
    const listBounds = list.getBoundingClientRect();
    if (itemBounds.top < listBounds.top) list.scrollTop += itemBounds.top - listBounds.top;
    else if (itemBounds.bottom > listBounds.bottom)
      list.scrollTop += itemBounds.bottom - listBounds.bottom;
  }, [position, activeEvent]);

  const stepLabel = t('replay.step', { step: step.stateID });
  const playLabel = t(
    playing ? 'replay.pause' : position === last && last > 0 ? 'replay.restart' : 'replay.play',
  );

  return (
    <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
      <section aria-label={stepLabel} className="min-w-0 rounded-xl border border-border bg-card">
        <div className="space-y-1 border-b border-border p-4 sm:px-5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="replay-timeline" className="text-sm font-medium">
              {t('replay.timeline')}
            </label>
            <span className="font-mono text-xs text-muted-foreground">
              {t('replay.position', { position: Math.min(position, last) + 1, count: last + 1 })}
            </span>
          </div>
          <input
            id="replay-timeline"
            type="range"
            min={0}
            max={last}
            step={1}
            value={Math.min(position, last)}
            aria-valuetext={stepLabel}
            disabled={last === 0}
            onChange={(event) =>
              dispatch({ type: 'seek', position: event.currentTarget.valueAsNumber })
            }
            className="block h-11 w-full cursor-pointer rounded accent-primary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="size-11"
                aria-label={t('replay.previous')}
                disabled={position === 0}
                onClick={() => dispatch({ type: 'seek', position: position - 1 })}
              >
                <ChevronLeft aria-hidden />
              </Button>
              <Button
                className="min-h-11 px-3"
                disabled={last === 0}
                onClick={() => dispatch({ type: 'toggle', last })}
              >
                {playing ? (
                  <Pause aria-hidden />
                ) : position === last && last > 0 ? (
                  <RotateCcw aria-hidden />
                ) : (
                  <Play aria-hidden />
                )}
                {playLabel}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-11"
                aria-label={t('replay.next')}
                disabled={position >= last}
                onClick={() => dispatch({ type: 'seek', position: position + 1 })}
              >
                <ChevronRight aria-hidden />
              </Button>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              {t('replay.speed')}
              <select
                value={speed}
                onChange={(event) => {
                  const nextSpeed = REPLAY_SPEEDS.find(
                    (s) => s === Number(event.currentTarget.value),
                  );
                  if (nextSpeed !== undefined) dispatch({ type: 'speed', speed: nextSpeed });
                }}
                className="min-h-11 rounded-lg border border-border bg-background px-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {REPLAY_SPEEDS.map((factor) => (
                  <option key={factor} value={factor}>
                    {factor}×
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="min-h-48 space-y-3 p-4 sm:p-5">
          <h2 className="text-lg font-semibold">{stepLabel}</h2>
          {events.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('replay.noEvents')}</p>
          )}
          <ol className="space-y-2">
            {events.map(({ event, description }) => (
              <li
                key={event.index}
                className={`min-w-0 space-y-2 rounded-lg border p-3 text-sm ${event.index === activeEvent ? 'border-primary/50 bg-primary/10' : 'border-border'}`}
              >
                <p className="wrap-anywhere">{description.text}</p>
                {description.dice.map(({ player, dice }) => (
                  <p key={player} className="font-mono text-muted-foreground">
                    {names.get(player) ?? t('replay.seat', { seat: player })} · {dice.join(' / ')}
                  </p>
                ))}
                {[...description.cards, ...visiblePrivateCards(event, archive.viewerID)].map(
                  (card, index) => (
                    <CardArt
                      key={`${card}:${index}`}
                      src={getCardImageUrl(card)}
                      alt={getCardName(card)}
                      trimBorder={false}
                      className="mr-2 inline-block h-24 w-auto max-w-full rounded-sm align-top"
                    />
                  ),
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        aria-labelledby="replay-events"
        className="min-w-0 overflow-hidden rounded-xl border border-border bg-card"
      >
        <h2 id="replay-events" className="border-b border-border px-4 py-3 text-sm font-semibold">
          {t('replay.events')}
        </h2>
        <ol
          ref={listRef}
          className="max-h-[min(58dvh,36rem)] overflow-y-auto overscroll-contain p-2"
        >
          {eventsByStep.flatMap((entries, stepIndex) =>
            entries.map(({ event, description }) => {
              const current = stepIndex === position && event.index === activeEvent;
              return (
                <li key={`${event.stateID}:${event.index}`}>
                  <button
                    ref={current ? activeRef : null}
                    type="button"
                    aria-current={current ? 'step' : undefined}
                    onClick={() =>
                      dispatch({ type: 'seek', position: stepIndex, eventIndex: event.index })
                    }
                    className="grid min-h-11 w-full grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3 rounded-md px-3 py-2 text-start text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-[current=step]:bg-primary/10 aria-[current=step]:text-primary"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {t('replay.step', { step: event.stateID })}
                    </span>
                    <span className="wrap-anywhere">{description.text}</span>
                  </button>
                </li>
              );
            }),
          )}
        </ol>
      </section>
    </div>
  );
}
