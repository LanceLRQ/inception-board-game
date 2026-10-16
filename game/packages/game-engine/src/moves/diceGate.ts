// 掷骰闸门：规则上由玩家掷的骰子，引擎在掷之前停下，等被点名的人各自报到（rollDice），
// 全员报到后才用引擎自己的随机源一次掷完并续接原来的结算（续接见 diceMoves.ts）。
// 点数在报到齐之前不存在，客户端既改不了也看不到；一次结算一道闸门，同一次里的几颗骰子一起掷出。
// 这里只放类型、开闸与记录点数的工具，不引用具体结算，避免循环依赖。

import type { CardID } from '@icgame/shared';
import type { SetupState } from '../setup.js';
import type { BGIORandom } from './common.js';
import type { ShootVariantOpts } from './shootResolution.js';

/** 这次掷骰为了什么 */
export type DicePurpose = DiceResume['purpose'];

/** 续接参数：掷完后按它接着结算；可能含秘密，不进视图 */
export type DiceResume =
  /** SHOOT 类：目标掷，天蝎·毒针、金牛·号角的骰子由射手掷，随同一次掷出 */
  | {
      purpose: 'shoot';
      shooterID: string;
      targetPlayerID: string;
      cardId: CardID | null;
      deathFaces: number[];
      opts: ShootVariantOpts;
    }
  /** 意念判官·定罪：目标掷 2 颗，掷完由射手挑 1 颗 */
  | {
      purpose: 'sudger';
      targetPlayerID: string;
      cardId: CardID;
      deathFaces: number[];
      moveFaces: number[];
      extraOnMove: ShootVariantOpts['extraOnMove'];
    }
  /** 皇城世界观视为 SHOOT：目标掷，金牛·号角的骰子由射手掷 */
  | { purpose: 'imperial'; shooterID: string; targetID: string }
  /** 金星·镜界复制 SHOOT：目标掷 */
  | { purpose: 'venusMirror'; selfID: string; targetID: string; discardedCardIds: CardID[] }
  /** 冥王星·地狱：盗梦者抽牌数按骰子 */
  | { purpose: 'pluto'; playerID: string; ariesExtra: number | null }
  | { purpose: 'joker'; playerID: string }
  | { purpose: 'geminiChoice'; playerID: string }
  | { purpose: 'geminiSync'; playerID: string }
  | { purpose: 'martyr'; playerID: string; direction: 'increase' | 'decrease'; cap: number }
  /** 深空坠落：该层的盗梦者各掷 1 颗 */
  | { purpose: 'spaceFall'; layer: number }
  /**
   * 港口·海啸：存活的盗梦者各掷 1 颗；roundsLeft 含本轮。
   * 海啸之后接金币金库的三选一（coinVaultLayer），由解封触发时再接解封成功的后续（unlockerID）。
   */
  | {
      purpose: 'tsunami';
      roundsLeft: number;
      coinVaultLayer: number | null;
      unlockerID: string | null;
    };

export interface PendingDiceRoll {
  /** 第几次掷骰（递增，与 lastDiceRoll.id 同一序列） */
  id: number;
  purpose: DicePurpose;
  /** 发起者（SHOOT 的射手、技能的使用者）；梦魇与世界观触发的为 null */
  by: string | null;
  /** 被针对的人（SHOOT 的目标），没有为 null */
  target: string | null;
  /** 被点名掷骰的人（按座次） */
  rollers: string[];
  /** 已经掷过的人 */
  rolled: string[];
  resume: DiceResume;
}

export interface DiceRollRecord {
  player: string;
  dice: number[];
}

export interface LastDiceRoll {
  id: number;
  purpose: DicePurpose;
  by: string | null;
  target: string | null;
  rolls: DiceRollRecord[];
}

/** 开一道闸门；没有人要掷时返回 null（调用方照没有骰子处理） */
export function openDiceGate(
  G: SetupState,
  spec: {
    by: string | null;
    target: string | null;
    rollers: readonly string[];
    resume: DiceResume;
  },
): SetupState | null {
  if (spec.rollers.length === 0) return null;
  return {
    ...G,
    pendingDiceRoll: {
      id: (G.lastDiceRoll?.id ?? 0) + 1,
      purpose: spec.resume.purpose,
      by: spec.by,
      target: spec.target,
      rollers: [...spec.rollers],
      rolled: [],
      resume: spec.resume,
    },
  };
}

/**
 * 记下每颗骰子归谁的随机源：第 i 次 D6 记到 ownerOf(i) 名下，其余随机照常透传。
 * 结算代码不用知道闸门，照常调 D6 即可。
 */
export function recordingRandom(
  random: BGIORandom,
  ownerOf: (index: number) => string,
): { random: BGIORandom; rolls: () => DiceRollRecord[] } {
  const rows: DiceRollRecord[] = [];
  let count = 0;
  const record = (value: number): number => {
    const player = ownerOf(count++);
    const row = rows.find((r) => r.player === player);
    if (row) row.dice.push(value);
    else rows.push({ player, dice: [value] });
    return value;
  };
  return {
    random: { ...random, D6: () => record(random.D6()) },
    rolls: () => rows.map((r) => ({ player: r.player, dice: [...r.dice] })),
  };
}
