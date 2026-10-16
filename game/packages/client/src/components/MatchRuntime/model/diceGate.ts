// 掷骰闸门的展示模型：谁被点名、谁已经掷了、本人能不能掷；只读视图里公开的名单（续接参数不在视图里）

import type { DicePurpose, MatchView } from '@icgame/game-engine';

export interface DiceRollerRow {
  readonly id: string;
  readonly rolled: boolean;
  readonly mine: boolean;
}

export interface DiceGateModel {
  readonly id: number;
  readonly purpose: DicePurpose;
  readonly by: string | null;
  readonly target: string | null;
  readonly rollers: readonly DiceRollerRow[];
  readonly rolledCount: number;
  /** 本人被点名且还没掷 */
  readonly canRoll: boolean;
}

export function diceGateModel(
  view: MatchView | undefined,
  mySeat: string | null,
): DiceGateModel | null {
  const gate = view?.pendingDiceRoll;
  if (!gate) return null;
  const rollers = gate.rollers.map((id) => ({
    id,
    rolled: gate.rolled.includes(id),
    mine: id === mySeat,
  }));
  return {
    id: gate.id,
    purpose: gate.purpose,
    by: gate.by,
    target: gate.target,
    rollers,
    rolledCount: rollers.filter((r) => r.rolled).length,
    canRoll: rollers.some((r) => r.mine && !r.rolled),
  };
}

/** 本地对局的掷骰倒计时：从看到闸门起算，剩余整秒数（向上取整，不小于 0） */
export function diceSecondsLeft(seenAt: number, now: number, timeoutMs: number): number {
  return Math.max(0, Math.ceil((timeoutMs - (now - seenAt)) / 1000));
}
