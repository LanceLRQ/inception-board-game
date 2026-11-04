import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { History } from 'lucide-react';
import type { MatchSource } from '../../../match/matchSource';
import type { EventBatch } from '../../../match/eventFeed';
import { getCardImageUrl } from '../../../lib/cardImages';
import { getCardName } from '../../../lib/cards';
import { CardArt } from '../../CardArt';
import { Dialog, DialogTitle } from '../../ui/dialog';
import { mergePublicHistory, describeHistoryEvent } from './historyEntries';

const HistoryContext = createContext<(() => void) | null>(null);

export function MatchHistoryButton() {
  const open = useContext(HistoryContext);
  if (!open) return null;
  return (
    <button
      type="button"
      onClick={open}
      className="tabletop-history-trigger"
      data-testid="match-history-open"
    >
      <History size={16} aria-hidden />
      历史记录
    </button>
  );
}

export function MatchHistoryProvider({
  source,
  nicknameOf,
  children,
}: {
  source: MatchSource;
  nicknameOf: (id: string) => string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { loadHistory } = source;
  const [open, setOpen] = useState(false);
  const [batches, setBatches] = useState<readonly EventBatch[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'incomplete' | 'error'>('ready');
  const [limit, setLimit] = useState(100);
  const [retry, setRetry] = useState(0);
  useEffect(
    () => source.events.subscribe((batch) => setBatches((old) => mergePublicHistory(old, [batch]))),
    [source.events],
  );
  useEffect(() => {
    if (!open || !loadHistory) return;
    let active = true;
    void loadHistory().then(
      (history) => {
        if (!active) return;
        setBatches((old) => mergePublicHistory(history.batches, old));
        setStatus(history.complete ? 'ready' : 'incomplete');
      },
      () => {
        if (active) setStatus('error');
      },
    );
    return () => {
      active = false;
    };
  }, [open, loadHistory, retry]);
  const events = useMemo(() => [...batches].reverse().flatMap((batch) => batch.events), [batches]);
  return (
    <HistoryContext.Provider
      value={() => {
        setLimit(100);
        setStatus(loadHistory ? 'loading' : 'ready');
        setOpen(true);
      }}
    >
      {children}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        blocking={false}
        className="tabletop-history-dialog"
        data-testid="match-history"
      >
        <header className="shrink-0 border-b border-line p-5 pr-12">
          <DialogTitle>本局历史记录</DialogTitle>
        </header>
        <div className="min-h-0 overflow-y-auto p-5" data-testid="match-history-scroll">
          {status === 'loading' && <p role="status">正在补读历史记录…</p>}
          {status === 'incomplete' && (
            <p className="mb-3 text-sm text-dim">部分早期记录不可用，以下显示已保存的公开记录。</p>
          )}
          {status === 'error' && (
            <button
              type="button"
              className="tabletop-secondary"
              onClick={() => {
                setStatus('loading');
                setRetry((n) => n + 1);
              }}
            >
              历史加载失败，点击重试
            </button>
          )}
          {events.length === 0 && status === 'ready' && (
            <p className="text-sm text-dim">本局暂无公开记录。</p>
          )}
          <ol className="space-y-4">
            {events.slice(0, limit).map((event) => {
              const entry = describeHistoryEvent(event, nicknameOf, (key) => t(key));
              return (
                <li
                  key={`${event.stateID}:${event.index}`}
                  className="border-b border-line pb-3 text-sm"
                >
                  <span className="text-xs text-dim">第 {event.stateID} 步</span>
                  <p>{entry.text}</p>
                  {entry.cards.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {entry.cards.map((card, i) => (
                        <CardArt
                          key={`${card}:${i}`}
                          src={getCardImageUrl(card)}
                          alt={getCardName(card)}
                          trimBorder={false}
                          className="h-20 w-auto rounded"
                        />
                      ))}
                    </div>
                  )}
                  {entry.dice.map((row) => (
                    <p key={row.player} className="mt-2 font-mono">
                      {nicknameOf(row.player)} · {row.dice.join('、')} 点
                    </p>
                  ))}
                </li>
              );
            })}
          </ol>
          {events.length > limit && (
            <button
              type="button"
              className="tabletop-secondary mt-4"
              onClick={() => setLimit((n) => n + 100)}
            >
              查看更早记录
            </button>
          )}
        </div>
      </Dialog>
    </HistoryContext.Provider>
  );
}
