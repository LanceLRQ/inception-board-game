// 联机对局里真人对手显示的是昵称，不是「AI N」之类的占位名：座位、行动轴、顶栏、选目标、万有引力挑牌

import { describe, it, expect } from 'vitest';
import type { MatchView } from '@icgame/game-engine';
import { buildFixtureScenario } from '../../match/fixtures/buildScenario';
import { pickerLabelOf } from '../GravityPoolPickerDialog/logic';
import { computeTargetOptions } from '../TargetPlayerPickerDialog/logic';
import { nicknameMap } from './controllerDerive';
import { buildSeatViews } from './model/seatModel';
import { adaptViewToStage } from './model/viewAdapter';
import { computeRailSlots } from './model/turnOrder';
import { otherTurnLabel } from './turnLabel';

const modules = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** 固定场景里把第 2 个座位改成一个叫「小明」的真人，其余座位保持 Bot */
function withHumanOpponent() {
  const sc = buildFixtureScenario('thief');
  const G = sc.view.G as MatchView;
  const opponent = Object.keys(G.players).find((id) => id !== sc.seat && id !== G.dreamMasterID)!;
  const view: MatchView = {
    ...G,
    players: {
      ...G.players,
      [opponent]: { ...G.players[opponent]!, nickname: '小明', type: 'human' },
    },
  };
  const seats = sc.seats.map((s) =>
    s.seat === opponent ? { ...s, nickname: '小明', isBot: false } : s,
  );
  return { sc, view, opponent, seats };
}

describe('真人对手显示昵称', () => {
  it('座位牌与行动轴用的座位数据：昵称是「小明」', () => {
    const { sc, view, opponent } = withHumanOpponent();
    const stage = adaptViewToStage({ G: view, ctx: sc.view.ctx, humanPlayerID: sc.seat })!;
    const seatViews = buildSeatViews(stage, undefined);
    expect(seatViews.find((s) => s.id === opponent)!.nickname).toBe('小明');
    expect(seatViews.map((s) => s.nickname).join('|')).not.toMatch(/AI \d/);
  });

  it('行动轴与座位牌共用同一份座位数据：顺序按行动轴，每个座位都带昵称', () => {
    const { sc, view, opponent } = withHumanOpponent();
    const stage = adaptViewToStage({ G: view, ctx: sc.view.ctx, humanPlayerID: sc.seat })!;
    const slots = computeRailSlots({
      playerOrder: stage.playerOrder,
      players: stage.players,
      viewerID: stage.viewerID,
      masterID: stage.dreamMasterID,
      currentPlayerID: stage.currentPlayerID,
    });
    const seatViews = buildSeatViews(stage, undefined);
    expect(seatViews.map((s) => s.id)).toEqual(slots.map((s) => s.id));
    expect(seatViews.every((s) => s.nickname.length > 0)).toBe(true);
    expect(seatViews.map((s) => s.id)).toContain(opponent);
  });

  it('顶栏的「别人的回合」：真人用座位表昵称，没有 AI 前缀', () => {
    const { seats, opponent } = withHumanOpponent();
    const info = seats.find((s) => s.seat === opponent)!;
    expect(otherTurnLabel(info, '小明').params.name).toBe('小明');
  });

  it('昵称表、选目标弹窗、万有引力挑牌都用昵称', () => {
    const { sc, view, opponent } = withHumanOpponent();
    expect(nicknameMap(view.players)[opponent]).toBe('小明');
    const options = computeTargetOptions({
      cardId: 'action_shoot_assassin',
      viewerLayer: 1,
      viewerPlayerID: sc.seat,
      players: view.players,
    });
    expect(options.find((o) => o.id === opponent)!.name).toBe('小明');
    const nicknameOf = (id: string) => view.players[id]?.nickname ?? id;
    expect(pickerLabelOf(opponent, sc.seat, nicknameOf)).toBe('小明');
    expect(pickerLabelOf(sc.seat, sc.seat, nicknameOf)).toBe('你');
  });

  it('界面源码里没有用「AI + 座位号」拼出来的占位名', () => {
    const offenders = Object.entries(modules)
      .filter(([, source]) => /`AI \$\{|'AI '\s*\+|"AI "\s*\+/.test(source))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
    expect(Object.keys(modules).length).toBeGreaterThan(20);
  });
});
