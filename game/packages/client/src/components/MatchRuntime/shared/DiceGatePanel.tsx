// 掷骰弹层：引擎在掷骰之前停下等被点名的人报到。被点名且还没掷的人看到「掷骰」按钮，
// 其他人看到等待进度（多人时「正在等待其他玩家 x/n」，已掷的打勾）。点数由引擎在全员报到后掷出，
// 结果由动画层播放（dice_rolled）。到时限由服务端（本地对局由 Worker）代掷；固定场景不推进，不显示倒计时。
// 两个布局共用，样式钩子类名：ms-response / ms-btn。

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Dices, Hourglass } from 'lucide-react';
import { DICE_ROLL_TIMEOUT_MS } from '@icgame/game-engine';
import { Dialog } from '../../ui/dialog';
import { Die3D } from '../../Die/Die3D';
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
  if (!controller.view) return null;
  return (
    <DicePresentation
      key={`${controller.view.matchId}:${controller.viewerSeat}`}
      controller={controller}
    />
  );
}

function DicePresentation({ controller }: { controller: MatchController }) {
  const { t } = useTranslation();
  const gate = diceGateModel(controller.view, controller.viewerSeat || null);
  const result = controller.view?.lastDiceRoll;
  const seconds = useDiceSeconds(controller, gate?.id ?? null);
  const key = gate ? `gate:${gate.id}` : result ? `result:${result.id}` : null;
  const [closed, setClosed] = useState<string | null>(gate ? null : key);
  const [review, setReview] = useState<string | null>(null);
  const [sentFor, setSentFor] = useState<number | null>(null);
  if (!key) return null;
  const open = closed !== key && (!controller.winner || review === key);
  const name = (id: string) =>
    id === controller.viewerSeat ? t('fx.you') : controller.nicknameOf(id);
  const sent = gate && sentFor === gate.id;
  const current = gate ?? result!;
  const roll = async () => {
    if (!gate?.canRoll || sent) return;
    setSentFor(gate.id);
    const outcome = await controller.makeMove('rollDice', []);
    if (!outcome.ok) setSentFor(null);
  };
  return (
    <>
      {!open && (
        <button
          type="button"
          className="tabletop-dice-resume"
          onClick={() => {
            setClosed(null);
            setReview(key);
          }}
        >
          {gate ? '继续掷骰' : '查看上次掷骰'}
        </button>
      )}
      <Dialog
        open={open}
        onOpenChange={(open) => {
          if (!open) setClosed(key);
        }}
        blocking={false}
        showClose={false}
        className="tabletop-dice-dialog"
        data-testid="dice-gate"
        aria-label={t('diceGate.aria')}
      >
        <header className="tabletop-dialog-header">
          <span>掷骰 · {t(`diceGate.purpose.${current.purpose}`)}</span>
          <button type="button" onClick={() => setClosed(key)}>
            收起
          </button>
        </header>
        <h2>
          {gate ? (sent ? '等待结果' : gate.canRoll ? '准备掷骰' : '等待其他玩家') : '掷骰结果'}
        </h2>
        {current.by && (
          <p className="tabletop-dice-description">
            {current.target
              ? t('diceGate.versus', { by: name(current.by), target: name(current.target) })
              : t('diceGate.by', { by: name(current.by) })}
          </p>
        )}
        <div className="tabletop-dice-stage" data-rolling={sent || undefined}>
          <div className="tabletop-dice-floor" />
          {gate ? (
            <div className="tabletop-dice-preview" aria-hidden>
              <Die3D value={1} size={64} seconds={0} spin={0} />
            </div>
          ) : (
            <div className="tabletop-dice-results">
              {result!.rolls.map((row) => (
                <div key={row.player}>
                  <span>{name(row.player)}</span>
                  <div>
                    {row.dice.map((value, i) => (
                      <Die3D
                        key={`${result!.id}:${row.player}:${i}`}
                        value={value}
                        size={64}
                        seconds={0.85}
                      />
                    ))}
                  </div>
                  <strong>{row.dice.join('、')} 点</strong>
                </div>
              ))}
            </div>
          )}
        </div>
        {gate && gate.rollers.length > 1 && (
          <ul className="tabletop-dice-rollers" data-testid="dice-gate-rollers">
            {gate.rollers.map((r) => (
              <li key={r.id} data-rolled={r.rolled || undefined}>
                {r.rolled ? <Check size={14} /> : <Hourglass size={14} />}
                {name(r.id)}
              </li>
            ))}
          </ul>
        )}
        <p className="tabletop-dice-status" role="status">
          {gate
            ? sent
              ? '已请求掷骰，等待引擎结算。'
              : gate.canRoll
                ? '准备好后点击掷骰'
                : t('diceGate.waiting', { done: gate.rolledCount, total: gate.rollers.length })
            : '点数由本局规则引擎产生，按角色与世界观继续结算。'}
        </p>
        {seconds !== null && (
          <p className="tabletop-dice-description">{t('diceGate.auto', { n: seconds })}</p>
        )}
        {gate?.canRoll ? (
          <button
            type="button"
            className="tabletop-primary"
            data-testid="dice-roll-button"
            disabled={!!sent}
            onClick={() => void roll()}
          >
            <Dices size={18} />
            {sent ? '等待结果…' : t('diceGate.roll')}
          </button>
        ) : (
          !gate && (
            <button type="button" className="tabletop-primary" onClick={() => setClosed(key)}>
              继续结算
            </button>
          )
        )}
      </Dialog>
    </>
  );
}
