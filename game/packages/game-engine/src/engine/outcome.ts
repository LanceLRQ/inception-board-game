// 对局结果：胜负记在运行器的 ctx.gameover 里（由结束判定返回），不在对局状态里。
// 视图、事件与服务端归档都从这里取，避免各处各读各的。
// 对照：docs/manual/01-game-overview.md 胜负条件

import type { Faction } from '@icgame/shared';
import type { SetupState } from '../setup.js';

export interface MatchOutcome {
  /** 获胜阵营；对局未结束或没有胜方时为 null */
  winner: Faction | null;
  reason: string | null;
}

function asFaction(value: unknown): Faction | null {
  return value === 'thief' || value === 'master' ? value : null;
}

/**
 * 读出对局结果。gameover 是运行器 ctx.gameover 的值（未结束为 undefined）。
 * gameover 里没带的部分回落到状态里的同名字段。
 */
export function matchOutcome(
  gameover: unknown,
  G: Pick<SetupState, 'winner' | 'winReason'>,
): MatchOutcome {
  const detail =
    typeof gameover === 'object' && gameover !== null
      ? (gameover as { winner?: unknown; reason?: unknown })
      : {};
  return {
    winner: asFaction(detail.winner) ?? G.winner,
    reason: typeof detail.reason === 'string' ? detail.reason : G.winReason,
  };
}
