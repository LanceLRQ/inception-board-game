// 按记录重放整局 + 事件流的完备性与泄露检查
// 对照：docs/manual/03-game-flow.md 回合流程、贿赂规则

import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from '../game.js';
import type { SetupState } from '../setup.js';
import {
  applyMove,
  createMatch,
  replayMatch,
  eventsFor,
  type GameDef,
  type MatchEvent,
  type MatchRecord,
  type MatchState,
  type MoveRequest,
} from './matchRunner.js';
import { makeTestRng, pickLegalMove } from './moveFuzzer.js';

const game: GameDef<SetupState> = InceptionCityGame;

interface Played {
  record: MatchRecord;
  initial: MatchState<SetupState>;
  final: MatchState<SetupState>;
  events: MatchEvent[];
  steps: StepRecord[];
}

/** 一步的记录：用于逐步对账与泄露扫描 */
interface StepRecord {
  move: string;
  events: MatchEvent[];
  /** 这一步之后仍未翻开的玩家与他们的角色 */
  hiddenChars: Record<string, string>;
  /** 这一步离开牌库的张数（牌库减少量，重洗时为 null） */
  leftDeck: number | null;
  /** 这一步新增的「移出游戏」的牌里，不是从手牌来的张数（被翻开的牌库顶） */
  flipped: number;
}

/** 用模糊器随机打一局，记下起始参数与每个被接受的请求，以及全部事件 */
function playOut(numPlayers: number, seed: string, maxSteps = 500): Played {
  const setupData = { rngSeed: seed };
  const initial = createMatch(game, { numPlayers, setupData, seed });
  const moves: MoveRequest[] = [];
  const events: MatchEvent[] = [];
  const steps: StepRecord[] = [];
  let state = initial;

  const accept = (request: MoveRequest): void => {
    const res = applyMove(game, state, request);
    if (!res.ok) throw new Error(`请求被拒绝：${request.move} ${res.reason}`);
    moves.push(request);
    events.push(...res.events);
    const was = state.G;
    const now = res.state.G;
    const newlyRemoved = now.removedFromGame.slice(was.removedFromGame.length);
    // 从手牌里移出游戏的时间风暴本身；其余的是被翻开的牌库顶
    const stormsIn = (G: SetupState): number =>
      Object.values(G.players).reduce(
        (t, pl) => t + pl.hand.filter((c) => c === 'action_time_storm').length,
        0,
      );
    const stormsLeftHands = newlyRemoved.length > 0 ? stormsIn(was) - stormsIn(now) : 0;
    // 牌库里出现了原来没有的牌，说明重洗过
    const countIn = (cards: readonly string[], card: string): number =>
      cards.filter((x) => x === card).length;
    const reshuffled = now.deck.cards.some(
      (card) => countIn(was.deck.cards, card) < countIn(now.deck.cards, card),
    );
    const hiddenChars: Record<string, string> = {};
    for (const id of now.playerOrder) {
      if (!now.players[id]!.isRevealed) hiddenChars[id] = now.players[id]!.characterId;
    }
    steps.push({
      move: request.move,
      events: res.events,
      hiddenChars,
      leftDeck: reshuffled ? null : was.deck.cards.length - now.deck.cards.length,
      flipped: newlyRemoved.length - stormsLeftHands,
    });
    state = res.state;
  };

  accept({ playerID: '0', move: 'completeSetup', args: [] });
  const rnd = makeTestRng(numPlayers * 131 + seed.length);
  for (let i = 0; i < maxSteps && state.ctx.gameover === undefined; i++) {
    const cand = pickLegalMove(game, state, rnd);
    if (!cand) break;
    accept({ playerID: cand.playerID, move: cand.move, args: cand.args });
  }
  return { record: { numPlayers, setupData, seed, moves }, initial, final: state, events, steps };
}

const GAMES: { n: number; seed: string }[] = [];
for (let n = 4; n <= 10; n++) {
  GAMES.push({ n, seed: `replay-${n}-a` }, { n, seed: `replay-${n}-b` });
}

// 同一批对局被多条用例复用，只打一次
const played = GAMES.map(({ n, seed }) => playOut(n, seed));

describe('重放整局', () => {
  it('随机对局按记录重放，终局状态与原对局完全相等（含 rngState 与 stateID）', () => {
    for (const p of played) {
      expect(p.record.moves.length).toBeGreaterThan(20);
      const replayed = replayMatch(game, p.record);
      expect(replayed).toEqual(p.final);
    }
  });

  it('记录里某一步的参数被改坏，重放抛错并指出是第几步', () => {
    const p = played[0]!;
    // 找一个带参数的请求，把玩家改成不存在的人，保证这一步必定被拒绝
    const index = p.record.moves.findIndex((m, i) => i > 5 && m.args.length > 0);
    expect(index).toBeGreaterThan(5);
    const moves = p.record.moves.map((m, i) => (i === index ? { ...m, playerID: 'nobody' } : m));
    expect(() => replayMatch(game, { ...p.record, moves })).toThrow(`第 ${index + 1} 步`);
  });

  it('记录里的步骤被拒绝的原因会写进错误信息', () => {
    const p = played[0]!;
    const moves = [...p.record.moves.slice(0, 3), { playerID: '0', move: 'noSuchMove', args: [] }];
    expect(() => replayMatch(game, { ...p.record, moves })).toThrow(/第 4 步.*unknown_move/);
  });
});

describe('事件流', () => {
  it('每条事件的 stateID 等于那一步之后的版本号，同一步里 index 连续', () => {
    for (const p of played) {
      const byState = new Map<number, MatchEvent[]>();
      for (const ev of p.events) byState.set(ev.stateID, [...(byState.get(ev.stateID) ?? []), ev]);
      // 每个被接受的请求都至少有一条 move 事件，版本号从 1 连续递增
      expect([...byState.keys()]).toEqual(p.record.moves.map((_, i) => i + 1));
      for (const evs of byState.values()) {
        expect(evs.map((e) => e.index)).toEqual(evs.map((_, i) => i));
        expect(evs[0]!.kind).toBe('move');
      }
    }
  });

  it('各种领域事件都在随机对局里出现过', () => {
    const seen = new Set(played.flatMap((p) => p.events.map((e) => e.kind)));
    for (const kind of [
      'move',
      'turn_started',
      'phase_changed',
      'cards_drawn',
      'card_played',
      'cards_discarded',
      'player_moved',
      'player_died',
      'heart_lock_changed',
      'unlock_resolved',
      'awaiting_changed',
      'character_revealed',
      'shoot_rolled',
      'player_revived',
      'vault_opened',
      'bribe_dealt',
      'nightmare_revealed',
      'nightmare_discarded',
      'game_over',
    ]) {
      expect(seen.has(kind), `随机对局里没有出现 ${kind}`).toBe(true);
    }
  });

  it('完备性：事件汇总出的量与终局状态里能直接读到的量一致', () => {
    let totalKills = 0;
    for (const p of played) {
      const { events, final, initial } = p;
      const G = final.G;
      const ids = G.playerOrder;
      const count = (kind: string, pick: (e: MatchEvent) => unknown, id: string): number =>
        events.filter((e) => e.kind === kind && pick(e) === id).length;

      for (const id of ids) {
        const deaths = count('player_died', (e) => e.data.player, id);
        const revives = count('player_revived', (e) => e.data.player, id);
        // 死亡次数减复活次数：为 0 就是活着，为 1 就是死着
        expect(deaths - revives).toBe(G.players[id]!.isAlive ? 0 : 1);

        // 解封计数：心锁下降的解封都算。另有一类解封发生在迷失层（第 0 层没有心锁，心锁不会下降），
        // 引擎照样给解封者记一次 unlockCount，这里把它们单独列出来对账
        const unlockEvents = events.filter(
          (e) => e.kind === 'unlock_resolved' && e.data.player === id,
        );
        const lostLayerUnlocks = unlockEvents.filter(
          (e) => e.data.success === false && e.data.layer === 0,
        ).length;
        const unlocks =
          unlockEvents.filter((e) => e.data.success === true).length + lostLayerUnlocks;
        expect(unlocks, `${p.record.seed} ${id}`).toBe(G.players[id]!.unlockCount);

        const vaults = count('vault_opened', (e) => e.data.openedBy, id);
        expect(vaults).toBe(G.vaults.filter((v) => v.openedBy === id).length);

        const bribes = count('bribe_dealt', (e) => e.data.to, id);
        expect(bribes).toBe(G.players[id]!.bribeReceived);

        totalKills += count('player_died', (e) => e.data.cause, id);
      }

      // 回合：事件里的回合数与回合主人和终局状态一致
      const turns = events.filter((e) => e.kind === 'turn_started');
      expect(turns.length).toBe(G.turnNumber);
      const lastTurn = turns[turns.length - 1]!;
      expect(lastTurn.data.turn).toBe(G.turnNumber);
      expect(lastTurn.data.owner).toBe(G.currentPlayerID);
      // 本回合打出的牌：最后一个回合开始之后的 card_played 就是 G.playedCardsThisTurn
      const lastTurnPos = events.indexOf(lastTurn);
      const lastPlayed = events
        .slice(lastTurnPos)
        .filter((e) => e.kind === 'card_played')
        .map((e) => e.data.card);
      expect(lastPlayed).toEqual(G.playedCardsThisTurn);

      // 所在层、心锁、翻开状态、已用梦魇：按事件从开局状态折叠，必须等于终局状态
      const layerOf: Record<string, unknown> = {};
      for (const id of ids) layerOf[id] = initial.G.players[id]!.currentLayer;
      const lockOf: Record<number, unknown> = {};
      for (const l of Object.keys(initial.G.layers)) {
        lockOf[Number(l)] = initial.G.layers[Number(l)]!.heartLockValue;
      }
      const revealed = new Set(ids.filter((id) => initial.G.players[id]!.isRevealed));
      for (const e of events) {
        if (e.kind === 'player_moved') layerOf[e.data.player as string] = e.data.to;
        if (e.kind === 'heart_lock_changed') lockOf[e.data.layer as number] = e.data.to;
        if (e.kind === 'character_revealed') revealed.add(e.data.player as string);
      }
      for (const id of ids) {
        expect(layerOf[id]).toBe(G.players[id]!.currentLayer);
        expect(revealed.has(id)).toBe(G.players[id]!.isRevealed);
      }
      for (const l of Object.keys(lockOf)) {
        expect(lockOf[Number(l)]).toBe(G.layers[Number(l)]!.heartLockValue);
      }
      expect(events.filter((e) => e.kind === 'nightmare_discarded').length).toBe(
        G.usedNightmareIds.length,
      );

      // 金库：打开的总数一致
      expect(events.filter((e) => e.kind === 'vault_opened').length).toBe(
        G.vaults.filter((v) => v.isOpened).length,
      );

      // 终局：game_over 事件与 ctx.gameover 对应
      const over = events.filter((e) => e.kind === 'game_over');
      expect(over.length).toBe(final.ctx.gameover === undefined ? 0 : 1);
      if (over[0]) {
        expect(over[0].data).toEqual(final.ctx.gameover);
      }
    }
    // 保证这些量不是全部为 0 导致的空洞通过
    expect(totalKills).toBeGreaterThan(0);
  });

  it('抽牌：每条 cards_drawn 的 count 都等于 secret.cards 的张数', () => {
    let samples = 0;
    for (const p of played) {
      for (const ev of p.events.filter((e) => e.kind === 'cards_drawn')) {
        samples++;
        expect(ev.data.count).toBe((ev.secret!.data.cards as unknown[]).length);
        expect(ev.secret!.to).toEqual([ev.data.player]);
      }
    }
    expect(samples).toBeGreaterThan(100);
  });

  it('对账：离开牌库的牌都能在 cards_drawn 里找到，去向不是手牌的另有出处', () => {
    // 牌库减少量 = 抽到的牌 + 被翻开移出游戏的牌库顶。
    // 例外：重洗那一步无法按差值计算；嫁接归还、空间女王放回牌库顶是把手牌放回牌库（牌库变多），不在此列
    let checked = 0;
    let withFlip = 0;
    for (const p of played) {
      for (const st of p.steps) {
        if (
          st.leftDeck === null ||
          st.move === 'resolveGraft' ||
          st.move === 'useSpaceQueenStashTop'
        ) {
          continue;
        }
        const drawn = st.events
          .filter((e) => e.kind === 'cards_drawn')
          .reduce((t, e) => t + (e.data.count as number), 0);
        expect(st.leftDeck, `${st.move}`).toBe(drawn + st.flipped);
        checked++;
        if (st.flipped > 0) withFlip++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(withFlip).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 泄露扫描：对每个观察者取事件、整体序列化，在文本里找不该出现的秘密
// ---------------------------------------------------------------------------

type EventFilter = (events: readonly MatchEvent[], viewer: string | null) => MatchEvent[];

interface LeakScan {
  violations: string[];
  samples: { bribe: number; nightmare: number; character: number; drawn: number; args: number };
}

function scanLeaks(
  steps: readonly StepRecord[],
  players: readonly string[],
  filter: EventFilter,
): LeakScan {
  const violations: string[] = [];
  const samples = { bribe: 0, nightmare: 0, character: 0, drawn: 0, args: 0 };
  // 各类观察者：每名玩家（含梦主）、旁观者、一个不在局内的名字
  const viewers: (string | null)[] = [...players, null, 'outsider'];
  for (const st of steps) {
    for (const viewer of viewers) {
      const seen = filter(st.events, viewer);
      const text = JSON.stringify(seen);
      st.events.forEach((original, i) => {
        const got = seen[i]!;
        const entitled =
          typeof viewer === 'string' && (original.secret?.to.includes(viewer) ?? false);

        // (4) 别人抽牌的 secret、别人出牌的参数：字段必须不存在。
        // 牌 ID 是按牌种的，别人抽到的牌种可能合法地出现在公开的 card_played 里，所以不做全文匹配
        if (original.kind === 'cards_drawn' && !entitled) {
          samples.drawn++;
          if ('secret' in got) violations.push(`${viewer} 拿到了别人抽牌的 secret`);
        }
        if (original.kind === 'move' && !entitled) {
          samples.args++;
          if ('secret' in got) violations.push(`${viewer} 拿到了别人 move 的参数`);
        }

        // (1) 贿赂牌成败：非持有者拿不到 secret，文本里也没有这张牌的成败值
        if (original.kind === 'bribe_dealt' && !entitled) {
          samples.bribe++;
          const kind = original.secret!.data.kind as string;
          if ('secret' in got) violations.push(`${viewer} 拿到了别人贿赂牌的 secret`);
          if (text.includes(`"kind":"${kind}"`))
            violations.push(`${viewer} 的事件里有别人贿赂牌的成败`);
        }

        // (2) 没翻开就被弃掉的梦魇：只有梦主拿得到它的 ID
        if (original.kind === 'nightmare_discarded' && original.secret && !entitled) {
          samples.nightmare++;
          const id = original.secret.data.nightmare as string;
          if (text.includes(`"${id}"`)) violations.push(`${viewer} 的事件里有未翻开的梦魇 ${id}`);
        }
      });

      // (3) 这一步之后仍未翻开、且不是本人的玩家，他的角色不得出现（翻开之后的事件里出现是允许的）
      for (const [id, character] of Object.entries(st.hiddenChars)) {
        if (id === viewer || character === '') continue;
        samples.character++;
        if (text.includes(`"${character}"`)) violations.push(`${viewer} 的事件里有 ${id} 的角色`);
      }
    }
  }
  return { violations, samples };
}

describe('事件泄露扫描', () => {
  const allSteps = played.flatMap((p) => p.steps);
  const playersOf = (p: Played): string[] => p.final.G.playerOrder;

  it('随机对局：每类秘密都不出现在不该看到的观察者的事件里，且每类都有样本', () => {
    const total = { bribe: 0, nightmare: 0, character: 0, drawn: 0, args: 0 };
    for (const p of played) {
      const result = scanLeaks(p.steps, playersOf(p), eventsFor);
      expect(result.violations).toEqual([]);
      for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += result.samples[k];
    }
    expect(allSteps.length).toBeGreaterThan(1000);
    expect(total.bribe).toBeGreaterThan(0);
    expect(total.nightmare).toBeGreaterThan(0);
    expect(total.character).toBeGreaterThan(0);
    expect(total.drawn).toBeGreaterThan(0);
    expect(total.args).toBeGreaterThan(0);
  });

  it('金丝雀：eventsFor 换成原样返回的函数时，扫描必须发现泄露', () => {
    const identity: EventFilter = (events) => [...events];
    let found = 0;
    for (const p of played) {
      found += scanLeaks(p.steps, playersOf(p), identity).violations.length;
    }
    expect(found).toBeGreaterThan(0);
  });
});
