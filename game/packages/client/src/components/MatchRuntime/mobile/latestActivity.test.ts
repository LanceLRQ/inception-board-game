import { describe, it, expect } from 'vitest';
import type { MatchView } from '@icgame/game-engine';
import { buildFixtureScenario } from '../../../match/fixtures/buildScenario';
import { deriveActivity } from './latestActivity';

const nicknameOf = (id: string) => `P${id}`;
const cardNameOf = (id: string) => `牌:${id}`;

const idle = buildFixtureScenario('thief').view.G as MatchView;
const pending = buildFixtureScenario('thief-pending').view.G as MatchView;

describe('deriveActivity', () => {
  it('没有视图时没有动态', () => {
    expect(deriveActivity({ view: undefined, awaiting: null, nicknameOf, cardNameOf })).toBeNull();
  });

  it('什么都没发生时没有动态', () => {
    const view = { ...idle, lastPlayedCardThisTurn: null, pendingResponseWindow: null };
    expect(deriveActivity({ view, awaiting: null, nicknameOf, cardNameOf })).toBeNull();
  });

  it('解封响应窗口：点名发起者、层与未响应人数', () => {
    const a = deriveActivity({ view: pending, awaiting: null, nicknameOf, cardNameOf });
    expect(a?.kind).toBe('unlockWindow');
    expect(a?.params).toMatchObject({
      name: nicknameOf(pending.pendingUnlock!.playerID),
      layer: pending.pendingUnlock!.layer,
    });
    const win = pending.pendingResponseWindow!;
    expect(a?.params.waiting).toBe(
      win.responders.filter((id) => !win.responded.includes(id)).length,
    );
  });

  it('解封窗口优先于其他等待', () => {
    const a = deriveActivity({
      view: pending,
      awaiting: { mine: false },
      nicknameOf,
      cardNameOf,
    });
    expect(a?.kind).toBe('unlockWindow');
  });

  it('被射击的应答窗口点名双方', () => {
    const view = {
      ...idle,
      pendingResponseWindow: null,
      pendingShootResponse: { shooterID: '1', targetPlayerID: '2' },
    } as unknown as MatchView;
    const a = deriveActivity({ view, awaiting: null, nicknameOf, cardNameOf });
    expect(a).toEqual({ kind: 'shootResponse', params: { shooter: 'P1', target: 'P2' } });
  });

  it('等待应答：区分是不是本人', () => {
    const view = { ...idle, lastPlayedCardThisTurn: null } as MatchView;
    expect(deriveActivity({ view, awaiting: { mine: true }, nicknameOf, cardNameOf })?.kind).toBe(
      'awaitingMine',
    );
    expect(deriveActivity({ view, awaiting: { mine: false }, nicknameOf, cardNameOf })?.kind).toBe(
      'awaitingOthers',
    );
  });

  it('本回合最后打出的牌，SHOOT 附骰点', () => {
    const base = { ...idle, pendingResponseWindow: null, pendingShootResponse: null };
    const plain = { ...base, lastPlayedCardThisTurn: 'action_unlock', lastShootRoll: null };
    expect(
      deriveActivity({
        view: plain as unknown as MatchView,
        awaiting: null,
        nicknameOf,
        cardNameOf,
      }),
    ).toEqual({
      kind: 'lastPlayed',
      params: { name: `P${idle.currentPlayerID}`, card: '牌:action_unlock' },
    });
    const shoot = { ...base, lastPlayedCardThisTurn: 'action_shoot', lastShootRoll: 4 };
    const a = deriveActivity({
      view: shoot as unknown as MatchView,
      awaiting: null,
      nicknameOf,
      cardNameOf,
    });
    expect(a?.kind).toBe('lastPlayedShoot');
    expect(a?.params.roll).toBe(4);
  });
});
