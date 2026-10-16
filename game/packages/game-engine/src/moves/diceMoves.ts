// 掷骰闸门的报到 move 与续接：被点名的人各自 rollDice，最后一个人报到时掷出全部骰子并接着结算。
// 闸门的类型与开闸见 diceGate.ts；续接可能再开下一道闸门（双子·协同、殉道者 → 港口·海啸）。

import { INVALID_MOVE } from '../engine/invalidMove.js';
import { applyGeminiChoice } from '../engine/skills.js';
import type { SetupState } from '../setup.js';
import { incrementMoveCounter } from '../stateOps.js';
import type { BGIORandom, MoveCtx } from './common.js';
import { type DiceResume, type PendingDiceRoll, recordingRandom } from './diceGate.js';
import { settleImperialShoot, settleVenusMirror } from './masterSkills.js';
import { settleSpaceFall } from './nightmareEffects.js';
import { settleTsunamiDice } from './settlement.js';
import { settleShootDice, settleSudgerDice } from './shootResolution.js';
import { settleGeminiSync, settleMartyrSacrifice } from './thiefSkillsBoard.js';
import { settleJokerGamble } from './thiefSkillsCards.js';
import { settleDrawPhase } from './turnFlow.js';

/**
 * 第 i 颗骰子归谁：SHOOT 类第 1 颗是目标的、其余（天蝎、金牛）是射手的；
 * 多人掷的按名单一人一颗，深空坠落只算掷完时还在场的人（不在场的不掷）
 */
function diceOwner(G: SetupState, gate: PendingDiceRoll): (index: number) => string {
  const { resume } = gate;
  switch (resume.purpose) {
    case 'shoot':
      return (i) => (i === 0 ? resume.targetPlayerID : resume.shooterID);
    case 'imperial':
      return (i) => (i === 0 ? resume.targetID : resume.shooterID);
    default: {
      const rollers =
        resume.purpose === 'spaceFall'
          ? gate.rollers.filter((id) => G.players[id]?.isAlive)
          : gate.rollers;
      return (i) => rollers[Math.min(i, rollers.length - 1)] ?? gate.rollers[0]!;
    }
  }
}

/** 按用途掷骰并续接结算 */
function settle(G: SetupState, gate: PendingDiceRoll, random: BGIORandom): SetupState {
  const resume: DiceResume = gate.resume;
  switch (resume.purpose) {
    case 'shoot':
      return settleShootDice(G, resume, random);
    case 'sudger':
      return settleSudgerDice(G, resume, random);
    case 'imperial':
      return settleImperialShoot(G, resume, random);
    case 'venusMirror':
      return settleVenusMirror(G, resume, random.D6());
    case 'pluto':
      return settleDrawPhase(G, resume.ariesExtra, random.D6());
    case 'joker':
      return settleJokerGamble(G, resume.playerID, random.D6());
    case 'geminiChoice': {
      const roll1 = random.D6();
      const roll2 = random.D6();
      return applyGeminiChoice(G, resume.playerID, roll1, roll2) ?? G;
    }
    case 'geminiSync':
      return settleGeminiSync(G, resume.playerID, random.D6());
    case 'martyr':
      return settleMartyrSacrifice(G, resume, random.D6());
    case 'spaceFall':
      return settleSpaceFall(G, resume.layer, gate.rollers, random);
    case 'tsunami':
      return settleTsunamiDice(G, resume, random);
  }
}

/**
 * 全员报到后：清掉闸门、掷骰并续接，记下这次的点数（公开）。
 * 续接里若又开了下一道闸门，它的编号接在这次之后。
 */
export function settleDiceGate(G: SetupState, random: BGIORandom): SetupState {
  const gate = G.pendingDiceRoll;
  if (!gate) return G;
  const recorder = recordingRandom(random, diceOwner(G, gate));
  const base: SetupState = {
    ...G,
    pendingDiceRoll: null,
    lastDiceRoll: {
      id: gate.id,
      purpose: gate.purpose,
      by: gate.by,
      target: gate.target,
      rolls: [],
    },
  };
  const settled = settle(base, gate, recorder.random);
  return {
    ...settled,
    lastDiceRoll: { ...base.lastDiceRoll!, rolls: recorder.rolls() },
  };
}

export const diceMoves = {
  // 掷骰：被点名的人报到，不带点数；最后一个人报到时才掷出全部骰子
  rollDice: {
    move: ({ G, ctx, random }: MoveCtx) => {
      const gate = G.pendingDiceRoll;
      if (!gate) return INVALID_MOVE;
      const actor = ctx.currentPlayer;
      if (!gate.rollers.includes(actor) || gate.rolled.includes(actor)) return INVALID_MOVE;
      const rolled = [...gate.rolled, actor];
      if (rolled.length < gate.rollers.length) {
        return incrementMoveCounter({ ...G, pendingDiceRoll: { ...gate, rolled } });
      }
      return incrementMoveCounter(settleDiceGate(G, random));
    },
    client: false,
  },
};
