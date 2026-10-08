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
  /** 这一步牌库的变化与去向，全部从状态前后算出；重洗（弃牌堆回牌库）的那一步为 null */
  deck: DeckAccount | null;
}

interface DeckAccount {
  /** 牌库减少量，进入牌库多于离开时为负 */
  left: number;
  /** 离开牌库的牌（按种类的多重集差，从状态前后算） */
  out: string[];
  /** 从手牌放回牌库的张数（按种类的多重集差） */
  entered: number;
  /** 本步新增的「移出游戏」的牌里，不是从手牌来的张数（被翻开的牌库顶） */
  flipped: number;
  /** 弃牌堆新增的牌（按种类的多重集差，含手牌弃掉的和牌库直接进来的） */
  discardGain: string[];
}

/** 多重集差：a 里去掉 b 之后剩下的牌 */
function minus(a: readonly string[], b: readonly string[]): string[] {
  const left = new Map<string, number>();
  for (const x of b) left.set(x, (left.get(x) ?? 0) + 1);
  const out: string[] = [];
  for (const x of a) {
    const n = left.get(x) ?? 0;
    if (n > 0) left.set(x, n - 1);
    else out.push(x);
  }
  return out;
}

/** 多重集交：a 与 b 共有的牌 */
function common(a: readonly string[], b: readonly string[]): string[] {
  return minus(a, minus(a, b));
}

function accountDeck(was: SetupState, now: SetupState): DeckAccount | null {
  const out = minus(was.deck.cards, now.deck.cards);
  const entered = minus(now.deck.cards, was.deck.cards);
  const discardLoss = minus(was.deck.discardPile, now.deck.discardPile);
  // 进入牌库的牌里有从弃牌堆来的，说明重洗过，这一步按差值算不了
  if (common(entered, discardLoss).length > 0) return null;
  // 移出游戏的只有时间风暴本身。不能用「手牌里少了几张风暴」来对账：战争之王·黑市可以一边弃出一张风暴，
  // 一边从弃牌堆（被翻开的牌里可能有风暴）拿回另一张，手牌里的风暴数不变。
  // 所以只看新增的移出牌里有没有不是时间风暴的，那才是被翻开移出的牌库顶
  const newlyRemoved = now.removedFromGame.slice(was.removedFromGame.length);
  const flippedOut = newlyRemoved.filter((card) => card !== 'action_time_storm').length;
  return {
    left: was.deck.cards.length - now.deck.cards.length,
    out,
    entered: entered.length,
    flipped: flippedOut,
    discardGain: minus(now.deck.discardPile, was.deck.discardPile),
  };
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
    const hiddenChars: Record<string, string> = {};
    for (const id of now.playerOrder) {
      if (!now.players[id]!.isRevealed) hiddenChars[id] = now.players[id]!.characterId;
    }
    steps.push({
      move: request.move,
      events: res.events,
      hiddenChars,
      deck: accountDeck(was, now),
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
  // 现有种子之外再加几组不同后缀：对账结论不能依赖某一个种子的布局
  for (const suffix of ['a', 'b', 'c', 'd', 'e']) GAMES.push({ n, seed: `replay-${n}-${suffix}` });
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

        // 解封计数：心锁下降的解封都算。迷失层没有心锁，那里的解封照常走完待解封流程，
        // 引擎照样给解封者记一次 unlockCount，但心锁不变，事件里表现为 success 为否。
        // 被【解封】取消的解封（respondCancelUnlock）在事件里同样是 success 为否，
        // 单看事件分不出两者，所以按产生这条事件的 move 区分：取消的不计数，其余迷失层的照计。
        const unlockEvents = events.filter(
          (e) => e.kind === 'unlock_resolved' && e.data.player === id,
        );
        const lostLayerUnlocks = unlockEvents.filter(
          (e) =>
            e.data.success === false &&
            e.data.layer === 0 &&
            p.record.moves[e.stateID - 1]!.move !== 'respondCancelUnlock',
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

  it('对账：离开牌库的牌都有去向，直接进弃牌堆的牌都在 cards_discarded 里', () => {
    // 离开牌库的牌 = 抽到手里的（cards_drawn）+ 翻开移出游戏的 + 直接进弃牌堆的；
    // 放回牌库的牌（嫁接归还、空间女王、进化）反向抵扣。对所有 move 成立，不按 move 名字特判。
    // 直接进弃牌堆的张数 = 离开张数 - 抽到的 - 翻开的（状态前后的差减去前两项）；
    // 它必须非负，且这些牌在弃牌堆新增和 cards_discarded 里都找得到，否则说明有牌凭空消失。
    // 唯一的例外是重洗那一步（弃牌堆回到牌库），差值算不了。
    let checked = 0;
    let withFlip = 0;
    let withDeckDiscard = 0;
    let withReturn = 0;
    for (const p of played) {
      for (const st of p.steps) {
        const d = st.deck;
        if (d === null) continue;
        const where = `${p.record.seed} ${st.move}`;
        const drawn = st.events
          .filter((e) => e.kind === 'cards_drawn')
          .reduce((t, e) => t + (e.data.count as number), 0);
        const toDiscard = d.out.length - drawn - d.flipped;
        expect(d.left, where).toBe(drawn + d.flipped + toDiscard - d.entered);
        expect(toDiscard, `${where} 直接进弃牌堆的张数不能为负`).toBeGreaterThanOrEqual(0);
        const announced = st.events
          .filter((e) => e.kind === 'cards_discarded')
          .flatMap((e) => e.data.cards as string[]);
        expect(
          common(d.out, d.discardGain).length,
          `${where} 直接进弃牌堆的牌要在弃牌堆新增里`,
        ).toBeGreaterThanOrEqual(toDiscard);
        expect(
          common(d.out, announced).length,
          `${where} 直接进弃牌堆的牌要在 cards_discarded 里`,
        ).toBeGreaterThanOrEqual(toDiscard);
        checked++;
        if (d.flipped > 0) withFlip++;
        if (toDiscard > 0) withDeckDiscard++;
        if (d.entered > 0) withReturn++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
    // 时间风暴翻开的牌进弃牌堆，移出游戏的只有风暴自己，所以不会再有「被翻开移出」的牌
    expect(withFlip).toBe(0);
    expect(withDeckDiscard).toBeGreaterThan(0);
    expect(withReturn).toBeGreaterThan(0);
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
