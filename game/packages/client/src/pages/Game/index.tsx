// Game · 对局容器
// 根据玩家阵营分派到 ThiefBoard / MasterBoard
// B6 阶段：使用 useMockMatch 产出过滤后状态；B7 WS 接入后切到真实 store。

import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ThiefBoard } from './ThiefBoard/index.js';
import { MasterBoard } from './MasterBoard/index.js';
import { useMockMatch } from '../../hooks/useMockMatch.js';
import type { PlayIntent } from '../../hooks/useGameActions.js';

export default function Game() {
  // 开发期 URL 参数驱动视角切换：?as=master 体验梦主视角；?pending=1 打开响应窗口
  const [search] = useSearchParams();
  const viewAs = search.get('as') === 'master' ? 'master' : 'thief';
  const withPendingUnlock = search.get('pending') === '1';

  const state = useMockMatch({ viewAs, withPendingUnlock });
  const [lastIntent, setLastIntent] = useState<Required<PlayIntent> | null>(null);

  const handleDispatch = useCallback((intent: Required<PlayIntent>) => {
    setLastIntent(intent);
    // TODO(B7): WS 派发到服务端 MoveGateway
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
    </>
  );
}
