// LocalMatch · 人机对战页面
//
// 交互流：
//   0. 进入页面先看本机有没有未结束的存档：有就问「继续上一局 / 开新局」
//   1. 选择人数 → 开始
//   2. LocalMatchRuntime 创建 Worker、驱动对局（并把进度存到本机），渲染棋盘 + 角色信息 + 主动技能面板
//   3. 再来一局 → 回到人数选择

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { History, Play, Plus, RotateCcw, Users } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatSavedAt } from '../../lib/formatSavedAt';
import { clearLocalSave, readLocalSaveMeta } from '../../lib/localSaveAccess';
import type { LocalSaveMeta } from '../../lib/localMatchSave';
import { logger } from '../../lib/logger';
import { toast } from '../../lib/toast';
import { LocalMatchRuntime } from '../../components/LocalMatchRuntime';
import { Button } from '@/components/ui/button';

type Stage =
  | { kind: 'checking' }
  | { kind: 'prompt'; meta: LocalSaveMeta; savedAtLabel: string }
  | { kind: 'select' }
  | { kind: 'playing'; resume: boolean };

export default function LocalMatch() {
  const { t, i18n } = useTranslation();
  const [playerCount, setPlayerCount] = useState(4);
  const [stage, setStage] = useState<Stage>({ kind: 'checking' });

  // 进入页面时看一眼有没有未结束的存档
  useEffect(() => {
    let live = true;
    void readLocalSaveMeta()
      .then((meta) => {
        if (!live) return;
        if (meta) {
          logger.flow('game', 'unfinished local match found', {
            playerCount: meta.playerCount,
            turn: meta.turn,
          });
          setStage({
            kind: 'prompt',
            meta,
            savedAtLabel: formatSavedAt(meta.savedAt, Date.now(), i18n.language),
          });
        } else {
          setStage({ kind: 'select' });
        }
      })
      .catch((err: unknown) => {
        logger.warn('game', 'reading local save failed', err);
        if (live) setStage({ kind: 'select' });
      });
    return () => {
      live = false;
    };
  }, [i18n]);

  const handleContinue = useCallback((meta: LocalSaveMeta) => {
    logger.flow('game', 'continue saved local match', { playerCount: meta.playerCount });
    setPlayerCount(meta.playerCount);
    setStage({ kind: 'playing', resume: true });
  }, []);

  const handleNewMatch = useCallback(async () => {
    await clearLocalSave();
    logger.flow('game', 'discard saved local match');
    setStage({ kind: 'select' });
  }, []);

  const handleRestart = useCallback(() => {
    setStage({ kind: 'select' });
  }, []);

  const handleResumeFallback = useCallback(() => {
    toast.warn(t('localMatch.resumeFailed'));
  }, [t]);

  if (stage.kind === 'checking') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-dim">
        {t('common.loading')}
      </div>
    );
  }

  // === 有未结束的存档：继续还是开新局 ===
  if (stage.kind === 'prompt') {
    const { meta } = stage;
    return (
      <div
        className="flex min-h-dvh flex-col items-center justify-center bg-background p-6 text-foreground"
        data-testid="local-resume-prompt"
      >
        <h1 className="mb-2 flex items-center text-2xl font-bold">
          <History className="mr-2 inline-block h-6 w-6" />
          {t('localMatch.resumeTitle')}
        </h1>
        <p className="mb-6 text-center text-sm text-dim" data-testid="local-resume-summary">
          {t('localMatch.resumeSummary', {
            count: meta.playerCount,
            turn: meta.turn,
            time: stage.savedAtLabel,
          })}
        </p>
        <div className="flex w-full max-w-xs flex-col gap-3">
          <Button
            type="button"
            onClick={() => handleContinue(meta)}
            className="h-11 gap-2 px-4 font-bold"
            data-testid="local-resume-continue"
          >
            <RotateCcw size={16} />
            {t('localMatch.resumeContinue')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleNewMatch()}
            className="h-11 gap-2 border-line-strong px-4 font-bold"
            data-testid="local-resume-new"
          >
            <Plus size={16} />
            {t('localMatch.resumeNew')}
          </Button>
        </div>
      </div>
    );
  }

  // === 游戏未开始：人数选择界面 ===
  if (stage.kind === 'select') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background p-6 text-foreground">
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
              aria-pressed={playerCount === n}
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-full border text-sm font-medium transition-colors',
                playerCount === n
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input bg-muted text-muted-foreground hover:bg-muted/70',
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
          onClick={() => setStage({ kind: 'playing', resume: false })}
          className="flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:scale-95"
        >
          <Play className="h-4 w-4" />
          {t('localMatch.start', { defaultValue: '开始游戏' })}
        </button>
      </div>
    );
  }

  // === 游戏中：交给 LocalMatchRuntime（含角色信息 + 主动技能面板） ===
  return (
    <LocalMatchRuntime
      playerCount={playerCount}
      onRestart={handleRestart}
      persist
      resume={stage.resume}
      onResumeFallback={handleResumeFallback}
    />
  );
}
