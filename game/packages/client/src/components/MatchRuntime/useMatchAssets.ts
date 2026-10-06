// 对局的素材预加载：进入对局前取牌种全集与本人视图里可见的牌（显示真实进度），之后空闲时再取其余
//
// 进度只在这里记录，加载界面（MatchAssetGate）与顶栏的细进度线各取一份。
// 占位模式（VITE_ASSETS_MODE=placeholder）没有卡图可取，整个预加载直接跳过。

import { useEffect, useState } from 'react';
import type { MatchView } from '@icgame/game-engine';
import { logger } from '../../lib/logger';
import { isPlaceholderMode } from '../../lib/assetsMode';
import { cardAssets } from '../../lib/cardAssets';
import type { PreloadProgress as LoaderProgress } from '../../lib/assetPreloader';
import { visibleCardIds } from './assetIds';
import type { PreloadProgress } from './controllerTypes';

export interface MatchAssets {
  /** 进入对局前的加载进度；没开始或不需要为 null */
  readonly entry: PreloadProgress | null;
  /** 空闲阶段的后台进度（顶栏细线用）；没有或已淡出为 null */
  readonly background: PreloadProgress | null;
  /** 进入对局前的素材已经取完（含失败）或不需要取；之前加载界面可能挡在界面上，界面根节点据此打标记供端到端等待 */
  readonly entryDone: boolean;
}

const toProgress = (p: LoaderProgress): PreloadProgress => ({
  loaded: p.loaded,
  total: p.total,
  failed: p.failed.length,
});

/** 后台进度完成后多久淡出 */
const BACKGROUND_FADE_MS = 800;

/**
 * view 第一次就绪时开始：先取进对局前的素材，取完（含失败）再排空闲阶段。
 * 视图里的牌只在开始的那一刻读一次，之后新出现的牌由卡图组件按需加载。
 */
export function useMatchAssets(view: MatchView | undefined, seat: string | null): MatchAssets {
  const ready = view !== undefined && seat !== null;
  // 第一次就绪时记下要取的牌；之后不再变化（避免每个新视图都重新发起）
  const [startIds, setStartIds] = useState<string[] | null>(null);
  if (ready && startIds === null) setStartIds(visibleCardIds(view, seat));

  const [entry, setEntry] = useState<PreloadProgress | null>(null);
  const [background, setBackground] = useState<PreloadProgress | null>(null);
  const [entryDone, setEntryDone] = useState(false);

  useEffect(() => {
    if (startIds === null || isPlaceholderMode()) return;
    const ctrl = new AbortController();
    let fade: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const done = await cardAssets.preloadMatchEntry(
        startIds,
        (p) => {
          if (!ctrl.signal.aborted) setEntry(toProgress(p));
        },
        ctrl.signal,
      );
      logger.flow('game/assets', 'match entry assets loaded', {
        loaded: done.loaded,
        total: done.total,
        failed: done.failed.length,
        constrained: cardAssets.constrained,
      });
      if (ctrl.signal.aborted) return;
      setEntryDone(true);
      const idle = await cardAssets.preloadIdle((p) => {
        if (!ctrl.signal.aborted) setBackground(toProgress(p));
      }, ctrl.signal);
      if (idle) {
        logger.flow('game/assets', 'idle assets loaded', {
          loaded: idle.loaded,
          failed: idle.failed.length,
        });
        fade = setTimeout(() => setBackground(null), BACKGROUND_FADE_MS);
      } else {
        logger.flow('game/assets', 'idle assets skipped', { constrained: cardAssets.constrained });
      }
    })();
    return () => {
      ctrl.abort();
      if (fade !== undefined) clearTimeout(fade);
    };
  }, [startIds]);

  return { entry, background, entryDone: entryDone || isPlaceholderMode() };
}
