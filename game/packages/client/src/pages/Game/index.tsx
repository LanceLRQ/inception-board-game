// Game · 对局容器
// - friend 模式（?friend=1&players=N&code=ABC123）：1 人类 + (N-1) AI 本地对局
// - 其他场景：保留原 mock + ThiefBoard/MasterBoard 调试路径
//
// 对照：plans/design/07-backend-network.md · plans/design/08-security-ai.md §8.5

import { useCallback, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ThiefBoard } from './ThiefBoard/index.js';
import { MasterBoard } from './MasterBoard/index.js';
import { useMockMatch } from '../../hooks/useMockMatch.js';
import type { PlayIntent } from '../../hooks/useGameActions.js';
import { CopyrightNotice } from '../../components/CopyrightNotice/index.js';
import { LocalMatchRuntime } from '../../components/LocalMatchRuntime/index.js';

export default function Game() {
  const [search] = useSearchParams();
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();

  // === friend 模式：客户端本地跑对局 ===
  const isFriendMode = search.get('friend') === '1';
  const playerCountParam = parseInt(search.get('players') ?? '0', 10);
  const roomCode = search.get('code');

  if (isFriendMode && playerCountParam >= 3) {
    return (
      <>
        <LocalMatchRuntime
          playerCount={playerCountParam}
          matchId={matchId}
          topRight={
            roomCode && (
              <span className="rounded border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
                {roomCode}
              </span>
            )
          }
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

function GameMockView() {
  const [search] = useSearchParams();
  const viewAs = search.get('as') === 'master' ? 'master' : 'thief';
  const withPendingUnlock = search.get('pending') === '1';

  const state = useMockMatch({ viewAs, withPendingUnlock });
  const [lastIntent, setLastIntent] = useState<Required<PlayIntent> | null>(null);

  const handleDispatch = useCallback((intent: Required<PlayIntent>) => {
    setLastIntent(intent);
  }, []);

  const isMaster = state.players[state.viewerID]?.faction === 'master';

  return (
    <>
      {isMaster ? (
        <MasterBoard state={state} onDispatch={handleDispatch} />
      ) : (
        <ThiefBoard state={state} onDispatch={handleDispatch} />
      )}
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
