import { describe, it, expect } from 'vitest';
import {
  FIXTURE_DEFAULT_PLAYERS,
  FIXTURE_SCENARIO_IDS,
  parseFixturePlayers,
  resolveFixtureScenario,
} from './scenarios';

const q = (s: string) => new URLSearchParams(s);

const idOf = (s: string) => resolveFixtureScenario(q(s)).id;

describe('resolveFixtureScenario · skill=', () => {
  it.each([
    ['draw', 'skill-draw'],
    ['joker', 'skill-joker'],
    ['gemini-back', 'skill-gemini-back'],
    ['chemist', 'skill-chemist'],
    ['space-queen', 'skill-space-queen'],
    ['space-queen-other', 'skill-space-queen-other'],
    ['gaia', 'skill-gaia'],
    ['aries-glow', 'skill-aries-glow'],
    ['black-hole', 'skill-black-hole'],
    ['terrorist', 'skill-terrorist'],
    ['sagittarius', 'skill-sagittarius'],
    ['venus', 'skill-venus'],
    ['black-swan', 'skill-black-swan'],
    ['luna', 'skill-luna'],
    ['pisces', 'skill-pisces'],
    ['darwin', 'skill-darwin'],
    ['green-ray', 'skill-green-ray'],
    ['aquarius', 'skill-aquarius'],
    ['heart-lock', 'skill-heart-lock'],
    ['venus-mirror', 'skill-venus-mirror'],
    ['passage', 'skill-passage'],
    ['imperial', 'skill-imperial'],
    ['saturn', 'skill-saturn'],
    ['nightmare', 'skill-nightmare'],
    ['unlock-none', 'skill-unlock-none'],
    ['unlock-spent', 'skill-unlock-spent'],
  ])('skill=%s 进入 %s', (name, id) => {
    expect(idOf(`skill=${name}`)).toBe(id);
  });

  it('skill 场景自带视角，盖过 as=master / discard / dead 等；响应窗口与待应答参数优先', () => {
    expect(idOf('skill=chemist&as=master')).toBe('skill-chemist');
    expect(idOf('skill=chemist&discard=1')).toBe('skill-chemist');
    expect(idOf('skill=chemist&pending=1')).toBe('thief-pending');
    expect(idOf('skill=chemist&pending=shoot')).toBe('thief-pending-shoot');
  });

  it('不认识的 skill 值被忽略；可与 players、chat 叠加', () => {
    expect(idOf('skill=nope')).toBe('thief');
    expect(resolveFixtureScenario(q('skill=draw&players=8&chat=1'))).toEqual({
      id: 'skill-draw',
      players: 8,
      extras: { chat: true },
    });
  });
});

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
    expect(idOf('pending=aries-plague')).toBe('thief-pending-aries-plague');
  });

  it('vault=echo|plague 与 as=master 叠加：梦主待金库三选一，该层梦魇是回音萦绕 / 邪念瘟疫', () => {
    expect(idOf('as=master&vault=echo')).toBe('master-vault-echo');
    expect(idOf('as=master&vault=plague')).toBe('master-vault-plague');
    expect(idOf('as=master&vault=other')).toBe('master');
    // 盗梦者视角、响应窗口、棋局参数让位
    expect(idOf('vault=echo')).toBe('thief');
    expect(idOf('as=master&vault=echo&pending=1')).toBe('master-pending');
    expect(idOf('as=master&vault=echo&chess=1')).toBe('master-chess');
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
