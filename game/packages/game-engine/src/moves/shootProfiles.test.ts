import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import { PLAY_MOVE_CARD_IDS } from '../engine/playCardKinds.js';
import { isShootClassCard } from '../engine/skills.js';
import { SHOOT_PROFILE_CARD_IDS, getShootProfile } from './shootProfiles.js';

describe('SHOOT 参数表', () => {
  describe('各牌的骰面与限制', () => {
    it('should give SHOOT same-layer with death [1] and move [2,3,4]', () => {
      expect(getShootProfile('action_shoot')).toEqual({
        sameLayerRequired: true,
        deathFaces: [1],
        moveFaces: [2, 3, 4],
        extraOnMove: null,
      });
    });

    it('should treat SHOOT·梦境穿梭剂 as plain SHOOT when shooting', () => {
      expect(getShootProfile('action_shoot_dream_transit')).toEqual(
        getShootProfile('action_shoot'),
      );
    });

    it('should let 刺客之王 hit any layer with death [1,2] and move [3,4,5]', () => {
      expect(getShootProfile('action_shoot_assassin')).toEqual({
        sameLayerRequired: false,
        deathFaces: [1, 2],
        moveFaces: [3, 4, 5],
        extraOnMove: null,
      });
    });

    it('should discard unlocks on move for 爆甲螺旋', () => {
      expect(getShootProfile('action_shoot_drill')).toEqual({
        sameLayerRequired: true,
        deathFaces: [1, 2],
        moveFaces: [3, 4, 5],
        extraOnMove: 'discard_unlocks',
      });
    });

    it('should discard shoots on move for 炸裂弹头', () => {
      expect(getShootProfile('action_shoot_burst')).toEqual({
        sameLayerRequired: true,
        deathFaces: [1, 2],
        moveFaces: [3, 4, 5],
        extraOnMove: 'discard_shoots',
      });
    });
  });

  describe('取值函数', () => {
    it('should return undefined for cards outside the SHOOT class', () => {
      expect(getShootProfile('action_unlock')).toBeUndefined();
      expect(getShootProfile('haley_skill_proxy')).toBeUndefined();
      expect(getShootProfile('constructor')).toBeUndefined();
    });

    it('should return fresh copies so callers cannot corrupt the table', () => {
      const first = getShootProfile('action_shoot')!;
      first.deathFaces.push(6);
      first.moveFaces.length = 0;
      const second = getShootProfile('action_shoot')!;
      expect(second.deathFaces).toEqual([1]);
      expect(second.moveFaces).toEqual([2, 3, 4]);
      expect(second.deathFaces).not.toBe(first.deathFaces);
    });
  });

  describe('与出牌 move 表对账', () => {
    it('should cover exactly the SHOOT-class cards', () => {
      for (const id of SHOOT_PROFILE_CARD_IDS) {
        expect(isShootClassCard(id as CardID)).toBe(true);
        expect(getShootProfile(id)).toBeDefined();
      }
      expect(SHOOT_PROFILE_CARD_IDS).toHaveLength(5);
    });

    it('should have a profile for every card a SHOOT play move accepts', () => {
      for (const move of [
        'playShoot',
        'playShootKing',
        'playShootArmor',
        'playShootBurst',
        'playShootDreamTransit',
      ]) {
        for (const id of PLAY_MOVE_CARD_IDS[move]!) {
          expect(getShootProfile(id)).toBeDefined();
        }
      }
    });
  });
});
