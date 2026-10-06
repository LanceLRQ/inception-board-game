// Game · 对局容器
// - 联机模式（?online=1&code=ABC123）：服务端权威对局，路由参数是对局编号
// - friend 模式（?friend=1&players=N&code=ABC123）：1 人类 + (N-1) AI 本地对局
// - 其他场景：静态 mock 调试视图（?as=master / ?pending=1）

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { MatchTable } from './Table/MatchTable.js';
import { MatchTrack } from './Track/MatchTrack.js';
import { useMockMatch } from '../../hooks/useMockMatch.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import type { PlayIntent } from '../../hooks/useGameActions.js';
import { CopyrightNotice } from '../../components/CopyrightNotice/index.js';
import { LocalMatchRuntime } from '../../components/LocalMatchRuntime/index.js';
import { RemoteMatchRuntime } from '../../components/RemoteMatchRuntime/index.js';
import { getAuthToken } from '../../lib/api.js';
import { realtimeUrl } from '../../lib/realtimeUrl.js';
import { forgetOnlineMatch, rememberOnlineMatch } from '../../lib/onlineMatchMemo.js';
import { logger } from '../../lib/logger.js';
import { resolveGameMode } from './resolveGameMode.js';

export default function Game() {
  const [search] = useSearchParams();
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();

  const roomCode = search.get('code');
  const token = getAuthToken();
  const resolved = resolveGameMode(search, token);

  if (resolved.mode === 'online' && matchId && token) {
    return (
      <OnlineMatch
        matchID={matchId}
        token={token}
        roomCode={roomCode}
        onExit={() => navigate('/lobby')}
      />
    );
  }

  if (resolved.mode === 'online' || resolved.mode === 'online-unavailable') {
    return <OnlineUnavailable onBack={() => navigate('/lobby')} />;
  }

  if (resolved.mode === 'local') {
    return (
      <>
        <LocalMatchRuntime
          playerCount={resolved.players}
          matchId={matchId}
          topRight={roomCode && <RoomCodeBadge code={roomCode} />}
          onRestart={() => navigate('/lobby')}
        />
        <div className="fixed inset-x-0 bottom-0 z-10 pb-safe">
          <CopyrightNotice variant="footer" className="bg-background/70 py-1 backdrop-blur-sm" />
        </div>
      </>
    );
  }

  // === 原 mock 路径 === (?as=master / ?pending=1 调试用)
  return <GameMockView />;
}

function RoomCodeBadge({ code }: { code: string }) {
  return (
    <span className="rounded border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
      {code}
    </span>
  );
}

function OnlineMatch({
  matchID,
  token,
  roomCode,
  onExit,
}: {
  matchID: string;
  token: string;
  roomCode: string | null;
  onExit: () => void;
}) {
  useEffect(() => {
    logger.flow('game', 'enter online match', { matchID, code: roomCode });
    rememberOnlineMatch({ matchID, code: roomCode });
  }, [matchID, roomCode]);

  const handleSettled = useCallback(
    (reason: 'finished' | 'rejected') => {
      logger.flow('game', 'online match settled', { matchID, reason });
      forgetOnlineMatch();
    },
    [matchID],
  );

  return (
    <>
      <RemoteMatchRuntime
        url={realtimeUrl()}
        token={token}
        matchID={matchID}
        topRight={roomCode && <RoomCodeBadge code={roomCode} />}
        onExit={onExit}
        onSettled={handleSettled}
      />
      <div className="fixed inset-x-0 bottom-0 z-10 pb-safe">
        <CopyrightNotice variant="footer" className="bg-background/70 py-1 backdrop-blur-sm" />
      </div>
    </>
  );
}

function OnlineUnavailable({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-4 text-foreground"
      data-testid="online-unavailable"
    >
      <p className="text-sm">
        {t('match.online_unavailable', { defaultValue: '需要连接服务器才能进入联机对局' })}
      </p>
      <button
        type="button"
        onClick={onBack}
        className="rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-muted"
      >
        {t('match.back_to_lobby', { defaultValue: '返回大厅' })}
      </button>
    </div>
  );
}

function GameMockView() {
  const [search] = useSearchParams();
  const viewAs = search.get('as') === 'master' ? 'master' : 'thief';
  const withPendingUnlock = search.get('pending') === '1';

  const state = useMockMatch({ viewAs, withPendingUnlock });
  const [lastIntent, setLastIntent] = useState<Required<PlayIntent> | null>(null);

  const handleDispatch = useCallback((intent: Required<PlayIntent>) => {
    setLastIntent(intent);
  }, []);

  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const Board = isDesktop ? (
    <MatchTable state={state} onDispatch={handleDispatch} />
  ) : (
    <MatchTrack state={state} onDispatch={handleDispatch} />
  );

  return (
    <>
      {Board}
      {lastIntent && (
        <div
          className="fixed left-1/2 top-20 z-[60] -translate-x-1/2 rounded-md border border-primary/40 bg-card/90 px-3 py-1.5 text-xs text-primary shadow-md"
          role="status"
        >
          最近派发：{lastIntent.cardId}
          {lastIntent.targetPlayerID && ` → ${lastIntent.targetPlayerID}`}
          {lastIntent.targetLayer !== -1 && ` @ 层${lastIntent.targetLayer}`}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 pb-safe">
        <CopyrightNotice variant="footer" className="bg-background/70 py-1 backdrop-blur-sm" />
      </div>
    </>
  );
}
