import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from '../game.js';
import type { SetupState } from '../setup.js';
import { applyMove, createMatch, type GameDef } from '../runner/matchRunner.js';
import { makeTestRng, pickLegalMove } from '../runner/moveFuzzer.js';
import { checkStateInvariants } from './stateInvariants.js';

const game: GameDef<SetupState> = InceptionCityGame;

function started(n: number, seed: string): SetupState {
  const s = createMatch(game, { numPlayers: n, setupData: { rngSeed: seed }, seed });
  const res = applyMove(game, s, { playerID: '0', move: 'completeSetup', args: [] });
  if (!res.ok) throw new Error('completeSetup 被拒绝');
  return res.state.G;
}

function clone(G: SetupState): SetupState {
  return JSON.parse(JSON.stringify(G)) as SetupState;
}

/** 在克隆出来的状态上执行修改，返回违规描述 */
function inject(mutate: (G: SetupState, a: string, b: string) => void): string[] {
  const G = clone(started(5, 'inject'));
  const [a, b] = G.playerOrder as [string, string];
  mutate(G, a, b);
  return checkStateInvariants(G);
}

describe('checkStateInvariants', () => {
  it('合法的开局与随机对局途中的状态通过', () => {
    for (let n = 4; n <= 10; n++) {
      let s = createMatch(game, {
        numPlayers: n,
        setupData: { rngSeed: `ok-${n}` },
        seed: `ok-${n}`,
      });
      expect(checkStateInvariants(s.G)).toEqual([]);
      const rnd = makeTestRng(n);
      const first = applyMove(game, s, { playerID: '0', move: 'completeSetup', args: [] });
      if (!first.ok) throw new Error('completeSetup 被拒绝');
      s = first.state;
      for (let step = 0; step < 150 && s.ctx.gameover === undefined; step++) {
        expect(checkStateInvariants(s.G)).toEqual([]);
        const cand = pickLegalMove(game, s, rnd, { preferSettle: false });
        if (!cand) break;
        const res = applyMove(game, s, cand);
        if (!res.ok) break;
        s = res.state;
      }
    }
  }, 60_000);

  it('对非对象与缺字段的输入不抛异常', () => {
    expect(checkStateInvariants(null).length).toBeGreaterThan(0);
    expect(checkStateInvariants({}).length).toBeGreaterThan(0);
    expect(checkStateInvariants({ playerOrder: ['0'], players: 3 }).length).toBeGreaterThan(0);
  });

  it('没有实体牌的哈雷·冲击：应答窗口与选层挂起都合法', () => {
    const issues = inject((G, a, b) => {
      G.pendingShootResponse = {
        shooterID: a,
        targetPlayerID: b,
        cardId: null,
        sameLayerRequired: false,
        deathFaces: [1],
        moveFaces: [2, 3, 4],
        extraOnMove: null,
        skill: 'haley_impact',
      };
      G.pendingShootMove = {
        shooterID: a,
        targetPlayerID: b,
        cardId: null,
        extraOnMove: null,
        choices: [1, 3],
      };
    });
    expect(issues).toEqual([]);
  });

  describe('迷失层与死亡、层内名单的一致性', () => {
    it('在迷失层却还活着', () => {
      const issues = inject((G, a) => {
        G.players[a]!.currentLayer = 0 as never;
        G.layers[1]!.playersInLayer = G.layers[1]!.playersInLayer.filter((id) => id !== a);
        G.layers[0] = { ...G.layers[1]!, playersInLayer: [a] };
      });
      expect(issues.some((i) => i.includes('迷失层') && i.includes('isAlive'))).toBe(true);
    });

    it('已死亡却不在迷失层', () => {
      const issues = inject((G, a) => {
        G.players[a]!.isAlive = false;
        G.players[a]!.deathTurn = 1;
      });
      expect(issues.some((i) => i.includes('迷失层') && i.includes('isAlive'))).toBe(true);
    });

    it('玩家所在层的名单里没有他', () => {
      const issues = inject((G, a) => {
        G.layers[1]!.playersInLayer = G.layers[1]!.playersInLayer.filter((id) => id !== a);
      });
      expect(issues.some((i) => i.includes('playersInLayer'))).toBe(true);
    });

    it('名单里列着的玩家实际在别的层', () => {
      const issues = inject((G, a) => {
        G.layers[2]!.playersInLayer = [a];
      });
      expect(issues.some((i) => i.includes('playersInLayer'))).toBe(true);
    });

    it('已死亡的玩家出现在迷失层名单里时通过', () => {
      const issues = inject((G, a) => {
        G.players[a]!.isAlive = false;
        G.players[a]!.deathTurn = 1;
        G.players[a]!.currentLayer = 0 as never;
        G.layers[1]!.playersInLayer = G.layers[1]!.playersInLayer.filter((id) => id !== a);
        G.layers[0] = { ...G.layers[1]!, playersInLayer: [a] };
      });
      expect(issues).toEqual([]);
    });
  });

  const cases: [string, string, (G: SetupState, a: string, b: string) => void][] = [
    [
      '当前行动者不是玩家',
      'currentPlayerID',
      (G) => ((G as never as Record<string, unknown>).currentPlayerID = 7),
    ],
    ['梦主 id 不存在', 'dreamMasterID', (G) => (G.dreamMasterID = 'nobody')],
    ['层内名单里有数字', 'playersInLayer', (G) => (G.layers[1]!.playersInLayer = [1 as never])],
    ['金库开启者不存在', 'openedBy', (G) => (G.vaults[0]!.openedBy = 'x')],
    ['贿赂牌持有者是数字', 'heldBy', (G) => (G.bribePool[0]!.heldBy = 3 as never)],
    ['贿赂牌原主不存在', 'originalOwnerId', (G) => (G.bribePool[0]!.originalOwnerId = 'x')],
    ['手牌里有对象', 'hand', (G, a) => (G.players[a]!.hand = [{} as never])],
    ['手牌里有空位', 'hand', (G, a) => (G.players[a]!.hand = new Array(2) as never)],
    ['牌库里有 null', 'deck.cards', (G) => (G.deck.cards = [null as never])],
    ['弃牌堆里有数字', 'discardPile', (G) => (G.deck.discardPile = [5 as never])],
    ['移出游戏的牌是数字', 'removedFromGame', (G) => (G.removedFromGame = [1 as never])],
    ['打出的牌是数字', 'playedCardsThisTurn', (G) => (G.playedCardsThisTurn = [1 as never])],
    ['玩家所在层为 9', 'currentLayer', (G, a) => (G.players[a]!.currentLayer = 9 as never)],
    ['玩家所在层为小数', 'currentLayer', (G, a) => (G.players[a]!.currentLayer = 1.5 as never)],
    ['心锁为负', 'heartLockValue', (G) => (G.layers[2]!.heartLockValue = -1)],
    ['心锁为 NaN', 'heartLockValue', (G) => (G.layers[2]!.heartLockValue = Number.NaN)],
    ['解封计数为字符串', 'unlockCount', (G, a) => (G.players[a]!.unlockCount = '1' as never)],
    ['技能计数为负', 'skillUsedThisTurn', (G, a) => (G.players[a]!.skillUsedThisTurn = { x: -1 })],
    ['多出一个玩家条目', 'players', (G) => (G.players['ghost'] = clone(G).players['0']!)],
    ['回合序里缺人', 'players', (G) => delete G.players['0']],
    ['回合数为负', 'turnNumber', (G) => (G.turnNumber = -2)],
    ['胜方取值非法', 'winner', (G) => (G.winner = 'cat' as never)],
    [
      '待结算解封的玩家不存在',
      'pendingUnlock',
      (G) => (G.pendingUnlock = { playerID: 'x', layer: 1, cardId: 'c' as never }),
    ],
    [
      '待结算解封的层是 7',
      'pendingUnlock',
      (G, a) => (G.pendingUnlock = { playerID: a, layer: 7, cardId: 'c' as never }),
    ],
    [
      '待结算解封的牌是数字',
      'pendingUnlock',
      (G, a) => (G.pendingUnlock = { playerID: a, layer: 1, cardId: 1 as never }),
    ],
    ['嫁接发起者不存在', 'pendingGraft', (G) => (G.pendingGraft = { playerID: 'x' })],
    [
      '共鸣目标是数字',
      'pendingResonance',
      (G, a) => (G.pendingResonance = { bonderPlayerID: a, targetPlayerID: 2 as never }),
    ],
    [
      '万有引力牌池里有数字',
      'pendingGravity',
      (G, a, b) =>
        (G.pendingGravity = {
          bonderPlayerID: a,
          targetIds: [b],
          pool: [1 as never],
          pickOrder: [a, b],
          pickCursor: 0,
        }),
    ],
    [
      '万有引力游标为负',
      'pendingGravity',
      (G, a, b) =>
        (G.pendingGravity = {
          bonderPlayerID: a,
          targetIds: [b],
          pool: [],
          pickOrder: [a, b],
          pickCursor: -1,
        }),
    ],
    [
      '响应窗口的响应者不存在',
      'pendingResponseWindow',
      (G) =>
        (G.pendingResponseWindow = {
          sourceAbilityID: 's',
          responders: ['x'],
          responded: [],
          timeoutMs: 1,
          validResponseAbilityIDs: [],
          onTimeout: 'cancel',
        }),
    ],
    [
      '响应窗口的已响应者是数字',
      'pendingResponseWindow',
      (G, a) =>
        (G.pendingResponseWindow = {
          sourceAbilityID: 's',
          responders: [a],
          responded: [4 as never],
          timeoutMs: 1,
          validResponseAbilityIDs: [],
          onTimeout: 'cancel',
        }),
    ],
    [
      '父窗口里的坏值也被点名',
      'parentWindow',
      (G, a) =>
        (G.pendingResponseWindow = {
          sourceAbilityID: 's',
          responders: [a],
          responded: [],
          timeoutMs: 1,
          validResponseAbilityIDs: [],
          onTimeout: 'cancel',
          parentWindow: {
            sourceAbilityID: 's',
            responders: [9 as never],
            responded: [],
            timeoutMs: 1,
            validResponseAbilityIDs: [],
            onTimeout: 'cancel',
          },
        }),
    ],
    [
      '窥视决定的层是 -1',
      'pendingPeekDecision',
      (G, a) => (G.pendingPeekDecision = { peekerID: a, targetLayer: -1 }),
    ],
    [
      '窥视展示的人不存在',
      'peekReveal',
      (G) => (G.peekReveal = { peekerID: 'x', revealKind: 'vault', vaultLayer: 1 }),
    ],
    [
      '天秤分组里有数字',
      'pendingLibra',
      (G, a, b) =>
        (G.pendingLibra = {
          bonderPlayerID: a,
          targetPlayerID: b,
          split: { pile1: [1 as never], pile2: [] },
        }),
    ],
    [
      '定罪骰值是字符串',
      'pendingSudgerRolls',
      (G, a) =>
        (G.pendingSudgerRolls = {
          rollA: 'x' as never,
          rollB: 1,
          targetPlayerID: a,
          cardId: 'c' as never,
          deathFaces: [],
          moveFaces: [],
          extraOnMove: null,
        }),
    ],
    [
      '射击后移动的候选层越界',
      'pendingShootMove',
      (G, a, b) =>
        (G.pendingShootMove = {
          shooterID: a,
          targetPlayerID: b,
          cardId: 'c' as never,
          extraOnMove: null,
          choices: [9],
        }),
    ],
    [
      '迷宫被困者不存在',
      'mazeState',
      (G) => (G.mazeState = { mazedPlayerID: 'x', untilTurnNumber: 1 }),
    ],
    [
      '白羊待选的被击杀者不存在',
      'pendingAriesChoice',
      (G, a) => (G.pendingAriesChoice = { ariesID: a, victimLayer: 1, victimID: 'x' }),
    ],
    [
      '黑洞吞噬的等待名单里有不存在的玩家',
      'pendingBlackHoleLevy.waiting',
      (G, a) => (G.pendingBlackHoleLevy = { blackHoleID: a, waiting: ['x'] }),
    ],
    [
      '达尔文淘汰的选牌者不存在',
      'pendingDarwinReturn.playerID',
      (G) => (G.pendingDarwinReturn = { playerID: 'x' }),
    ],
    [
      '处女待选的射手是数字',
      'pendingVirgoChoice',
      (G, a) => (G.pendingVirgoChoice = { virgoID: a, triggerRoll: 6, shooterID: 1 as never }),
    ],
    [
      '射击响应窗口的目标不存在',
      'pendingShootResponse',
      (G, a) =>
        (G.pendingShootResponse = {
          shooterID: a,
          targetPlayerID: 'x',
          cardId: 'c' as never,
          sameLayerRequired: false,
          deathFaces: [],
          moveFaces: [],
          extraOnMove: null,
        }),
    ],
    [
      '没有实体牌的射击响应窗口缺少技能来源',
      'pendingShootResponse.cardId',
      (G, a, b) =>
        (G.pendingShootResponse = {
          shooterID: a,
          targetPlayerID: b,
          cardId: null,
          sameLayerRequired: false,
          deathFaces: [1],
          moveFaces: [2],
          extraOnMove: null,
        }),
    ],
    [
      '射击响应窗口的技能来源不认识',
      'pendingShootResponse.skill',
      (G, a, b) =>
        (G.pendingShootResponse = {
          shooterID: a,
          targetPlayerID: b,
          cardId: 'action_shoot' as never,
          sameLayerRequired: false,
          deathFaces: [1],
          moveFaces: [2],
          extraOnMove: null,
          skill: 'x' as never,
        }),
    ],
    [
      '射击后移动的牌既不是 null 也不是字符串',
      'pendingShootMove.cardId',
      (G, a, b) =>
        (G.pendingShootMove = {
          shooterID: a,
          targetPlayerID: b,
          cardId: 3 as never,
          extraOnMove: null,
          choices: [1],
        }),
    ],
    [
      '雅典娜急智的出牌者不存在',
      'pendingAthenaWit.userID',
      (G, a) =>
        (G.pendingAthenaWit = {
          athenaID: a,
          userID: 'x',
          cardId: 'action_kick' as never,
          move: 'playKick',
          args: [],
        }),
    ],
    [
      '雅典娜急智的重放实参不是数组',
      'pendingAthenaWit.args',
      (G, a, b) =>
        (G.pendingAthenaWit = {
          athenaID: a,
          userID: b,
          cardId: 'action_kick' as never,
          move: 'playKick',
          args: 'x' as never,
        }),
    ],
    ['换位快照里有数字牌', 'shiftSnapshot', (G, a) => (G.shiftSnapshot = { [a]: 3 as never })],
  ];

  for (const [name, needle, mutate] of cases) {
    it(`点名违规：${name}`, () => {
      const issues = inject(mutate);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.join('\n')).toContain(needle);
    });
  }
});
