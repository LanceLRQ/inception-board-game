// LocalMatch · 人机对战页面
// 对照：plans/design/08-security-ai.md §8.5 / plans/tasks.md W9
//
// 交互流：
//   1. 选择人数 → started=true
//   2. LocalMatchRuntime 创建 Worker、驱动对局，渲染棋盘 + 角色信息 + 主动技能面板
//   3. 再来一局 → 重置 started 回到人数选择

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Play } from 'lucide-react';
import { cn } from '../../lib/utils';
import { LocalMatchRuntime } from '../../components/LocalMatchRuntime';

export default function LocalMatch() {
  const { t } = useTranslation();
  const [playerCount, setPlayerCount] = useState(4);
  const [started, setStarted] = useState(false);

  const handleRestart = useCallback(() => {
    setStarted(false);
  }, []);

  // === 游戏未开始：人数选择界面 ===
  if (!started) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-foreground">
        <h1 className="mb-6 text-2xl font-bold">
          <Users className="mr-2 inline-block h-6 w-6" />
          {t('localMatch.title', { defaultValue: '人机对战' })}
        </h1>

        <div className="mb-6 flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            {t('localMatch.playerCount', { defaultValue: '玩家人数' })}
          </span>
          {[4, 5, 6].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPlayerCount(n)}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium transition-colors',
                playerCount === n
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70',
              )}
            >
              {n}
            </button>
          ))}
        </div>

        <p className="mb-4 text-xs text-muted-foreground">
          {t('localMatch.humanPlusBot', {
            count: playerCount - 1,
            defaultValue: `你 + ${playerCount - 1} 个 AI`,
          })}
        </p>

        <button
          type="button"
          onClick={() => setStarted(true)}
          className="flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:scale-95"
        >
          <Play className="h-4 w-4" />
          {t('localMatch.start', { defaultValue: '开始游戏' })}
        </button>
      </div>
    );
  }

  // === 游戏中：交给 LocalMatchRuntime（含角色信息 + 主动技能面板） ===
  return <LocalMatchRuntime playerCount={playerCount} onRestart={handleRestart} />;
}
