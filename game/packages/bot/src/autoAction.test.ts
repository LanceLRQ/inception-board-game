// 自动行动判定测试：状态在真实对局建出的局面上改写，保证结构与引擎一致

import { describe, it, expect } from 'vitest';
import { InceptionCityGame, sendToLimbo } from '@icgame/game-engine';
import type { SetupState } from '@icgame/game-engine/setup';
import { applyMove, createMatch, type GameDef, type MatchState } from '@icgame/game-engine/runner';
import { nextAutoAction } from './autoAction.js';

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
      expect(action).toMatchObject({ playerID: b, move: 'passResponse', args: [] });
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

  describe('4b. 金币金库打开后的梦主三选一', () => {
    const waiting = (s: State, opener: string): State =>
      withG(s, { pendingVaultDecision: { layer: 2, openerID: opener } });

    it('梦主是 Bot 且池里有可派的牌：选派贿赂牌，运行器接受', () => {
      const s = playingState();
      const opener = othersOf(s, 1)[0]!;
      const pending = waiting(s, opener);
      expect(pending.G.bribePool.some((b) => b.status === 'inPool')).toBe(true);
      const action = nextAutoAction(pending, NO_HUMAN);
      expect(action).toMatchObject({
        playerID: s.G.dreamMasterID,
        move: 'masterVaultDecision',
        args: ['bribe'],
      });
      const res = applyMove(game, pending, action!);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.state.G.players[opener]!.bribeReceived).toBe(1);
        expect(res.state.G.pendingVaultDecision).toBeNull();
      }
    });

    it('梦主是 Bot 且池里没有可派的牌：选弃掉梦魇，运行器接受', () => {
      const s = playingState();
      const opener = othersOf(s, 1)[0]!;
      const emptied = withG(waiting(s, opener), {
        bribePool: s.G.bribePool.map((b) => ({ ...b, status: 'dealt' as const, heldBy: opener })),
      });
      const action = nextAutoAction(emptied, NO_HUMAN);
      expect(action).toMatchObject({
        playerID: s.G.dreamMasterID,
        move: 'masterVaultDecision',
        args: ['discard'],
      });
      expect(applyMove(game, emptied, action!).ok).toBe(true);
    });

    it('全 Bot 的 4–10 人局：挂起后 Bot 梦主一步就清掉等待状态，对局继续', () => {
      for (let n = 4; n <= 10; n++) {
        const s = playingState(n, `vault-${n}`);
        const pending = waiting(s, othersOf(s, 1)[0]!);
        const action = nextAutoAction(pending, NO_HUMAN);
        expect(action?.move, `${n} 人`).toBe('masterVaultDecision');
        const res = applyMove(game, pending, action!);
        expect(res.ok, `${n} 人`).toBe(true);
        if (res.ok) {
          expect(res.state.G.pendingVaultDecision).toBeNull();
          expect(nextAutoAction(res.state, NO_HUMAN)?.move).not.toBe('masterVaultDecision');
        }
      }
    });

    it('梦主是真人：返回 null', () => {
      const s = playingState();
      const pending = waiting(s, othersOf(s, 1)[0]!);
      expect(nextAutoAction(pending, { humanPlayerIDs: [s.G.dreamMasterID] })).toBeNull();
    });

    it('有真人盗梦者、梦主是 Bot：Bot 梦主照样应答', () => {
      const s = playingState();
      const [opener, human] = s.ctx.playOrder.filter((id) => id !== s.G.dreamMasterID) as [
        string,
        string,
      ];
      const action = nextAutoAction(waiting(s, opener), { humanPlayerIDs: [human] });
      expect(action).toMatchObject({ move: 'masterVaultDecision' });
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

    it('轮到真人（分牌的目标 / 挑牌的发动者）时等他操作，返回 null', () => {
      const s = libraState(null);
      const target = s.G.pendingLibra!.targetPlayerID;
      expect(nextAutoAction(s, { humanPlayerIDs: [target] })).toBeNull();
      const picked = libraState({ pile1: ['a'], pile2: ['b'] });
      const bonder = picked.G.pendingLibra!.bonderPlayerID;
      expect(nextAutoAction(picked, { humanPlayerIDs: [bonder] })).toBeNull();
    });

    it('真人只是另一方时，仍由 Bot 以本人名义代答', () => {
      const s = libraState(null);
      const bonder = s.G.pendingLibra!.bonderPlayerID;
      expect(nextAutoAction(s, { humanPlayerIDs: [bonder] })).toMatchObject({
        move: 'resolveLibraSplit',
      });
      const picked = libraState({ pile1: ['a'], pile2: ['b'] });
      const target = picked.G.pendingLibra!.targetPlayerID;
      expect(nextAutoAction(picked, { humanPlayerIDs: [target] })).toMatchObject({
        move: 'resolveLibraPick',
      });
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

    it('目标是真人：等他应答，返回 null', () => {
      for (const responseType of ['pisces', 'terrorist'] as const) {
        const s = shootResponseState(responseType);
        const target = s.G.pendingShootResponse!.targetPlayerID;
        expect(nextAutoAction(s, { humanPlayerIDs: [target] })).toBeNull();
      }
    });

    it('目标不是真人：真人在场也由 Bot 以目标本人名义代答', () => {
      const s = shootResponseState('pisces');
      expect(nextAutoAction(s, { humanPlayerIDs: [s.ctx.currentPlayer] })).toMatchObject({
        move: 'respondShootPass',
      });
    });

    it('目标是 Bot：以目标本人的名义放弃闪避 / 接受惩罚，经运行器执行后待结算被清空', () => {
      for (const responseType of ['pisces', 'terrorist'] as const) {
        const s = shootResponseState(responseType);
        const action = nextAutoAction(s, NO_HUMAN)!;
        expect(action.playerID).toBe(s.G.pendingShootResponse!.targetPlayerID);
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

    it('处女是真人：等她选择，返回 null', () => {
      const s = virgoState();
      const virgo = s.G.pendingVirgoChoice!.virgoID;
      expect(nextAutoAction(s, { humanPlayerIDs: [virgo] })).toBeNull();
    });

    it('真人是回合主人、处女是 Bot：以处女本人名义放弃，运行器接受', () => {
      const s = virgoState();
      const human = s.ctx.currentPlayer;
      const action = nextAutoAction(s, { humanPlayerIDs: [human] });
      expect(action).toMatchObject({ playerID: s.G.pendingVirgoChoice!.virgoID });
      const res = applyMove(game, s, action!);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.state.G.pendingVirgoChoice).toBeNull();
    });

    it('经运行器执行后 pendingVirgoChoice 被清空', () => {
      const s = virgoState();
      const action = nextAutoAction(s, NO_HUMAN)!;
      expect(action.playerID).toBe(s.G.pendingVirgoChoice!.virgoID);
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

describe('nextAutoAction · 盗梦者全部在迷失层', () => {
  /** 把所有盗梦者送进迷失层，回合交给第一个盗梦者的抽牌阶段 */
  function allThievesInLimbo(): State {
    const s = playingState(5, 'limbo-all');
    let G = s.G;
    const thieves = G.playerOrder.filter((id) => id !== G.dreamMasterID);
    for (const id of thieves) G = sendToLimbo(G, id);
    const first = thieves[0]!;
    return {
      ...s,
      G: { ...G, currentPlayerID: first, turnPhase: 'draw' },
      ctx: { ...s.ctx, currentPlayer: first, playOrderPos: s.ctx.playOrder.indexOf(first) },
    };
  }

  it('迷失层玩家的回合一路推进到回合结束，每一步都被运行器接受，不返回 null', () => {
    let s = allThievesInLimbo();
    const owner = s.ctx.currentPlayer;
    const seen: string[] = [];
    for (let i = 0; i < 6 && s.ctx.currentPlayer === owner; i++) {
      const action = nextAutoAction(s, NO_HUMAN);
      expect(action, `第 ${i + 1} 步不应为 null`).not.toBeNull();
      seen.push(action!.move);
      const res = applyMove(game, s, action!);
      expect(res.ok, `${action!.move} 应被接受`).toBe(true);
      if (!res.ok) return;
      s = res.state;
    }
    expect(s.ctx.currentPlayer).not.toBe(owner);
    expect(s.ctx.gameover).toBeUndefined();
    expect(seen[0]).toBe('doDraw');
  });
});
