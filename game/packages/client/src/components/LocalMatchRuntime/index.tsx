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
  /** 把这局存档到本机，刷新后可以继续（/local 页开） */
  readonly persist?: boolean;
  /** 从存档恢复这局 */
  readonly resume?: boolean;
  /** 要求恢复但存档不可用，已开了新局 */
  readonly onResumeFallback?: () => void;
  /** 固定种子（端到端与走查用）；不给就每局随机 */
  readonly seed?: string;
}

export function LocalMatchRuntime({
  playerCount,
  matchId,
  topRight,
  onRestart,
  persist,
  resume,
  onResumeFallback,
  seed,
}: LocalMatchRuntimeProps) {
  const [restartKey, setRestartKey] = useState(0);
  const source = useLocalMatchSource({
    playerCount,
    matchId,
    restartKey,
    persist,
    resume,
    onResumeFallback,
    seed,
  });

  const handleRestart = useCallback(() => {
    if (onRestart) onRestart();
    else setRestartKey((n) => n + 1);
  }, [onRestart]);

  return <MatchRuntime source={source} topRight={topRight} onRestart={handleRestart} />;
}
