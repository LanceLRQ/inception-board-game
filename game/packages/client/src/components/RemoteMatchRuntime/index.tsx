// 远程对局界面：连接服务端、重连提示，把状态交给与本地对局共用的对局界面

import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useRemoteMatchSource } from '../../match/useRemoteMatchSource';
import { useReconnect } from '../../hooks/useReconnect';
import { logger } from '../../lib/logger';
import { MatchRuntime } from '../MatchRuntime';
import { ReconnectBanner } from '../ReconnectBanner';
import { shouldShowHandshakeError } from './handshakeError';

export interface RemoteMatchRuntimeProps {
  url: string;
  token: string;
  matchID: string;
  topRight?: ReactNode;
  onExit: () => void;
  /** 对局不会再继续时通知一次：打完（finished）或握手被拒（rejected） */
  onSettled?: (reason: 'finished' | 'rejected') => void;
}

export function RemoteMatchRuntime({
  url,
  token,
  matchID,
  topRight,
  onExit,
  onSettled,
}: RemoteMatchRuntimeProps) {
  const { t } = useTranslation();
  const source = useRemoteMatchSource({ url, token, matchID });
  const reconnect = useReconnect({ connectionState: source.connection });

  useEffect(() => {
    logger.flow('game', 'remote runtime mount', { matchID });
  }, [matchID]);

  // 两种结局各只通知一次
  const settledRef = useRef<{ finished: boolean; rejected: boolean }>({
    finished: false,
    rejected: false,
  });
  const finished = source.view?.ctx.gameover !== undefined;
  const rejected = !!source.error;
  useEffect(() => {
    if (finished && !settledRef.current.finished) {
      settledRef.current.finished = true;
      logger.flow('game', 'remote match finished', { matchID });
      onSettled?.('finished');
    }
    if (rejected && !settledRef.current.rejected) {
      settledRef.current.rejected = true;
      logger.flow('game', 'remote match rejected', { matchID });
      onSettled?.('rejected');
    }
  }, [finished, rejected, matchID, onSettled]);

  if (source.error && shouldShowHandshakeError(source.error, source.view)) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-4 text-foreground"
        data-testid="remote-runtime"
      >
        <p className="text-sm text-destructive" data-testid="remote-error">
          {t(source.error, { defaultValue: source.error })}
        </p>
        <button
          type="button"
          onClick={onExit}
          className="rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-muted"
        >
          {t('match.back_to_lobby', { defaultValue: '返回大厅' })}
        </button>
      </div>
    );
  }

  return (
    <div data-testid="remote-runtime">
      <ReconnectBanner state={reconnect} onExit={onExit} />
      {source.view === null ? (
        <div
          className="flex min-h-screen items-center justify-center text-sm text-muted-foreground"
          data-testid="remote-connecting"
        >
          {t('match.connecting', { defaultValue: '正在连接' })}
        </div>
      ) : (
        <MatchRuntime source={source} topRight={topRight} onRestart={onExit} />
      )}
    </div>
  );
}
