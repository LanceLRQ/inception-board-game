// 本地人机对局：把本机 Worker 提供的对局来源接到通用的对局界面上。
// 可用于 /local 页，也可用于好友房 1 人类 + N AI 模式。

import { useCallback, useState } from 'react';
import { useLocalMatchSource } from '../../match/useLocalMatchSource';
import { MatchRuntime } from '../MatchRuntime';

interface LocalMatchRuntimeProps {
  readonly playerCount: number;
  /** 可选外部 matchID（好友房从服务端拿到） */
  readonly matchId?: string;
  /** 顶部状态栏右上角补充文字（好友房可显示房间码） */
  readonly topRight?: React.ReactNode;
  /** 结束/重开回调；未传则显示内置"再来一局"按钮 */
  readonly onRestart?: () => void;
}

export function LocalMatchRuntime({
  playerCount,
  matchId,
  topRight,
  onRestart,
}: LocalMatchRuntimeProps) {
  const [restartKey, setRestartKey] = useState(0);
  const source = useLocalMatchSource({ playerCount, matchId, restartKey });

  const handleRestart = useCallback(() => {
    if (onRestart) onRestart();
    else setRestartKey((n) => n + 1);
  }, [onRestart]);

  return <MatchRuntime source={source} topRight={topRight} onRestart={handleRestart} />;
}
