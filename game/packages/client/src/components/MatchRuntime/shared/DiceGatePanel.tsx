// 掷骰弹层：引擎在掷骰之前停下等被点名的人报到。被点名且还没掷的人看到「掷骰」按钮，
// 其他人看到等待进度（多人时「正在等待其他玩家 x/n」，已掷的打勾）。点数由引擎在全员报到后掷出，
// 结果由动画层播放（dice_rolled）。到时限由服务端（本地对局由 Worker）代掷；固定场景不推进，不显示倒计时。
// 两个布局共用，样式钩子类名：ms-response / ms-btn。

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Dices, Hourglass } from 'lucide-react';
import { DICE_ROLL_TIMEOUT_MS } from '@icgame/game-engine';
import { cn } from '../../../lib/utils';
import type { MatchController } from '../controllerTypes';
import { monotonicNow, useSecondClock } from '../deadline';
import { diceGateModel, diceSecondsLeft } from '../model/diceGate';

/** 剩余秒数：联机读服务端截止时间，本地从看到闸门起算，固定场景没有 */
function useDiceSeconds(controller: MatchController, gateId: number | null): number | null {
  const local = controller.kind === 'local' && gateId !== null;
  // 按「上一次渲染时记下的闸门」在渲染中重置起点，不经 effect
  const [seen, setSeen] = useState<{ id: number; at: number } | null>(null);
  if (local && seen?.id !== gateId) setSeen({ id: gateId, at: monotonicNow() });
  const now = useSecondClock(local);
  if (controller.kind === 'remote') return controller.turn.deadlineSeconds;
  if (!local || seen === null) return null;
  return diceSecondsLeft(seen.at, now, DICE_ROLL_TIMEOUT_MS);
}

export function DiceGatePanel({ controller }: { controller: MatchController }) {
  const { t } = useTranslation();
  const gate = diceGateModel(controller.view, controller.viewerSeat || null);
  const seconds = useDiceSeconds(controller, gate?.id ?? null);
  const [sentFor, setSentFor] = useState<number | null>(null);
  if (!gate) return null;

  const name = (id: string) =>
    id === controller.viewerSeat ? t('fx.you') : controller.nicknameOf(id);
  const sent = sentFor === gate.id;
  const many = gate.rollers.length > 1;
  const waitingOn = gate.rollers.find((r) => !r.rolled);
  const fraction = seconds === null ? null : Math.min(1, (seconds * 1000) / DICE_ROLL_TIMEOUT_MS);
  const roll = () => {
    setSentFor(gate.id);
    void controller.makeMove('rollDice', []);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[28%] z-30 flex justify-center px-4">
      <div
        role="dialog"
        aria-label={t('diceGate.aria')}
        aria-live="polite"
        data-testid="dice-gate"
        data-can-roll={gate.canRoll || undefined}
        className="ms-response pointer-events-auto relative w-full max-w-sm overflow-hidden px-4 py-3.5"
      >
        {fraction !== null && (
          <i
            className="absolute top-0 left-0 h-0.5 bg-acc transition-[width] duration-1000 ease-linear"
            style={{ width: `${Math.round(fraction * 100)}%` }}
          />
        )}
        <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[.2em] text-acc">
          <Dices className="size-3.5 shrink-0" aria-hidden />
          {t(`diceGate.purpose.${gate.purpose}`)}
        </p>
        {gate.by !== null && (
          <p className="mt-1 text-xs text-muted-foreground">
            {gate.target !== null
              ? t('diceGate.versus', { by: name(gate.by), target: name(gate.target) })
              : t('diceGate.by', { by: name(gate.by) })}
          </p>
        )}
        {many && (
          <ul className="mt-2 flex flex-wrap gap-1.5" data-testid="dice-gate-rollers">
            {gate.rollers.map((r) => (
              <li
                key={r.id}
                data-rolled={r.rolled || undefined}
                className={cn(
                  'flex items-center gap-1 border px-1.5 py-0.5 text-[11px]',
                  r.rolled ? 'border-acc text-acc' : 'border-border text-muted-foreground',
                )}
              >
                {r.rolled ? (
                  <Check className="size-3" aria-label={t('diceGate.rolled')} />
                ) : (
                  <Hourglass className="size-3" aria-hidden />
                )}
                {name(r.id)}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex items-center gap-3">
          {gate.canRoll ? (
            <button
              type="button"
              disabled={sent}
              onClick={roll}
              data-testid="dice-roll-button"
              data-variant="primary"
              className="ms-btn flex min-h-10 items-center gap-2 px-5 text-sm tracking-[.14em] coarse:min-h-11"
            >
              <Dices className="size-4" aria-hidden />
              {t('diceGate.roll')}
            </button>
          ) : (
            <p className="text-xs text-foreground" data-testid="dice-gate-waiting">
              {many || !waitingOn
                ? t('diceGate.waiting', { done: gate.rolledCount, total: gate.rollers.length })
                : t('diceGate.waitingOne', { name: name(waitingOn.id) })}
            </p>
          )}
          {seconds !== null && (
            <span className="ml-auto font-mono text-[10px] text-faint">
              {t('diceGate.auto', { n: seconds })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
