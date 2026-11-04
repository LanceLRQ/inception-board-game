import { eventsFor, type MatchEvent } from '@icgame/game-engine';
import type { EventBatch } from '../../../match/eventFeed';
import { getCardName } from '../../../lib/cards';
import { ACTIVE_SKILL_DESCRIPTORS } from '../../../lib/activeSkills';
import { cuesFromEvents, type DiceRow } from '../fx/cues';

/** 补读与实时推送按步骤合并，历史里永远不保留 secret。 */
export function mergePublicHistory(
  current: readonly EventBatch[],
  incoming: readonly EventBatch[],
): EventBatch[] {
  const steps = new Map<number, EventBatch>();
  for (const batch of [...current, ...incoming]) {
    steps.set(batch.stateID, { stateID: batch.stateID, events: eventsFor(batch.events, null) });
  }
  return [...steps.values()].sort((a, b) => a.stateID - b.stateID);
}

const MOVE_NAMES: Record<string, string> = {
  doDraw: '抽牌',
  skipDraw: '放弃抽牌',
  endActionPhase: '结束行动',
  doDiscard: '弃牌',
  skipDiscard: '跳过弃牌',
  rollDice: '掷骰',
  masterPeekBribeDecision: '决定是否派发贿赂牌',
  masterVaultDecision: '处理已打开的金库',
  peekerAcknowledge: '完成私密查看',
  dreamMasterMove: '移动',
  playRevive: '复活',
  respondUnlock: '响应解封',
  passResponse: '放弃响应',
  completeSetup: '完成开局布置',
};
const PHASE_NAMES: Record<string, string> = {
  draw: '抽牌',
  action: '出牌',
  discard: '弃牌',
  end: '回合结束',
};

export interface HistoryEntry {
  text: string;
  cards: string[];
  dice: readonly DiceRow[];
}

/** 只解释公开的 data，私密参数、抽到的牌和贿赂结果不参与文案。 */
export function describeHistoryEvent(
  event: MatchEvent,
  nameOf: (id: string) => string,
  translate: (key: string) => string,
): HistoryEntry {
  const d = event.data;
  const name = (id: unknown) => (typeof id === 'string' ? nameOf(id) : '系统');
  const who = name(event.actor);
  const card = (id: unknown) => (typeof id === 'string' ? getCardName(id) : '卡牌');
  const cards = Array.isArray(d.cards)
    ? d.cards.filter((id): id is string => typeof id === 'string')
    : [];
  const list = cards.map(getCardName).join('、');
  const layer = (n: unknown) => (n === 0 ? '迷失层' : `第 ${String(n)} 层`);
  let text: string;
  let shownCards: string[] = [];
  let dice: readonly DiceRow[] = [];
  switch (event.kind) {
    case 'move': {
      const move = typeof d.move === 'string' ? d.move : '';
      const skill = ACTIVE_SKILL_DESCRIPTORS.find((entry) => entry.move === move);
      text = `${who} · ${MOVE_NAMES[move] ?? (skill ? `发动 ${translate(skill.nameKey)}` : move.startsWith('respond') ? '作出响应' : move.startsWith('play') ? '使用卡牌' : '完成行动')}`;
      break;
    }
    case 'turn_started':
      text = `回合 ${String(d.turn)} · ${name(d.owner)} 开始行动`;
      break;
    case 'phase_changed':
      text = `进入${PHASE_NAMES[String(d.phase)] ?? String(d.phase)}阶段`;
      break;
    case 'cards_drawn':
      text = `${name(d.player)}抽取 ${String(d.count)} 张牌`;
      break;
    case 'card_played':
      text = `${name(d.player)}打出【${card(d.card)}】`;
      shownCards = typeof d.card === 'string' ? [d.card] : [];
      break;
    case 'cards_discarded':
    case 'cards_removed': {
      const from = Array.isArray(d.from)
        ? (d.from as Array<{ player: string; count: number }>)
        : [];
      const owners = from.map((entry) => `${name(entry.player)} ${entry.count} 张`).join('、');
      text = `${event.kind === 'cards_discarded' ? '弃牌' : '移出游戏'}${owners ? `（${owners}）` : ''} · ${list}`;
      shownCards = cards;
      break;
    }
    case 'cards_returned':
      text = `${name(d.player)}将 ${String(d.count)} 张牌放回牌库`;
      break;
    case 'cards_transferred':
      text = `${name(d.from)}向${name(d.to)}交出 ${String(d.count)} 张牌`;
      break;
    case 'vault_peeked':
      text = `${name(d.player)}窥视${layer(d.layer)}金库`;
      break;
    case 'bribe_dealt':
      text = `梦主向${name(d.to)}派发 1 张贿赂牌`;
      break;
    case 'dice_rolled': {
      const cue = cuesFromEvents([event]).find((item) => item.kind === 'dice');
      if (cue?.kind === 'dice') dice = cue.rolls;
      text = `${translate(`diceGate.purpose.${String(d.purpose)}`)}${d.by ? ` · ${name(d.by)}` : ''}${d.target ? ` → ${name(d.target)}` : ''}`;
      break;
    }
    case 'player_moved':
      text = `${name(d.player)}从${layer(d.from)}移动至${layer(d.to)}`;
      break;
    case 'player_died':
      text = `${name(d.player)}从${layer(d.layer)}进入迷失层${d.cause ? `（被${name(d.cause)}击杀）` : ''}`;
      break;
    case 'player_revived':
      text = `${name(d.player)}在${layer(d.layer)}复活`;
      break;
    case 'heart_lock_changed':
      text = `${layer(d.layer)}心锁 ${String(d.from)} → ${String(d.to)}`;
      break;
    case 'unlock_resolved':
      text = `${name(d.player)}解封${layer(d.layer)}${d.success ? '成功' : '被抵消'}`;
      break;
    case 'vault_opened':
      text = `${name(d.openedBy)}打开${layer(d.layer)}金库 · ${d.content === 'secret' ? '秘密' : d.content === 'coin' ? '金币' : '空'}`;
      shownCards =
        d.content === 'secret' ? ['vault_secret'] : d.content === 'coin' ? ['vault_gold'] : [];
      break;
    case 'nightmare_revealed':
      text = `${layer(d.layer)}翻开梦魇【${card(d.nightmare)}】`;
      shownCards = typeof d.nightmare === 'string' ? [d.nightmare] : [];
      break;
    case 'nightmare_discarded':
      text = `${layer(d.layer)}的梦魇已弃置`;
      break;
    case 'character_revealed':
      text = `${name(d.player)}翻开角色【${card(d.character)}】`;
      break;
    case 'awaiting_changed': {
      const awaiting = Array.isArray(d.awaiting) ? (d.awaiting as Array<{ actors: string[] }>) : [];
      const actors = [...new Set(awaiting.flatMap((entry) => entry.actors))];
      text =
        awaiting.length === 0
          ? '响应处理完毕'
          : `等待${actors.length ? actors.map(nameOf).join('、') : '玩家'}响应`;
      break;
    }
    case 'game_over':
      text = `游戏结束 · ${d.winner === 'master' ? '梦主阵营' : '盗梦者阵营'}获胜 · ${translate(`localMatch.winReason.${String(d.reason)}`)}`;
      break;
    default:
      text = `${who}完成行动`;
  }
  return { text, cards: shownCards, dice };
}
