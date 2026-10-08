import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from '@icgame/game-engine';
import type { SetupState } from '@icgame/game-engine/setup';
import { applyMove, createMatch, type GameDef, type MatchState } from '@icgame/game-engine/runner';
import { DEFAULT_TIMING, planNext, timeoutAction, type TimingConfig } from './scheduling.js';

const game: GameDef<SetupState> = InceptionCityGame;
const timing: TimingConfig = { botStepDelayMs: 111, pendingTimeoutMs: 2222, turnTimeoutMs: 33_333 };

function newMatch(n = 5): MatchState<SetupState> {
  return createMatch(game, { numPlayers: n, setupData: { rngSeed: 'sched' }, seed: 'sched' });
}

/** 走完布置阶段，进入回合主人正常行动 */
function afterSetup(n = 5): MatchState<SetupState> {
  const s = newMatch(n);
  const out = applyMove(game, s, {
    playerID: s.ctx.currentPlayer,
    move: 'completeSetup',
    args: [],
  });
  if (!out.ok) throw new Error('setup failed');
  return out.state;
}

const allSeats = (n: number): string[] => Array.from({ length: n }, (_, i) => String(i));

describe('planNext', () => {
  it('布置阶段直接给出自动动作与短延迟', () => {
    const plan = planNext(newMatch(), allSeats(5), timing);
    expect(plan.kind).toBe('auto');
    if (plan.kind === 'auto') {
      expect(plan.delayMs).toBe(111);
      expect(plan.action.move).toBe('completeSetup');
    }
  });

  it('全部座位自动时，回合内也给出自动动作', () => {
    const plan = planNext(afterSetup(), [], timing);
    expect(plan.kind).toBe('auto');
  });

  it('轮到真人时挂回合截止，时长取回合时长', () => {
    const plan = planNext(afterSetup(), allSeats(5), timing);
    expect(plan).toEqual({ kind: 'deadline', delayMs: 33_333 });
  });

  it('响应窗口用窗口自己的时长', () => {
    const s = afterSetup();
    const withWindow = {
      ...s,
      G: {
        ...s.G,
        pendingResponseWindow: { responders: ['1'], responded: [], timeoutMs: 7777 },
      },
    } as unknown as MatchState<SetupState>;
    expect(planNext(withWindow, allSeats(5), timing)).toEqual({ kind: 'deadline', delayMs: 7777 });
  });

  it('响应窗口的时长受上限约束，上限更大时仍用窗口自己的', () => {
    const s = afterSetup();
    const withWindow = {
      ...s,
      G: {
        ...s.G,
        pendingResponseWindow: { responders: ['1'], responded: [], timeoutMs: 7777 },
      },
    } as unknown as MatchState<SetupState>;
    expect(planNext(withWindow, allSeats(5), { ...timing, responseTimeoutCapMs: 50 })).toEqual({
      kind: 'deadline',
      delayMs: 50,
    });
    expect(planNext(withWindow, allSeats(5), { ...timing, responseTimeoutCapMs: 99_999 })).toEqual({
      kind: 'deadline',
      delayMs: 7777,
    });
  });

  it('其他待结算事项用待结算时长', () => {
    const s = afterSetup();
    const pending = {
      ...s,
      G: { ...s.G, pendingGraft: { playerID: '1' } },
    } as unknown as MatchState<SetupState>;
    const plan = planNext(pending, allSeats(5), timing);
    expect(plan).toEqual({ kind: 'deadline', delayMs: 2222 });
  });

  it('不挡住其他行动的待选择不缩短回合主人的时限', () => {
    const s = afterSetup();
    const owner = s.ctx.currentPlayer;
    const other = s.ctx.playOrder.find((id) => id !== owner)!;
    const pending = {
      ...s,
      G: {
        ...s.G,
        turnPhase: 'action',
        pendingAriesChoice: { ariesID: other, victimLayer: 1, victimID: owner },
      },
    } as unknown as MatchState<SetupState>;
    const plan = planNext(pending, allSeats(5), timing);
    expect(plan).toEqual({ kind: 'deadline', delayMs: 33_333 });
  });

  it('轮到真人应答（被 SHOOT、天秤分牌、处女）时不立刻代答：挂待结算时限，到时限才由系统代答', () => {
    const s = afterSetup();
    const owner = s.ctx.currentPlayer;
    const human = s.ctx.playOrder.find((id) => id !== owner)!;
    const pendings: Array<[string, Record<string, unknown>, string]> = [
      [
        '被 SHOOT 的双鱼',
        {
          pendingShootResponse: {
            shooterID: owner,
            targetPlayerID: human,
            cardId: 'action_shoot',
            sameLayerRequired: false,
            deathFaces: [1],
            moveFaces: [2],
            extraOnMove: null,
            responseType: 'pisces',
          },
        },
        'respondShootPass',
      ],
      [
        '天秤分牌',
        { pendingLibra: { bonderPlayerID: owner, targetPlayerID: human, split: null } },
        'resolveLibraSplit',
      ],
      [
        '处女',
        { pendingVirgoChoice: { virgoID: human, triggerRoll: 6, shooterID: owner } },
        'respondVirgoPerfect',
      ],
      [
        '黑洞·吞噬的交牌',
        { turnPhase: 'draw', pendingBlackHoleLevy: { blackHoleID: owner, waiting: [human] } },
        'respondBlackHoleLevy',
      ],
      ['达尔文·淘汰的选牌', { pendingDarwinReturn: { playerID: human } }, 'respondDarwinReturn'],
      [
        '雅典娜·急智的应答',
        {
          pendingAthenaWit: {
            athenaID: human,
            userID: owner,
            cardId: 'action_kick',
            move: 'playKick',
            args: ['action_kick', human],
          },
        },
        'respondAthenaWit',
      ],
    ];
    for (const [label, patch, timeoutMove] of pendings) {
      const state = {
        ...s,
        G: { ...s.G, turnPhase: 'action', ...patch },
      } as unknown as MatchState<SetupState>;
      // 该座位是真人：不返回自动动作，而是挂待结算的时限
      expect(planNext(state, [human], timing), label).toEqual({ kind: 'deadline', delayMs: 2222 });
      // 座位是 Bot（或到时限以全部自动代答）：由系统以本人名义代答
      expect(planNext(state, [], timing).kind, label).toBe('auto');
      expect(timeoutAction(state), label).toMatchObject({
        playerID: expect.any(String),
        move: timeoutMove,
      });
    }
  });

  it('对局已结束返回 none', () => {
    const s = afterSetup();
    const over = {
      ...s,
      ctx: { ...s.ctx, gameover: { winner: 'thief' } },
    } as MatchState<SetupState>;
    expect(planNext(over, [], timing)).toEqual({ kind: 'none' });
  });

  it('默认时长符合约定', () => {
    expect(DEFAULT_TIMING).toEqual({
      botStepDelayMs: 600,
      pendingTimeoutMs: 45_000,
      turnTimeoutMs: 120_000,
    });
  });
});

describe('timeoutAction', () => {
  it('轮到真人时仍能代发一步', () => {
    const s = afterSetup();
    expect(planNext(s, allSeats(5), timing).kind).toBe('deadline');
    const action = timeoutAction(s);
    expect(action).not.toBeNull();
    expect(action?.playerID).toBeDefined();
  });

  it('对局已结束时取不到动作', () => {
    const s = afterSetup();
    const over = {
      ...s,
      ctx: { ...s.ctx, gameover: { winner: 'thief' } },
    } as MatchState<SetupState>;
    expect(timeoutAction(over)).toBeNull();
  });
});
