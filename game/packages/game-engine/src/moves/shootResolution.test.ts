import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import { SCORPIUS_SKILL_ID } from '../engine/skills.js';
import type { SetupState } from '../setup.js';
import { createTestState, makePlayer } from '../testing/fixtures.js';
import type { BGIORandom } from './common.js';
import {
  type PendingShootResponse,
  type ShootVariantOpts,
  buildPendingShootResponse,
  pendingResponseKind,
  rollShootOutcome,
  shootOptsFromPending,
} from './shootResolution.js';

/** 按给定序列依次出骰的随机数桩；同时记录被抽了几次 */
function makeRandom(rolls: number[]): BGIORandom & { drawn: () => number } {
  let i = 0;
  return {
    D6: () => {
      if (i >= rolls.length) throw new Error('随机数序列用尽：抽取次数比预期多');
      return rolls[i++]!;
    },
    Die: () => 1,
    Shuffle: <T>(arr: T[]) => arr,
    drawn: () => i,
  };
}

/** p1 射手（盗梦者）、p2 目标，同在第 1 层；pM 是梦主 */
function baseState(shooterCharacter: string = 'thief_p1'): SetupState {
  const players = {
    p1: makePlayer({
      id: 'p1',
      faction: 'thief',
      characterId: shooterCharacter as CardID,
      hand: ['action_shoot' as CardID],
    }),
    p2: makePlayer({
      id: 'p2',
      faction: 'thief',
      characterId: 'thief_p2' as CardID,
      hand: ['action_unlock', 'action_kick', 'action_shoot'] as CardID[],
    }),
    pM: makePlayer({
      id: 'pM',
      faction: 'master',
      characterId: 'dm_fortress' as CardID,
      hand: ['action_shoot' as CardID],
    }),
  };
  return createTestState({
    players,
    playerOrder: ['p1', 'p2', 'pM'],
    currentPlayerID: 'p1',
    dreamMasterID: 'pM',
    phase: 'playing',
    turnPhase: 'action',
  });
}

const SHOOT_FACES = { deathFaces: [1], moveFaces: [2, 3, 4] };

describe('SHOOT 掷骰与修正链', () => {
  describe('通用路径', () => {
    it('should record the raw roll and settle it by the faces', () => {
      const random = makeRandom([3]);
      const r = rollShootOutcome(baseState(), 'p1', 'p2', 'action_shoot', SHOOT_FACES, random);
      expect(r.result).toBe('move');
      expect(r.settledRoll).toBe(3);
      expect(r.state.lastShootRoll).toBe(3);
      expect(random.drawn()).toBe(1);
    });

    it('should miss on faces outside death and move', () => {
      const r = rollShootOutcome(
        baseState(),
        'p1',
        'p2',
        'action_shoot',
        SHOOT_FACES,
        makeRandom([6]),
      );
      expect(r.result).toBe('miss');
    });

    it('should kill on a death face', () => {
      const r = rollShootOutcome(
        baseState(),
        'p1',
        'p2',
        'action_shoot',
        SHOOT_FACES,
        makeRandom([1]),
      );
      expect(r.result).toBe('kill');
    });
  });

  describe('恐怖分子·狂热惩罚', () => {
    it('should lower the settled roll by one but keep the raw roll for display', () => {
      const r = rollShootOutcome(
        baseState(),
        'p1',
        'p2',
        'action_shoot',
        SHOOT_FACES,
        makeRandom([4]),
        true,
      );
      expect(r.state.lastShootRoll).toBe(4);
      expect(r.settledRoll).toBe(3);
    });

    it('should never push the settled roll below 1', () => {
      const r = rollShootOutcome(
        baseState(),
        'p1',
        'p2',
        'action_shoot',
        SHOOT_FACES,
        makeRandom([1]),
        true,
      );
      expect(r.settledRoll).toBe(1);
      expect(r.result).toBe('kill');
    });
  });

  describe('M4 卡宾枪', () => {
    it('should lower the roll by one when the dream master shoots', () => {
      const r = rollShootOutcome(
        baseState(),
        'pM',
        'p1',
        'action_shoot',
        SHOOT_FACES,
        makeRandom([2]),
      );
      expect(r.state.lastShootRoll).toBe(2);
      expect(r.settledRoll).toBe(1);
      expect(r.result).toBe('kill');
    });

    it('should leave a thief roll untouched', () => {
      const r = rollShootOutcome(
        baseState(),
        'p1',
        'p2',
        'action_shoot',
        SHOOT_FACES,
        makeRandom([2]),
      );
      expect(r.settledRoll).toBe(2);
    });
  });

  describe('灵雕师·雕琢', () => {
    it('should use the target hand size as the roll but still draw one die', () => {
      const random = makeRandom([6]);
      const r = rollShootOutcome(
        baseState('thief_soul_sculptor'),
        'p1',
        'p2',
        'action_shoot',
        SHOOT_FACES,
        random,
      );
      // p2 手牌 3 张 → 点数 3 → 移动；骰子仍被抽一次，原始值照常展示
      expect(r.settledRoll).toBe(3);
      expect(r.result).toBe('move');
      expect(r.state.lastShootRoll).toBe(6);
      expect(random.drawn()).toBe(1);
    });
  });

  describe('天蝎·毒针', () => {
    it('should roll a second die, use the difference and mark the skill used', () => {
      const random = makeRandom([5, 2]);
      const r = rollShootOutcome(
        baseState('thief_scorpius'),
        'p1',
        'p2',
        'action_shoot',
        SHOOT_FACES,
        random,
      );
      expect(r.settledRoll).toBe(3);
      expect(r.result).toBe('move');
      expect(random.drawn()).toBe(2);
      expect(r.state.players.p1!.skillUsedThisTurn[SCORPIUS_SKILL_ID]).toBe(1);
    });

    it('should treat an equal pair as 1', () => {
      const r = rollShootOutcome(
        baseState('thief_scorpius'),
        'p1',
        'p2',
        'action_shoot',
        SHOOT_FACES,
        makeRandom([4, 4]),
      );
      expect(r.settledRoll).toBe(1);
      expect(r.result).toBe('kill');
    });
  });

  describe('金牛·号角', () => {
    it('should roll the second die only when the first roll is not a kill', () => {
      const random = makeRandom([1]);
      const r = rollShootOutcome(
        baseState('thief_taurus'),
        'p1',
        'p2',
        'action_shoot',
        SHOOT_FACES,
        random,
      );
      expect(r.result).toBe('kill');
      expect(random.drawn()).toBe(1);
    });

    it('should turn a move into a kill when the own roll is higher', () => {
      const random = makeRandom([3, 5]);
      const r = rollShootOutcome(
        baseState('thief_taurus'),
        'p1',
        'p2',
        'action_shoot',
        SHOOT_FACES,
        random,
      );
      expect(r.result).toBe('kill');
      expect(random.drawn()).toBe(2);
    });

    it('should keep the original result when the own roll is not higher', () => {
      const r = rollShootOutcome(
        baseState('thief_taurus'),
        'p1',
        'p2',
        'action_shoot',
        SHOOT_FACES,
        makeRandom([3, 3]),
      );
      expect(r.result).toBe('move');
    });

    it('should not apply to 刺客之王', () => {
      const random = makeRandom([3]);
      const r = rollShootOutcome(
        baseState('thief_taurus'),
        'p1',
        'p2',
        'action_shoot_assassin',
        { deathFaces: [1, 2], moveFaces: [3, 4, 5] },
        random,
      );
      expect(r.result).toBe('move');
      expect(random.drawn()).toBe(1);
    });
  });

  describe('木星·雷霆', () => {
    it('should kill when the dream master rolls below its own layer', () => {
      const s = baseState();
      s.players.pM = {
        ...s.players.pM!,
        characterId: 'dm_jupiter_peak' as CardID,
        currentLayer: 3,
      };
      // 梦主掷 4：M4 后 3，不小于所在层 3 → 不触发；掷 3：M4 后 2 < 3 → 击杀
      const noKill = rollShootOutcome(
        s,
        'pM',
        'p1',
        'action_shoot',
        { deathFaces: [1], moveFaces: [] },
        makeRandom([4]),
      );
      expect(noKill.result).toBe('miss');
      const kill = rollShootOutcome(
        s,
        'pM',
        'p1',
        'action_shoot',
        { deathFaces: [1], moveFaces: [] },
        makeRandom([3]),
      );
      expect(kill.result).toBe('kill');
    });
  });
});

describe('SHOOT 应答窗口', () => {
  const opts: ShootVariantOpts = {
    sameLayerRequired: true,
    deathFaces: [1],
    moveFaces: [2, 3, 4],
    extraOnMove: null,
    decreeId: 'action_death_decree_3' as CardID,
    preventMove: true,
  };

  describe('pendingResponseKind', () => {
    it('should ask a flippable 双鱼 target first', () => {
      const s = baseState();
      s.players.p2 = { ...s.players.p2!, characterId: 'thief_pisces' as CardID };
      expect(pendingResponseKind(s, s.players.p1!, s.players.p2!, opts)).toBe('pisces');
    });

    it('should ask the target of a 恐怖分子 shooter', () => {
      const s = baseState('thief_terrorist');
      expect(pendingResponseKind(s, s.players.p1!, s.players.p2!, opts)).toBe('terrorist');
    });

    it('should skip checks the caller asked to skip', () => {
      const s = baseState('thief_terrorist');
      expect(
        pendingResponseKind(s, s.players.p1!, s.players.p2!, { ...opts, skipTerroristCheck: true }),
      ).toBeNull();
    });

    it('should not open a second window while one is pending', () => {
      const s = baseState('thief_terrorist');
      const pending = buildPendingShootResponse('p1', 'p2', 'action_shoot', opts, 'terrorist');
      expect(
        pendingResponseKind(
          { ...s, pendingShootResponse: pending },
          s.players.p1!,
          s.players.p2!,
          opts,
        ),
      ).toBeNull();
    });

    it('should ask nobody for an ordinary shooter and target', () => {
      const s = baseState();
      expect(pendingResponseKind(s, s.players.p1!, s.players.p2!, opts)).toBeNull();
    });
  });

  describe('buildPendingShootResponse / shootOptsFromPending', () => {
    it('should store the original faces without the decree face', () => {
      const pending = buildPendingShootResponse('p1', 'p2', 'action_shoot', opts, 'pisces');
      expect(pending).toEqual({
        shooterID: 'p1',
        targetPlayerID: 'p2',
        cardId: 'action_shoot',
        sameLayerRequired: true,
        deathFaces: [1],
        moveFaces: [2, 3, 4],
        extraOnMove: null,
        decreeId: 'action_death_decree_3',
        preventMove: true,
        responseType: 'pisces',
      });
    });

    it('should restore the options a response re-entry needs', () => {
      const pending: PendingShootResponse = buildPendingShootResponse(
        'p1',
        'p2',
        'action_shoot_burst',
        {
          sameLayerRequired: true,
          deathFaces: [1, 2],
          moveFaces: [3, 4, 5],
          extraOnMove: 'discard_shoots',
        },
        'terrorist',
      );
      expect(shootOptsFromPending(pending)).toEqual({
        sameLayerRequired: true,
        deathFaces: [1, 2],
        moveFaces: [3, 4, 5],
        extraOnMove: 'discard_shoots',
        decreeId: undefined,
        preventMove: undefined,
      });
    });
  });
});
