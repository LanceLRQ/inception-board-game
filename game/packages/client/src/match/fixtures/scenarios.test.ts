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

  it('无法识别的取值按缺省处理', () => {
    expect(idOf('as=ghost&pending=yes')).toBe('thief');
    expect(idOf('as=thief&pending=0')).toBe('thief');
  });

  it('只会得到已登记的场景', () => {
    for (const s of ['', 'as=master', 'pending=1', 'as=master&pending=1', 'discard=1']) {
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
