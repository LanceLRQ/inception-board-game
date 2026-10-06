// Game · 对局容器
// - 联机模式（?online=1&code=ABC123）：服务端权威对局，路由参数是对局编号
// - friend 模式（?friend=1&players=N&code=ABC123）：1 人类 + (N-1) AI 本地对局
// - 其他场景：固定场景调试视图（?as=master / ?pending=1），界面与真实对局相同，状态来自固定场景

import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { FixtureMatchRuntime } from '../../components/FixtureMatchRuntime/index.js';
import { LocalMatchRuntime } from '../../components/LocalMatchRuntime/index.js';
import { RemoteMatchRuntime } from '../../components/RemoteMatchRuntime/index.js';
import { getAuthToken } from '../../lib/api.js';
import { realtimeUrl } from '../../lib/realtimeUrl.js';
import { forgetOnlineMatch, rememberOnlineMatch } from '../../lib/onlineMatchMemo.js';
import { logger } from '../../lib/logger.js';
import { resolveFixtureScenario } from '../../match/fixtures/scenarios.js';
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
      <LocalMatchRuntime
        playerCount={resolved.players}
        matchId={matchId}
        topRight={roomCode && <RoomCodeBadge code={roomCode} />}
        onRestart={() => navigate('/lobby')}
      />
    );
  }

  // 固定场景（?as=master / ?pending=1 调试用）
  return (
    <FixtureMatchRuntime
      scenario={resolveFixtureScenario(search)}
      onRestart={() => navigate('/lobby')}
    />
  );
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
    <RemoteMatchRuntime
      url={realtimeUrl()}
      token={token}
      matchID={matchID}
      topRight={roomCode && <RoomCodeBadge code={roomCode} />}
      onExit={onExit}
      onSettled={handleSettled}
    />
  );
}

function OnlineUnavailable({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-4 text-foreground"
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
