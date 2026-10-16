import { describe, it, expect } from 'vitest';
import type { MatchEvent } from '@icgame/game-engine';
import { LocalMatchSession } from '../../../workers/localMatchSession';
import { cuesFromEvents } from './cues';

const ev = (kind: string, data: Record<string, unknown>, secret?: MatchEvent['secret']) =>
  ({ stateID: 1, index: 0, kind, actor: '1', data, ...(secret ? { secret } : {}) }) as MatchEvent;

describe('cuesFromEvents', () => {
  it('掷骰：按掷骰人列出点数；点数不是 1-6 的整数、名单为空时跳过', () => {
    const rolled = (rolls: unknown) =>
      cuesFromEvents([ev('dice_rolled', { id: 2, purpose: 'shoot', by: '1', target: '2', rolls })]);
    expect(
      rolled([
        { player: '2', dice: [5] },
        { player: '1', dice: [3] },
      ]),
    ).toEqual([
      {
        kind: 'dice',
        purpose: 'shoot',
        by: '1',
        target: '2',
        rolls: [
          { player: '2', dice: [5] },
          { player: '1', dice: [3] },
        ],
      },
    ]);
    expect(rolled([{ player: '2', dice: [7] }])).toEqual([]);
    expect(rolled([])).toEqual([]);
    expect(rolled('x')).toEqual([]);
  });

  it('抽牌：别人的只有张数，自己的带牌', () => {
    expect(cuesFromEvents([ev('cards_drawn', { player: '2', count: 2 })])).toEqual([
      { kind: 'draw', player: '2', count: 2, cards: null },
    ]);
    expect(
      cuesFromEvents([
        ev(
          'cards_drawn',
          { player: '0', count: 1 },
          { to: ['0'], data: { cards: ['action_kick'] } },
        ),
      ]),
    ).toEqual([{ kind: 'draw', player: '0', count: 1, cards: ['action_kick'] }]);
  });

  it('弃牌按来源拆开，不是从手牌弃的归到 null', () => {
    const cues = cuesFromEvents([
      ev('cards_discarded', {
        count: 3,
        cards: ['a', 'b', 'c'],
        from: [{ player: '1', count: 2 }],
      }),
    ]);
    expect(cues).toEqual([
      { kind: 'discard', player: '1', cards: ['a', 'b'] },
      { kind: 'discard', player: null, cards: ['c'] },
    ]);
  });

  it('出牌、转牌、移层、击杀、复活、心锁、金库都翻成对应动作，顺序不变', () => {
    const cues = cuesFromEvents([
      ev('card_played', { player: '1', card: 'action_shoot' }),
      ev('cards_transferred', { from: '2', to: '1', count: 1 }),
      ev('player_moved', { player: '1', from: 2, to: 3 }),
      ev('player_died', { player: '2', layer: 3, cause: '1' }),
      ev('player_revived', { player: '3', layer: 1 }),
      ev('heart_lock_changed', { layer: 2, from: 3, to: 2 }),
      ev('vault_opened', { vault: 'v', layer: 2, content: 'coin', openedBy: '1' }),
    ]);
    expect(cues.map((c) => c.kind)).toEqual([
      'play',
      'transfer',
      'move',
      'died',
      'revived',
      'lock',
      'vault',
    ]);
  });

  it('进出迷失层的移动不单独播（由击杀 / 复活表达）', () => {
    expect(cuesFromEvents([ev('player_moved', { player: '1', from: 2, to: 0 })])).toEqual([]);
  });

  it('认不出的事件与形状不对的字段直接跳过', () => {
    expect(
      cuesFromEvents([
        ev('phase_changed', { phase: 'action' }),
        ev('card_played', { player: 1, card: null }),
        ev('cards_drawn', { player: '1', count: 'x' }),
        ev('heart_lock_changed', { layer: '2' }),
      ]),
    ).toEqual([]);
  });

  it('真实引擎的事件：Bot 抽牌只给张数，不漏别人的牌', () => {
    const session = new LocalMatchSession({
      playerCount: 5,
      seed: 'fx-cues',
      botPlaysCards: false,
    });
    for (let i = 0; i < 12; i++) session.step();
    const cues = session.eventsSince(-1).flatMap((b) => cuesFromEvents(b.events));
    const draws = cues.filter((c) => c.kind === 'draw');
    expect(draws.length).toBeGreaterThan(0);
    for (const c of draws) if (c.kind === 'draw' && c.player !== '0') expect(c.cards).toBeNull();
  });
});
