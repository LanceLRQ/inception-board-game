// 不可信参数的模糊测试
//
// 联机后 move 的参数来自客户端。运行器会把 move 里抛出的异常当作拒绝，所以崩溃不是问题；
// 要守住的是：类型不对的参数要么被拒绝（状态原样不动），要么接受后状态的每个位置仍然类型正确。
// 随机对局用固定种子，整个测试的规模按 60 秒预算取舍。

import { describe, it, expect } from 'vitest';
import { ACTION_CARDS, MASTER_CHARACTERS, THIEF_CHARACTERS } from '@icgame/shared';
import { InceptionCityGame } from '../game.js';
import type { SetupState } from '../setup.js';
import { BLOCKING_FIELDS, listAwaiting } from './actionRights.js';
import { knownMoves } from './validator.js';
import { checkStateInvariants } from './stateInvariants.js';
import { applyMove, createMatch, type GameDef, type MatchState } from '../runner/matchRunner.js';
import {
  fuzzCandidate,
  makeRandomSource,
  makeTestRng,
  moveParamNames,
  pickLegalMove,
} from '../runner/moveFuzzer.js';

const game: GameDef<SetupState> = InceptionCityGame;

/** 一组恶意值：每次只放进参数的某一个位置，或铺满全部位置 */
function maliciousValues(): { label: string; value: unknown }[] {
  const protoObject: unknown = JSON.parse('{"__proto__":{"polluted":true},"a":1}');
  return [
    { label: '0', value: 0 },
    { label: '1', value: 1 },
    { label: '负数', value: -1 },
    { label: '小数', value: 1.5 },
    { label: '大数', value: 2 ** 53 },
    { label: '99', value: 99 },
    { label: 'NaN→null', value: null },
    { label: 'true', value: true },
    { label: 'false', value: false },
    { label: '空串', value: '' },
    { label: '超长串', value: 'x'.repeat(5000) },
    { label: '__proto__', value: '__proto__' },
    { label: 'constructor', value: 'constructor' },
    { label: 'toString', value: 'toString' },
    { label: '不存在的玩家', value: 'nobody' },
    { label: '嵌套对象', value: { a: { b: [1, 2, { c: null }] } } },
    { label: '带__proto__键的对象', value: protoObject },
    { label: '空对象', value: {} },
    { label: '空数组', value: [] },
    { label: '含null的数组', value: [null] },
    { label: '含数字的数组', value: [1, 2] },
    { label: '含对象的数组', value: [{}] },
    { label: '含非玩家串的数组', value: ['nobody', 'x'] },
    { label: '长度1000的串数组', value: Array.from({ length: 1000 }, () => 'x') },
    { label: '长度1000的数字数组', value: Array.from({ length: 1000 }, () => 0) },
  ];
}

const BAD = maliciousValues();

interface Attempt {
  label: string;
  args: unknown[];
}

/** 给定一个尽量合法的参数基线，列出对这个 move 的全部试探 */
function attemptsFor(base: unknown[], arity: number): Attempt[] {
  const out: Attempt[] = [{ label: '无参数', args: [] }];
  const padded = [...base];
  while (padded.length < arity) padded.push(undefined);
  out.push({ label: '合法参数后多出参数', args: [...base, 'extra', { x: 1 }] });
  for (const bad of BAD) {
    out.push({
      label: `全部位置=${bad.label}`,
      args: Array.from({ length: Math.max(arity, 1) }, () => bad.value),
    });
    for (let i = 0; i < arity; i++) {
      const args = [...padded];
      args[i] = bad.value;
      out.push({ label: `第${i + 1}个=${bad.label}`, args });
    }
  }
  return out;
}

interface Bucket {
  tried: number;
  accepted: number;
  rejected: number;
}

interface Failure {
  move: string;
  seat: string;
  attempt: string;
  args: string;
  problem: string;
}

function describeArgs(args: unknown[]): string {
  const text = JSON.stringify(args, (_k, v) => (v === undefined ? '__undefined__' : v));
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

interface Scenario {
  s: MatchState<SetupState>;
  /** 为 true 时每个座位都试（含没有行动权的座位）；否则只试此刻有行动权的座位 */
  allSeats: boolean;
  /** 只试这些 move；缺省为当前阶段的全部 move */
  onlyMoves?: readonly string[];
}

const ACTION_CARD_IDS: string[] = ACTION_CARDS.map((c) => c.id).filter(
  (id) => id !== 'action_back',
);
const THIEF_IDS: string[] = THIEF_CHARACTERS.map((c) => c.id);
const MASTER_IDS: string[] = MASTER_CHARACTERS.map((c) => c.id);

/** 把某个座位设为回合主人并进入行动阶段，手里拿全各种行动牌 */
function asActionTurn(
  s: MatchState<SetupState>,
  seat: string,
  turnPhase: SetupState['turnPhase'] = 'action',
): MatchState<SetupState> {
  const players = { ...s.G.players };
  players[seat] = { ...players[seat]!, isAlive: true, deathTurn: null, hand: [...ACTION_CARD_IDS] };
  return {
    ...s,
    G: { ...s.G, players, currentPlayerID: seat, turnPhase },
    ctx: { ...s.ctx, currentPlayer: seat, playOrderPos: s.ctx.playOrder.indexOf(seat) },
  };
}

function withCharacter(
  s: MatchState<SetupState>,
  seat: string,
  characterId: string,
): MatchState<SetupState> {
  const faction = characterId.startsWith('dm_') ? 'master' : 'thief';
  const players = { ...s.G.players, [seat]: { ...s.G.players[seat]!, characterId, faction } };
  return { ...s, G: { ...s.G, players } } as MatchState<SetupState>;
}

/** 让除 seat 之外的第一个玩家死亡，给复活类技能留出目标 */
function withDeadBystander(s: MatchState<SetupState>, seat: string): MatchState<SetupState> {
  const victim = s.ctx.playOrder.find((id) => id !== seat && id !== s.G.dreamMasterID)!;
  const players = {
    ...s.G.players,
    [victim]: {
      ...s.G.players[victim]!,
      isAlive: false,
      deathTurn: 1,
      hand: [],
      currentLayer: 0 as const,
    },
  };
  return { ...s, G: { ...s.G, players } };
}

function awaitingMoves(s: MatchState<SetupState>): string[] {
  return listAwaiting(s.G).flatMap((entry) => [...entry.moves]);
}

/**
 * 在一个基线局面上构造各类待结算状态，让响应类 move 有机会被接受。
 * 返回 [状态, 该状态下的行动者]，行动者的角色会被换成各种角色。
 */
function pendingScenarios(
  base: MatchState<SetupState>,
): { s: MatchState<SetupState>; actor: string }[] {
  const owner = base.ctx.currentPlayer;
  const other = base.ctx.playOrder.find((id) => id !== owner)!;
  const third = base.ctx.playOrder.find((id) => id !== owner && id !== other)!;
  const card = 'action_shoot';
  const withG = (patch: Partial<SetupState>): MatchState<SetupState> => ({
    ...base,
    G: { ...base.G, ...patch },
  });
  const window = (responders: string[]): SetupState['pendingResponseWindow'] => ({
    sourceAbilityID: 'action_unlock',
    responders,
    responded: [],
    timeoutMs: 1000,
    validResponseAbilityIDs: ['action_cancel_unlock', 'action_unlock'],
    onTimeout: 'resolve',
    parentWindow: null,
  });
  const shootResponse = (responseType: 'pisces' | 'terrorist') => ({
    shooterID: owner,
    targetPlayerID: other,
    cardId: card,
    sameLayerRequired: false,
    deathFaces: [1, 2],
    moveFaces: [3, 4],
    extraOnMove: null,
    responseType,
  });
  const otherHand = { ...base.G.players[other]!, hand: [...ACTION_CARD_IDS.slice(0, 5)] };
  const rich = (patch: Partial<SetupState>): MatchState<SetupState> =>
    withG({ ...patch, players: { ...base.G.players, [other]: otherHand } });
  return [
    { s: withG({ pendingGraft: { playerID: owner } }), actor: owner },
    {
      s: withG({
        pendingGravity: {
          bonderPlayerID: owner,
          targetIds: [other],
          pool: ['action_shoot', 'action_kick', 'action_unlock'],
          pickOrder: [owner, other],
          pickCursor: 0,
        },
      }),
      actor: owner,
    },
    {
      s: withG({
        pendingShootMove: {
          shooterID: owner,
          targetPlayerID: other,
          cardId: card,
          extraOnMove: null,
          choices: [1, 3],
        },
      }),
      actor: owner,
    },
    {
      s: withG({
        pendingSudgerRolls: {
          rollA: 2,
          rollB: 5,
          targetPlayerID: other,
          cardId: card,
          deathFaces: [1, 2],
          moveFaces: [3, 4],
          extraOnMove: null,
        },
      }),
      actor: owner,
    },
    {
      s: rich({ pendingLibra: { bonderPlayerID: owner, targetPlayerID: other, split: null } }),
      actor: other,
    },
    {
      s: rich({
        pendingLibra: {
          bonderPlayerID: owner,
          targetPlayerID: other,
          split: { pile1: ['action_shoot'], pile2: ['action_kick', 'action_unlock'] },
        },
      }),
      actor: owner,
    },
    {
      s: withG({
        pendingUnlock: { playerID: owner, layer: 1, cardId: 'action_unlock' },
        pendingResponseWindow: window([other, third]),
      }),
      actor: other,
    },
    {
      s: withG({ pendingUnlock: { playerID: owner, layer: 1, cardId: 'action_unlock' } }),
      actor: owner,
    },
    {
      s: withG({ pendingPeekDecision: { peekerID: owner, targetLayer: 2 } }),
      actor: base.G.dreamMasterID,
    },
    {
      s: withG({ peekReveal: { peekerID: owner, revealKind: 'vault', vaultLayer: 2 } }),
      actor: owner,
    },
    {
      s: withG({ peekReveal: { peekerID: owner, revealKind: 'bribe', targetThiefID: other } }),
      actor: owner,
    },
    {
      s: withG({ pendingVirgoChoice: { virgoID: other, triggerRoll: 6, shooterID: owner } }),
      actor: other,
    },
    { s: withG({ pendingShootResponse: shootResponse('pisces') }), actor: other },
    { s: withG({ pendingShootResponse: shootResponse('terrorist') }), actor: other },
    {
      s: withG({ pendingAriesChoice: { ariesID: other, victimLayer: 1, victimID: owner } }),
      actor: other,
    },
    {
      s: withG({ pendingResonance: { bonderPlayerID: owner, targetPlayerID: other } }),
      actor: owner,
    },
  ];
}

/** 收集一批真实局面：随机对局途中按间隔取样，各类待结算状态全取 */
function collectScenarios(): { scenarios: Scenario[]; legalViolations: string[] } {
  const scenarios: Scenario[] = [];
  const legalViolations: string[] = [];
  const settleTaken = new Map<string, number>();
  const actionBases: MatchState<SetupState>[] = [];
  for (const n of [4, 5, 6, 7, 8, 9, 10]) {
    for (const k of [1, 2]) {
      const seed = `fuzz-${n}-${k}`;
      let s = createMatch(game, { numPlayers: n, setupData: { rngSeed: seed }, seed });
      const start = applyMove(game, s, { playerID: '0', move: 'completeSetup', args: [] });
      if (!start.ok) throw new Error('completeSetup 被拒绝');
      s = start.state;
      const rnd = makeTestRng(k * 131 + n);
      for (let step = 0; step < 220 && s.ctx.gameover === undefined; step++) {
        const issues = checkStateInvariants(s.G);
        if (issues.length > 0) legalViolations.push(`${seed}#${step}: ${issues[0]}`);
        let take = step % 22 === 0;
        for (const field of BLOCKING_FIELDS) {
          if (s.G[field] && (settleTaken.get(field) ?? 0) < 3) {
            settleTaken.set(field, (settleTaken.get(field) ?? 0) + 1);
            take = true;
          }
        }
        if (take) scenarios.push({ s, allSeats: true });
        if (n <= 6 && k === 1 && step === 6) actionBases.push(s);
        const cand = pickLegalMove(game, s, rnd, { preferSettle: step % 5 !== 0 });
        if (!cand) break;
        const res = applyMove(game, s, cand);
        if (!res.ok) break;
        s = res.state;
      }
    }
  }

  // 角色专属 move：让回合主人依次换成每个角色，并给足行动牌
  const base = actionBases.slice(0, 3);
  for (const b of base) {
    const master = b.G.dreamMasterID;
    const thief = b.ctx.playOrder.find((id) => id !== master)!;
    for (const id of THIEF_IDS) {
      const prepared = asActionTurn(withCharacter(b, thief, id), thief);
      scenarios.push({ s: prepared, allSeats: false });
      scenarios.push({ s: withDeadBystander(prepared, thief), allSeats: false });
    }
    for (const id of MASTER_IDS) {
      const prepared = asActionTurn(withCharacter(b, master, id), master);
      scenarios.push({ s: prepared, allSeats: false });
      scenarios.push({ s: withDeadBystander(prepared, master), allSeats: false });
    }
  }

  // 抽牌阶段才能发的技能（小丑·赌博、黑天鹅·巡演等）
  const drawBase = base[0]!;
  const drawThief = drawBase.ctx.playOrder.find((id) => id !== drawBase.G.dreamMasterID)!;
  for (const id of THIEF_IDS) {
    scenarios.push({
      s: asActionTurn(withCharacter(drawBase, drawThief, id), drawThief, 'draw'),
      allSeats: false,
    });
  }
  for (const id of MASTER_IDS) {
    const m = drawBase.G.dreamMasterID;
    scenarios.push({ s: asActionTurn(withCharacter(drawBase, m, id), m, 'draw'), allSeats: false });
  }

  // 待结算专属 move：每类待结算状态里，把行动者换成各种角色
  for (const b of base.slice(0, 2)) {
    const owner = b.ctx.currentPlayer;
    for (const { s, actor } of pendingScenarios(asActionTurn(b, owner))) {
      for (const id of [...THIEF_IDS, ...MASTER_IDS]) {
        const variant = withCharacter(s, actor, id);
        scenarios.push({ s: variant, allSeats: false, onlyMoves: awaitingMoves(variant) });
      }
    }
  }
  return { scenarios, legalViolations };
}

describe('不可信参数模糊测试', () => {
  it(
    '恶意参数要么被拒绝且状态不变，要么接受后状态每个位置的类型仍然正确',
    { timeout: 120_000 },
    () => {
      const started = Date.now();
      const { scenarios, legalViolations } = collectScenarios();
      const buckets = new Map<string, Bucket>();
      for (const name of knownMoves('playing'))
        buckets.set(name, { tried: 0, accepted: 0, rejected: 0 });
      const failures = new Map<string, Failure>();
      const protoKeysBefore = Object.getOwnPropertyNames(Object.prototype).sort().join(',');

      // 允许出现的牌 id：全部行动牌，以及各局面里已经出现过的牌
      const allowedCards = new Set<string>(ACTION_CARD_IDS);
      for (const { s } of scenarios) {
        for (const c of [...s.G.deck.cards, ...s.G.deck.discardPile, ...s.G.removedFromGame]) {
          allowedCards.add(c);
        }
        for (const p of Object.values(s.G.players)) p.hand.forEach((c) => allowedCards.add(c));
      }

      const probeRandom = makeRandomSource(makeTestRng(4242));
      const rnd = makeTestRng(99);

      const verify = (
        s: MatchState<SetupState>,
        snapshot: string,
        move: string,
        seat: string,
        attempt: Attempt,
      ): void => {
        const bucket = buckets.get(move);
        if (!bucket) return;
        bucket.tried++;
        const res = applyMove(
          game,
          s,
          { playerID: seat, move, args: attempt.args },
          { random: probeRandom },
        );
        const report = (problem: string): void => {
          if (!failures.has(move)) {
            failures.set(move, {
              move,
              seat,
              attempt: attempt.label,
              args: describeArgs(attempt.args),
              problem,
            });
          }
        };
        if (JSON.stringify(s.G) !== snapshot) report('输入状态被原地改动');
        if (!res.ok) {
          bucket.rejected++;
          return;
        }
        bucket.accepted++;
        const issues = checkStateInvariants(res.state.G);
        if (issues.length > 0) report(`状态违规: ${issues[0]}`);
        const invalid = InceptionCityGame.validate(res.state.G);
        if (invalid !== null) report(`validate 不通过: ${invalid}`);
        const G = res.state.G;
        for (const c of [
          ...G.deck.cards,
          ...G.deck.discardPile,
          ...G.removedFromGame,
          ...Object.values(G.players).flatMap((p) => p.hand),
        ]) {
          if (typeof c === 'string' && !allowedCards.has(c)) {
            report(`凭空出现的牌: ${c.slice(0, 20)}`);
            break;
          }
        }
      };

      for (const { s, allSeats, onlyMoves } of scenarios) {
        const snapshot = JSON.stringify(s.G);
        const holders = new Set<string>([s.ctx.currentPlayer]);
        for (const entry of listAwaiting(s.G)) entry.actors.forEach((id) => holders.add(id));
        const phaseMoves = game.phases[s.ctx.phase ?? 'playing']!.moves ?? {};
        for (const move of onlyMoves ?? Object.keys(phaseMoves)) {
          const arity = moveParamNames(phaseMoves[move]!.move).length;
          for (const seat of allSeats ? s.ctx.playOrder : [...holders]) {
            const hasRights =
              holders.has(seat) ||
              game.actionRights?.({ G: s.G, ctx: s.ctx, playerID: seat, move }) === true;
            if (!hasRights) {
              // 没有行动权的座位只做一次轻量试探，确认被挡在 move 之外
              verify(s, snapshot, move, seat, { label: '无行动权', args: [BAD[0]!.value, 'x'] });
              continue;
            }
            // 尽量找到一个合法的参数基线，再逐位替换成恶意值
            let base = fuzzCandidate(game, s, move, seat, rnd);
            for (let i = 0; i < 6; i++) {
              if (applyMove(game, s, base, { random: probeRandom }).ok) break;
              base = fuzzCandidate(game, s, move, seat, rnd);
            }
            for (const attempt of attemptsFor(base.args, arity))
              verify(s, snapshot, move, seat, attempt);
          }
        }
      }

      expect(Object.getOwnPropertyNames(Object.prototype).sort().join(',')).toBe(protoKeysBefore);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();

      const totals = [...buckets.values()].reduce(
        (acc, b) => ({
          tried: acc.tried + b.tried,
          accepted: acc.accepted + b.accepted,
          rejected: acc.rejected + b.rejected,
        }),
        { tried: 0, accepted: 0, rejected: 0 },
      );
      const untried = [...buckets.entries()].filter(([, b]) => b.tried === 0).map(([name]) => name);
      const elapsed = Date.now() - started;
      expect({ untried }).toEqual({ untried: [] });
      expect(totals.accepted).toBeGreaterThan(0);
      expect(totals.rejected).toBeGreaterThan(0);
      expect(scenarios.length).toBeGreaterThan(100);
      expect(elapsed).toBeLessThan(60_000);
      expect([...failures.values()]).toEqual([]);

      // 合法参数下状态也违反不变量的既有问题：单独记下，不在这里修
      expect(legalViolations).toEqual([]);
    },
  );
});
