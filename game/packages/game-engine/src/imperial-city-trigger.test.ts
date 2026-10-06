// 皇城世界观：当玩家收到贿赂牌时，该玩家选择另一位未收到贿赂牌的盗梦者视为使用 1 张 SHOOT，掷骰结果 -3。
// 每收到 1 张贿赂牌获得 1 次发动机会，发动即消耗。全部经对局运行器驱动真实 move。
// 对照：docs/manual/06-dream-master.md 皇城

import { describe, it, expect } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import { InceptionCityGame } from './game.js';
import type { SetupState } from './setup.js';
import { createTestState, makeLayer, withBribes } from './testing/fixtures.js';
import {
  applyMove,
  matchFromSnapshot,
  type GameDef,
  type MatchState,
  type RandomSource,
} from './runner/matchRunner.js';

const game: GameDef<SetupState> = InceptionCityGame;
const c = (id: string) => id as CardID;
const KICK = c('action_kick');

const fixedRandom = (roll: number): RandomSource => ({
  D6: () => roll,
  Die: () => roll,
  Shuffle: (arr) => arr,
});

function load(G: SetupState): MatchState<SetupState> {
  return matchFromSnapshot<SetupState>({
    G,
    ctx: {
      numPlayers: G.playerOrder.length,
      playOrder: G.playerOrder,
      playOrderPos: G.playerOrder.indexOf(G.currentPlayerID),
      currentPlayer: G.currentPlayerID,
      phase: 'playing',
      turn: 1,
    },
    rngState: 1,
    stateID: 0,
  });
}

/** 梦主是皇城，五人同在第 1 层，当前是 turnOwner 的行动阶段；池里有 3 张失败贿赂牌 */
function scene(turnOwner: string): SetupState {
  const base = createTestState({
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 5,
    currentPlayerID: turnOwner,
    dreamMasterID: 'pM',
    deck: { cards: Array<CardID>(20).fill(KICK), discardPile: [] },
  });
  const players = { ...base.players };
  for (const id of Object.keys(players)) {
    players[id] = { ...players[id]!, currentLayer: 1 as Layer, hand: [KICK] };
  }
  players.pM = { ...players.pM!, characterId: c('dm_imperial_city') };
  return withBribes(
    {
      ...base,
      players,
      layers: {
        ...base.layers,
        1: makeLayer(1 as Layer, { playersInLayer: ['p1', 'p2', 'p3', 'p4', 'pM'] }),
      },
    },
    [{ kind: 'fail' }, { kind: 'fail' }, { kind: 'fail' }],
  );
}

function attempt(G: SetupState, playerID: string, move: string, args: unknown[], roll = 4) {
  return applyMove(game, load(G), { playerID, move, args }, { random: fixedRandom(roll) });
}

/** p 打开了第 1 层的金币金库，梦主在三选一里选择派贿赂 */
function dealByVault(G: SetupState, opener: string) {
  return attempt(
    { ...G, pendingVaultDecision: { layer: 1, openerID: opener } },
    'pM',
    'masterVaultDecision',
    ['bribe'],
  );
}

describe('皇城世界观：收到贿赂牌后的一次 SHOOT', () => {
  it('没收到过贿赂牌的玩家发动被拒', () => {
    const res = attempt(scene('p2'), 'p2', 'useImperialCityWorldShoot', ['p1']);
    expect(res.ok).toBe(false);
  });

  it('收到贿赂牌后获得一次发动机会，发动即消耗', () => {
    const dealt = dealByVault(scene('pM'), 'p2');
    expect(dealt.ok).toBe(true);
    if (!dealt.ok) return;
    expect(dealt.state.G.players.p2!.bribeReceived).toBe(1);
    expect(dealt.state.G.players.p2!.imperialShootCharges).toBe(1);

    const G = { ...dealt.state.G, currentPlayerID: 'p2', turnNumber: 6 };
    // 掷 4，-3 后为 1：击杀
    const shot = attempt(G, 'p2', 'useImperialCityWorldShoot', ['p1']);
    expect(shot.ok).toBe(true);
    if (!shot.ok) return;
    expect(shot.state.G.players.p1!.isAlive).toBe(false);
    expect(shot.state.G.players.p2!.imperialShootCharges).toBe(0);

    // 同一次机会不能再用：换一个没收到贿赂牌的目标也被拒
    const again = attempt(
      { ...shot.state.G, currentPlayerID: 'p2' },
      'p2',
      'useImperialCityWorldShoot',
      ['p3'],
    );
    expect(again.ok).toBe(false);
  });

  it('每收到一张贿赂牌就多一次机会', () => {
    const first = dealByVault(scene('pM'), 'p2');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = dealByVault({ ...first.state.G, turnPhase: 'action' }, 'p2');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.G.players.p2!.imperialShootCharges).toBe(2);
  });

  it('梦主不是皇城时，收到贿赂牌不产生机会', () => {
    const G = scene('pM');
    const plain: SetupState = {
      ...G,
      players: { ...G.players, pM: { ...G.players.pM!, characterId: c('dm_architect') } },
    };
    const dealt = dealByVault(plain, 'p2');
    expect(dealt.ok).toBe(true);
    if (!dealt.ok) return;
    expect(dealt.state.G.players.p2!.imperialShootCharges ?? 0).toBe(0);
  });

  it('目标已收到过贿赂牌时仍被拒，且不消耗机会', () => {
    const G = scene('p2');
    const withCharge: SetupState = {
      ...G,
      players: {
        ...G.players,
        p2: { ...G.players.p2!, bribeReceived: 1, imperialShootCharges: 1 },
        p1: { ...G.players.p1!, bribeReceived: 1 },
      },
    };
    expect(attempt(withCharge, 'p2', 'useImperialCityWorldShoot', ['p1']).ok).toBe(false);
  });
});
