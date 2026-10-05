// 视图测试用的固定局面
// 在真实建局结果（createMatch + completeSetup）的基础上，把手牌、贿赂池、金库、梦魇、技能记录
// 都改成已知的值，方便逐类断言「谁能看到什么」。

import type { CardID, Faction } from '@icgame/shared';
import { InceptionCityGame } from '../game.js';
import type { BribeSetup, SetupState } from '../setup.js';
import { applyMove, createMatch, type GameDef, type MatchState } from '../runner/matchRunner.js';

const game: GameDef<SetupState> = InceptionCityGame;

/** 建局并完成开局布置，返回对局状态（G 里手牌、角色等都是真实发出的） */
export function startedMatch(numPlayers: number, seed: string): MatchState<SetupState> {
  const created = createMatch(game, { numPlayers, setupData: { rngSeed: seed }, seed });
  const res = applyMove(game, created, { playerID: '0', move: 'completeSetup', args: [] });
  if (!res.ok) throw new Error(`completeSetup 被拒绝：${res.reason}`);
  return res.state;
}

export interface ViewScene {
  G: SetupState;
  /** 梦主（角色为非「皇城」的梦主） */
  master: string;
  /** 四名盗梦者：a 持有一张成功的贿赂牌（已转阵营），b 持有一张失败的贿赂牌，c、d 没有贿赂牌 */
  a: string;
  b: string;
  c: string;
  d: string;
}

export const IMPERIAL_CITY = 'dm_imperial_city' as CardID;
export const PLAIN_MASTER = 'dm_neptune_ocean' as CardID;

function bribe(
  index: number,
  kind: BribeSetup['kind'],
  status: BribeSetup['status'],
  heldBy: string | null,
): BribeSetup {
  return {
    id: `bribe-${index}`,
    kind,
    status,
    heldBy,
    originalOwnerId: heldBy,
  };
}

/**
 * 5 人局固定局面：
 * - 贿赂池 6 张：bribe-0 / 1 / 4 / 5 在池里（成功、失败、成功、失败），bribe-2（成功）派给 a，bribe-3（失败）派给 b
 * - 所有金库未开，所有梦魇未翻开（除第 3 层已翻开）
 * - 每个人的手牌、技能记录都互不相同
 */
export function buildViewScene(): ViewScene {
  const started = startedMatch(5, 'view-scene-seed-0042');
  const base = started.G;
  const master = base.dreamMasterID;
  const thieves = base.playerOrder.filter((id) => id !== master);
  const [a, b, c, d] = thieves as [string, string, string, string];

  const hands: Record<string, CardID[]> = {
    [master]: ['action_dream_peek', 'action_kick'],
    [a]: ['action_shoot', 'action_kick', 'action_unlock'],
    [b]: ['action_unlock', 'action_unlock', 'action_dream_peek'],
    [c]: ['action_kick', 'action_shoot'],
    [d]: ['action_dream_peek', 'action_dream_peek', 'action_dream_peek', 'action_kick'],
  };

  const players: SetupState['players'] = {};
  for (const id of base.playerOrder) {
    const p = base.players[id]!;
    players[id] = {
      ...p,
      hand: hands[id]!,
      skillUsedThisTurn: id === master ? {} : { [`skill-turn-${id}`]: 1 },
      skillUsedThisGame: id === master ? {} : { [`skill-game-${id}`]: 2 },
    };
  }
  players[master] = { ...players[master]!, characterId: PLAIN_MASTER };
  players[a] = { ...players[a]!, faction: 'master' as Faction, bribeReceived: 1 };
  players[b] = { ...players[b]!, bribeReceived: 1 };

  const layers: SetupState['layers'] = {};
  const nightmares: CardID[] = [
    'nightmare_space_fall',
    'nightmare_despair_storm',
    'nightmare_hunger_bite',
    'nightmare_echo',
  ];
  for (const key of Object.keys(base.layers)) {
    const l = Number(key);
    layers[l] = {
      ...base.layers[l]!,
      nightmareId: nightmares[l - 1]!,
      nightmareRevealed: l === 3,
      nightmareTriggered: false,
    };
  }

  const G: SetupState = {
    ...base,
    players,
    layers,
    currentPlayerID: a,
    turnPhase: 'action',
    bribePool: [
      bribe(0, 'deal', 'inPool', null),
      bribe(1, 'fail', 'inPool', null),
      bribe(2, 'deal', 'deal', a),
      bribe(3, 'fail', 'dealt', b),
      bribe(4, 'deal', 'inPool', null),
      bribe(5, 'fail', 'inPool', null),
    ],
    usedNightmareIds: ['nightmare_plague', 'nightmare_vortex'],
    activeWorldViews: [],
    peekReveal: null,
  };
  return { G, master, a, b, c, d };
}
