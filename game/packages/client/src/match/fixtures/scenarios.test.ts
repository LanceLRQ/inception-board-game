import { describe, it, expect } from 'vitest';
import {
  FIXTURE_DEFAULT_PLAYERS,
  FIXTURE_SCENARIO_IDS,
  parseFixturePlayers,
  resolveFixtureScenario,
} from './scenarios';

const q = (s: string) => new URLSearchParams(s);

const idOf = (s: string) => resolveFixtureScenario(q(s)).id;

describe('resolveFixtureScenario', () => {
  it('无参数时是盗梦者视角的缺省场景，缺省人数', () => {
    expect(resolveFixtureScenario(q(''))).toEqual({
      id: 'thief',
      players: FIXTURE_DEFAULT_PLAYERS,
    });
  });

  it('as=master 进入梦主视角', () => {
    expect(idOf('as=master')).toBe('master');
  });

  it('pending=1 进入带解封响应窗口的盗梦者场景', () => {
    expect(idOf('pending=1')).toBe('thief-pending');
  });

  it('as=master 与 pending=1 同时给出时是梦主视角的响应窗口场景', () => {
    expect(idOf('as=master&pending=1')).toBe('master-pending');
  });

  it('discard=1 进入盗梦者的弃牌阶段场景；梦主视角与响应窗口参数优先', () => {
    expect(idOf('discard=1')).toBe('thief-discard');
    expect(idOf('discard=1&as=master')).toBe('master');
    expect(idOf('discard=1&pending=1')).toBe('thief-pending');
    expect(idOf('discard=0')).toBe('thief');
  });

  it('dead=1 进入本人在迷失层的场景；dead=mate 是同伴在迷失层，可与 as=master 叠加', () => {
    expect(idOf('dead=1')).toBe('thief-dead');
    expect(idOf('dead=mate')).toBe('thief-mate-dead');
    expect(idOf('as=master&dead=mate')).toBe('master-mate-dead');
    // 本人是梦主时没有「本人在迷失层」；其余参数优先于 dead
    expect(idOf('as=master&dead=1')).toBe('master');
    expect(idOf('dead=1&pending=1')).toBe('thief-pending');
    expect(idOf('dead=1&pending=virgo')).toBe('thief-pending-virgo');
    expect(idOf('dead=1&discard=1')).toBe('thief-discard');
    expect(idOf('dead=0')).toBe('thief');
  });

  it('bribe=1 只在梦主视角生效：一名盗梦者持有贿赂牌', () => {
    expect(idOf('as=master&bribe=1')).toBe('master-bribe');
    expect(idOf('bribe=1')).toBe('thief');
    expect(idOf('as=master&bribe=1&chess=1')).toBe('master-chess');
  });

  it('pending=各待应答名 进入轮到本人应答的盗梦者场景', () => {
    expect(idOf('pending=shoot')).toBe('thief-pending-shoot');
    expect(idOf('pending=terrorist')).toBe('thief-pending-terrorist');
    expect(idOf('pending=libra-split')).toBe('thief-pending-libra-split');
    expect(idOf('pending=libra-pick')).toBe('thief-pending-libra-pick');
    expect(idOf('pending=sudger')).toBe('thief-pending-sudger');
    expect(idOf('pending=virgo')).toBe('thief-pending-virgo');
    expect(idOf('pending=aries')).toBe('thief-pending-aries');
  });

  it('待应答场景只在盗梦者视角：as=master 时忽略；弃牌参数让位于待应答', () => {
    expect(idOf('as=master&pending=virgo')).toBe('master');
    expect(idOf('pending=virgo&discard=1')).toBe('thief-pending-virgo');
    expect(idOf('pending=constructor')).toBe('thief');
    expect(idOf('pending=toString')).toBe('thief');
  });

  it('character=sudger 进入本人是意念判官的场景；梦主视角、响应窗口与待应答参数优先', () => {
    expect(idOf('character=sudger')).toBe('thief-sudger');
    expect(idOf('character=sudger&as=master')).toBe('master');
    expect(idOf('character=sudger&pending=1')).toBe('thief-pending');
    expect(idOf('character=sudger&pending=virgo')).toBe('thief-pending-virgo');
    expect(idOf('character=sudger&discard=1')).toBe('thief-discard');
    expect(idOf('character=other')).toBe('thief');
  });

  it('as=master&chess=1 进入梦主是棋局的场景；pending=1 优先，没有 as=master 时 chess 无效', () => {
    expect(idOf('as=master&chess=1')).toBe('master-chess');
    expect(idOf('as=master&chess=1&pending=1')).toBe('master-pending');
    expect(idOf('chess=1')).toBe('thief');
  });

  it('chat=1 与 outcome 参数只加走查开关，不改变局面', () => {
    expect(resolveFixtureScenario(q('chat=1')).extras).toEqual({ chat: true });
    expect(resolveFixtureScenario(q('outcome=1')).extras).toEqual({ outcome: 'ok' });
    expect(resolveFixtureScenario(q('outcome=duplicate')).extras).toEqual({ outcome: 'duplicate' });
    expect(resolveFixtureScenario(q('outcome=failed&chat=1')).extras).toEqual({
      chat: true,
      outcome: 'failed',
    });
    expect(idOf('as=master&chat=1&outcome=1')).toBe('master');
  });

  it('没有走查开关、或取值无法识别时没有 extras', () => {
    expect(resolveFixtureScenario(q('')).extras).toBeUndefined();
    expect(resolveFixtureScenario(q('chat=0&outcome=ok')).extras).toBeUndefined();
    expect(resolveFixtureScenario(q('outcome=constructor')).extras).toBeUndefined();
  });

  it('无法识别的取值按缺省处理', () => {
    expect(idOf('as=ghost&pending=yes')).toBe('thief');
    expect(idOf('as=thief&pending=0')).toBe('thief');
  });

  it('只会得到已登记的场景', () => {
    for (const s of [
      '',
      'as=master',
      'pending=1',
      'as=master&pending=1',
      'discard=1',
      'pending=shoot',
      'pending=aries',
      'as=master&chess=1',
    ]) {
      expect(FIXTURE_SCENARIO_IDS).toContain(idOf(s));
    }
  });

  it('players 参数与视角参数互不影响', () => {
    expect(resolveFixtureScenario(q('as=master&pending=1&players=10'))).toEqual({
      id: 'master-pending',
      players: 10,
    });
  });
});

describe('parseFixturePlayers', () => {
  it('4–10 的整数原样采用', () => {
    for (let n = 4; n <= 10; n++) expect(parseFixturePlayers(String(n))).toBe(n);
  });

  it('缺失、越界、非整数、非数字都回落缺省', () => {
    for (const bad of [null, '', '3', '11', '0', '-5', '6.5', 'abc', '1e1', ' 6', '6 ']) {
      expect(parseFixturePlayers(bad)).toBe(FIXTURE_DEFAULT_PLAYERS);
    }
  });
});
