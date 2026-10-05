// 自动行动判定测试：状态在真实对局建出的局面上改写，保证结构与引擎一致

import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from '@icgame/game-engine';
import type { SetupState } from '@icgame/game-engine/setup';
import { applyMove, createMatch, type GameDef, type MatchState } from '@icgame/game-engine/runner';
import { nextAutoAction, RESPONSE_MOVES } from './autoAction.js';

const game: GameDef<SetupState> = InceptionCityGame;

type State = MatchState<SetupState>;

function setupState(numPlayers = 5, seed = 'auto'): State {
  return createMatch(game, { numPlayers, setupData: { rngSeed: seed }, seed });
}

function playingState(numPlayers = 5, seed = 'auto'): State {
  const s = setupState(numPlayers, seed);
  const res = applyMove(game, s, {
    playerID: s.ctx.currentPlayer,
    move: 'completeSetup',
    args: [],
  });
  if (!res.ok) throw new Error('completeSetup 被拒绝');
  return res.state;
}

function withG(state: State, patch: Partial<SetupState>): State {
  return { ...state, G: { ...state.G, ...patch } };
}

/** 回合主人之外的玩家 ID（按座位顺序取前 n 个） */
function othersOf(state: State, n: number): string[] {
  return state.ctx.playOrder.filter((id) => id !== state.ctx.currentPlayer).slice(0, n);
}

const NO_HUMAN = { humanPlayerIDs: [] as string[] };

describe('nextAutoAction · 判定顺序', () => {
  it('1. 对局已结束返回 null', () => {
    const s = playingState();
    const over: State = { ...s, ctx: { ...s.ctx, gameover: { winner: 'thief' } } };
    expect(nextAutoAction(over, NO_HUMAN)).toBeNull();
  });

  it('2. setup 阶段由回合主人发 completeSetup', () => {
    const s = setupState();
    expect(s.ctx.phase).toBe('setup');
    const action = nextAutoAction(s, NO_HUMAN);
    expect(action).toMatchObject({
      playerID: s.ctx.currentPlayer,
      move: 'completeSetup',
      args: [],
    });
  });

  describe('3. 响应窗口', () => {
    const makeWindow = (s: State, responders: string[], responded: string[]): State =>
      withG(s, {
        pendingResponseWindow: {
          sourceAbilityID: 'action_unlock_effect_1',
          responders,
          responded,
          timeoutMs: 0,
          validResponseAbilityIDs: [],
          onTimeout: 'resolve',
        },
      });

    it('第一个未响应的响应者是 Bot：响应者本人发 passResponse，运行器接受', () => {
      const s = playingState();
      const [a, b] = othersOf(s, 2) as [string, string];
      const pending = makeWindow(s, [a, b], [a]);
      const action = nextAutoAction(pending, NO_HUMAN);
      expect(action).toMatchObject({ playerID: b, move: 'passResponse', args: [b] });
      expect(applyMove(game, pending, action!).ok).toBe(true);
    });

    it('第一个未响应的响应者是真人：返回 null', () => {
      const s = playingState();
      const [a, b] = othersOf(s, 2) as [string, string];
      expect(nextAutoAction(makeWindow(s, [a, b], []), { humanPlayerIDs: [a] })).toBeNull();
    });
  });

  describe('4. 梦境窥视的梦主决策', () => {
    it('梦主是 Bot：梦主本人发 masterPeekBribeDecision(false)，运行器接受', () => {
      const s = playingState();
      const peeker = othersOf(s, 1)[0]!;
      const pending = withG(s, { pendingPeekDecision: { peekerID: peeker, targetLayer: 1 } });
      const action = nextAutoAction(pending, NO_HUMAN);
      expect(action).toMatchObject({
        playerID: s.G.dreamMasterID,
        move: 'masterPeekBribeDecision',
        args: [false],
      });
      expect(applyMove(game, pending, action!).ok).toBe(true);
    });

    it('梦主是真人：返回 null', () => {
      const s = playingState();
      const peeker = othersOf(s, 1)[0]!;
      const pending = withG(s, { pendingPeekDecision: { peekerID: peeker, targetLayer: 1 } });
      expect(nextAutoAction(pending, { humanPlayerIDs: [s.G.dreamMasterID] })).toBeNull();
    });
  });

  describe('5. 窥视结果确认', () => {
    it('看牌者是 Bot：看牌者本人发 peekerAcknowledge，运行器接受', () => {
      const s = playingState();
      const peeker = othersOf(s, 1)[0]!;
      const pending = withG(s, {
        peekReveal: { peekerID: peeker, revealKind: 'vault', vaultLayer: 1 },
      });
      const action = nextAutoAction(pending, NO_HUMAN);
      expect(action).toMatchObject({ playerID: peeker, move: 'peekerAcknowledge', args: [] });
      expect(applyMove(game, pending, action!).ok).toBe(true);
    });

    it('看牌者是真人：返回 null', () => {
      const s = playingState();
      const peeker = othersOf(s, 1)[0]!;
      const pending = withG(s, {
        peekReveal: { peekerID: peeker, revealKind: 'vault', vaultLayer: 1 },
      });
      expect(nextAutoAction(pending, { humanPlayerIDs: [peeker] })).toBeNull();
    });
  });

  describe('6. 天秤', () => {
    function libraState(split: { pile1: string[]; pile2: string[] } | null): State {
      const s = playingState();
      const target = othersOf(s, 1)[0]!;
      const hand = ['a', 'b', 'c'];
      return withG(s, {
        players: { ...s.G.players, [target]: { ...s.G.players[target]!, hand } },
        pendingLibra: { bonderPlayerID: s.ctx.currentPlayer, targetPlayerID: target, split },
      });
    }

    it('还没分牌：target 本人发 resolveLibraSplit，两堆合起来正好是 target 的手牌', () => {
      const s = libraState(null);
      const action = nextAutoAction(s, NO_HUMAN);
      expect(action?.playerID).toBe(s.G.pendingLibra!.targetPlayerID);
      expect(action?.move).toBe('resolveLibraSplit');
      expect(applyMove(game, s, action!).ok).toBe(true);
      const [pile1, pile2] = action!.args as [string[], string[]];
      expect([...pile1, ...pile2].sort()).toEqual(['a', 'b', 'c']);
    });

    it('已分牌：bonder 本人发 resolveLibraPick，选张数多的一堆', () => {
      const s = libraState({ pile1: ['a'], pile2: ['b', 'c'] });
      const action = nextAutoAction(s, NO_HUMAN);
      expect(action).toMatchObject({
        playerID: s.G.pendingLibra!.bonderPlayerID,
        move: 'resolveLibraPick',
        args: ['pile2'],
      });
      expect(applyMove(game, s, action!).ok).toBe(true);
    });

    it('引擎对天秤两步都不核对发起者，所以真人参与时也由回合主人代发（单机没有分牌界面）', () => {
      const s = libraState(null);
      const target = s.G.pendingLibra!.targetPlayerID;
      expect(nextAutoAction(s, { humanPlayerIDs: [target] })?.move).toBe('resolveLibraSplit');
      const picked = libraState({ pile1: ['a'], pile2: ['b'] });
      expect(nextAutoAction(picked, { humanPlayerIDs: [picked.ctx.currentPlayer] })?.move).toBe(
        'resolveLibraPick',
      );
    });
  });

  describe('7. SHOOT 响应窗口', () => {
    function shootResponseState(responseType?: 'pisces' | 'terrorist'): State {
      const s = playingState();
      const target = othersOf(s, 1)[0]!;
      const shooter = s.G.players[s.ctx.currentPlayer]!;
      return withG(s, {
        // 引擎重入 SHOOT 结算时要求发动者手里还有这张牌
        players: {
          ...s.G.players,
          [shooter.id]: { ...shooter, hand: [...shooter.hand, 'action_shoot'] },
        },
        pendingShootResponse: {
          shooterID: s.ctx.currentPlayer,
          targetPlayerID: target,
          cardId: 'action_shoot',
          sameLayerRequired: false,
          deathFaces: [1],
          moveFaces: [2],
          extraOnMove: null,
          ...(responseType ? { responseType } : {}),
        },
      });
    }

    it('双鱼窗口、目标是 Bot：以目标本人的名义放弃闪避', () => {
      const s = shootResponseState('pisces');
      const target = s.G.pendingShootResponse!.targetPlayerID;
      expect(nextAutoAction(s, NO_HUMAN)).toMatchObject({
        playerID: target,
        move: 'respondShootPass',
        args: [],
      });
    });

    it('未标注响应类型按双鱼处理', () => {
      const s = shootResponseState();
      expect(nextAutoAction(s, NO_HUMAN)?.move).toBe('respondShootPass');
    });

    it('恐怖分子窗口、目标是 Bot：以目标本人的名义接受 -1 惩罚而不弃牌', () => {
      const s = shootResponseState('terrorist');
      const target = s.G.pendingShootResponse!.targetPlayerID;
      expect(nextAutoAction(s, NO_HUMAN)).toMatchObject({
        playerID: target,
        move: 'respondTerroristAccept',
        args: [],
      });
    });

    it('目标是真人：返回 null', () => {
      const s = shootResponseState('pisces');
      const target = s.G.pendingShootResponse!.targetPlayerID;
      expect(nextAutoAction(s, { humanPlayerIDs: [target] })).toBeNull();
    });

    it('RESPONSE_MOVES 收录这些响应 move，经运行器执行后待结算被清空', () => {
      for (const responseType of ['pisces', 'terrorist'] as const) {
        const s = shootResponseState(responseType);
        const action = nextAutoAction(s, NO_HUMAN)!;
        expect(RESPONSE_MOVES.has(action.move)).toBe(true);
        const res = applyMove(game, s, action);
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.state.G.pendingShootResponse).toBeNull();
      }
    });
  });

  describe('8. 处女·完美', () => {
    function virgoState(): State {
      const s = playingState();
      const virgo = othersOf(s, 1)[0]!;
      return withG(s, {
        pendingVirgoChoice: { virgoID: virgo, triggerRoll: 6, shooterID: s.ctx.currentPlayer },
      });
    }

    it('处女是 Bot：以处女本人的名义选择 skip', () => {
      const s = virgoState();
      const virgo = s.G.pendingVirgoChoice!.virgoID;
      expect(nextAutoAction(s, NO_HUMAN)).toMatchObject({
        playerID: virgo,
        move: 'respondVirgoPerfect',
        args: ['skip'],
      });
    });

    it('处女是真人：同样以处女本人的名义自动选择 skip，避免对局停住', () => {
      const s = virgoState();
      const virgo = s.G.pendingVirgoChoice!.virgoID;
      expect(nextAutoAction(s, { humanPlayerIDs: [virgo] })).toMatchObject({
        playerID: virgo,
        move: 'respondVirgoPerfect',
        args: ['skip'],
      });
    });

    it('真人是回合主人且是处女：自动动作被运行器接受，pendingVirgoChoice 被清空', () => {
      const base = playingState();
      const human = base.ctx.currentPlayer;
      const s = withG(base, {
        pendingVirgoChoice: { virgoID: human, triggerRoll: 6, shooterID: human },
      });
      const action = nextAutoAction(s, { humanPlayerIDs: [human] });
      expect(action).not.toBeNull();
      const res = applyMove(game, s, action!);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.state.G.pendingVirgoChoice).toBeNull();
    });

    it('经运行器执行后 pendingVirgoChoice 被清空', () => {
      const s = virgoState();
      const action = nextAutoAction(s, NO_HUMAN)!;
      expect(RESPONSE_MOVES.has(action.move)).toBe(true);
      const res = applyMove(game, s, action);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.state.G.pendingVirgoChoice).toBeNull();
    });
  });

  it('9. 回合主人是真人：返回 null', () => {
    const s = playingState();
    expect(nextAutoAction(s, { humanPlayerIDs: [s.ctx.currentPlayer] })).toBeNull();
  });

  describe('10. Bot 的回合', () => {
    it('抽牌阶段选 doDraw，由回合主人发起', () => {
      const s = playingState();
      expect(s.G.turnPhase).toBe('draw');
      expect(nextAutoAction(s, NO_HUMAN)).toMatchObject({
        playerID: s.ctx.currentPlayer,
        move: 'doDraw',
        args: [],
      });
    });

    it('其他玩家是真人时不影响 Bot 回合', () => {
      const s = playingState();
      const human = othersOf(s, 1)[0]!;
      expect(nextAutoAction(s, { humanPlayerIDs: [human] })?.move).toBe('doDraw');
    });

    it('选不出 move 时返回 null', () => {
      const s = playingState();
      const stuck = withG(s, { turnPhase: 'turnEnd' });
      expect(nextAutoAction(stuck, NO_HUMAN)).toBeNull();
    });
  });

  it('待结算优先于回合：有响应窗口时不去选回合内的 move', () => {
    const s = playingState();
    const [a] = othersOf(s, 1) as [string];
    const pending = withG(s, {
      pendingResponseWindow: {
        sourceAbilityID: 'action_unlock_effect_1',
        responders: [a],
        responded: [],
        timeoutMs: 0,
        validResponseAbilityIDs: [],
        onTimeout: 'resolve',
      },
    });
    expect(nextAutoAction(pending, NO_HUMAN)?.move).toBe('passResponse');
  });
});
