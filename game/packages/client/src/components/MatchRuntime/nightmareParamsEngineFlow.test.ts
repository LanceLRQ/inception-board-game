// 梦魇附加参数的三处入口（白羊·星尘的应答、金库三选一）发出的 move，经真实引擎校验：
// 界面按参数形态拼出的参数引擎接受，缺参数（回音萦绕）引擎拒绝，邪念瘟疫点名的人拿到贿赂牌。
// 技能面板里的发动（梦主发动已翻开的梦魇、火星·杀戮）见 ActiveSkillPanel/skillEngineFlow.test.ts。

import { describe, it, expect } from 'vitest';
import {
  InceptionCityGame,
  applyMove,
  viewMatch,
  type GameDef,
  type MatchState,
  type MatchView,
} from '@icgame/game-engine';
import type { SetupState } from '@icgame/game-engine/setup';
import type { CardID } from '@icgame/shared';
import { buildFixtureMatch } from '../../match/fixtures/buildScenario';
import {
  computeVaultDecisionCommand,
  computeVaultDecisionState,
} from '../MasterNightmareDecisionBanner/logic';
import { EMPTY_NIGHTMARE_DRAFT } from '../../lib/nightmareParams';
import {
  EMPTY_DRAFT,
  awaitedActions,
  awaitedResponse,
  sheetCommand,
  type MineAwaited,
} from './response/awaitedResponse';

const game: GameDef<SetupState> = InceptionCityGame;
type S = MatchState<SetupState>;

function apply(state: S, seat: string, move: string, args: readonly unknown[]): S | null {
  const res = applyMove(game, state, { playerID: seat, move, args: [...args] });
  return res.ok ? res.state : null;
}

function withNightmare(state: S, layer: number, nightmareId: string): S {
  return {
    ...state,
    G: {
      ...state.G,
      layers: {
        ...state.G.layers,
        [layer]: { ...state.G.layers[layer]!, nightmareId: nightmareId as CardID },
      },
    },
  };
}

function ariesAwaited(state: S, seat: string): MineAwaited {
  const view = viewMatch(game, state, seat).G as MatchView;
  const found = awaitedResponse(view, seat);
  if (found === null || !found.mine) throw new Error('场景里本人应当有待应答的白羊选择');
  return found;
}

describe('白羊·星尘：附加参数经真实引擎', () => {
  it('回音萦绕：不带参数的发动被拒；弹窗拼出的参数被接受，心锁按所选方式改变', () => {
    const { state, viewer } = buildFixtureMatch('thief-pending-aries');
    const awaited = ariesAwaited(state, viewer);
    expect(awaited).toMatchObject({ kind: 'aries', params: 'echo' });
    expect(apply(state, viewer, 'playAriesStardustActivate', [])).toBeNull();
    const command = sheetCommand(awaited, 'aries-echo', {
      ...EMPTY_DRAFT,
      echoLayer: 1,
      echoAction: 'add',
    })!;
    const after = apply(state, viewer, command.move, command.args)!;
    expect(after).not.toBeNull();
    expect(after.G.layers[1]!.heartLockValue).toBe(state.G.layers[1]!.heartLockValue + 1);
    expect(after.G.pendingAriesChoice).toBeNull();
  });

  it('邪念瘟疫：点名的盗梦者收到贿赂牌，没点名又没有贿赂牌的进迷失层', () => {
    const base = buildFixtureMatch('thief-pending-aries');
    const { viewer } = base;
    const state = withNightmare(base.state, 2, 'nightmare_plague');
    const awaited = ariesAwaited(state, viewer);
    expect(awaited).toMatchObject({ kind: 'aries', params: 'plague' });
    if (awaited.kind !== 'aries') throw new Error('unreachable');
    // 候选：被击杀者所在层（第 2 层）存活的非梦主座位，包括白羊本人
    expect(awaited.candidates).toContain(viewer);
    expect(awaited.bribePoolCount).toBeGreaterThan(0);
    const named = awaited.candidates.find((id) => id !== viewer)!;
    // 发动按钮打开的是点名弹窗，而不是直接发 move
    expect(awaitedActions(awaited)[0]!.effect).toEqual({ type: 'sheet', sheet: 'aries-plague' });
    const command = sheetCommand(awaited, 'aries-plague', { ...EMPTY_DRAFT, bribed: [named] })!;
    expect(command.args).toEqual([{ bribedTargets: [named] }]);
    const after = apply(state, viewer, command.move, command.args)!;
    expect(after).not.toBeNull();
    expect(after.G.players[named]!.bribeReceived).toBe(1);
    expect(after.G.players[named]!.isAlive).toBe(true);
    // 白羊本人没点名也没有贿赂牌：进迷失层
    expect(after.G.players[viewer]!.isAlive).toBe(false);
  });

  it('邪念瘟疫：一个都不点名也被引擎接受（该层没有贿赂牌的盗梦者都进迷失层）', () => {
    const base = buildFixtureMatch('thief-pending-aries');
    const state = withNightmare(base.state, 2, 'nightmare_plague');
    const awaited = ariesAwaited(state, base.viewer);
    const command = sheetCommand(awaited, 'aries-plague', EMPTY_DRAFT)!;
    expect(apply(state, base.viewer, command.move, command.args)).not.toBeNull();
  });
});

describe('金库三选一：发动梦魇的附加参数经真实引擎', () => {
  function vaultScene(nightmareId: string): { state: S; master: string; opener: string } {
    const { state: base, viewer } = buildFixtureMatch('master');
    const opener = base.G.playerOrder.find((id) => id !== viewer)!;
    const layer = base.G.players[opener]!.currentLayer;
    const state = withNightmare(
      { ...base, G: { ...base.G, pendingVaultDecision: { layer, openerID: opener } } },
      layer,
      nightmareId,
    );
    return { state, master: viewer, opener };
  }

  function stateOf(state: S, seat: string) {
    return computeVaultDecisionState(viewMatch(game, state, seat).G as MatchView, seat);
  }

  it('回音萦绕：缺参数引擎拒绝，选完层与方式后被接受', () => {
    const { state, master } = vaultScene('nightmare_echo');
    const decision = stateOf(state, master);
    expect(decision.nightmareParams).toBe('echo');
    expect(apply(state, master, 'masterVaultDecision', ['nightmare'])).toBeNull();
    const draft = { poolIndex: null, echoLayer: 4, echoAction: 'restore' as const, bribed: [] };
    const cmd = computeVaultDecisionCommand(decision, 'nightmare', draft)!;
    expect(apply(state, master, cmd.move, cmd.args)).not.toBeNull();
  });

  it('邪念瘟疫：点名的盗梦者收到贿赂牌，开箱者也在候选里', () => {
    const { state, master, opener } = vaultScene('nightmare_plague');
    const decision = stateOf(state, master);
    expect(decision.nightmareParams).toBe('plague');
    expect(decision.plagueCandidates).toContain(opener);
    const cmd = computeVaultDecisionCommand(decision, 'nightmare', {
      poolIndex: null,
      echoLayer: null,
      echoAction: null,
      bribed: [opener],
    })!;
    expect(cmd.args).toEqual(['nightmare', { bribedTargets: [opener] }]);
    const after = apply(state, master, cmd.move, cmd.args)!;
    expect(after).not.toBeNull();
    expect(after.G.players[opener]!.bribeReceived).toBe(1);
    expect(after.G.pendingVaultDecision).toBeNull();
  });

  it('邪念瘟疫：不点名也能发动', () => {
    const { state, master } = vaultScene('nightmare_plague');
    const cmd = computeVaultDecisionCommand(stateOf(state, master), 'nightmare', {
      poolIndex: null,
      ...EMPTY_NIGHTMARE_DRAFT,
    })!;
    expect(apply(state, master, cmd.move, cmd.args)).not.toBeNull();
  });
});
