import { describe, it, expect } from 'vitest';
import { FIXTURE_SCENARIO_IDS, resolveFixtureScenario } from './scenarios';

const q = (s: string) => new URLSearchParams(s);

describe('resolveFixtureScenario', () => {
  it('无参数时是盗梦者视角的缺省场景', () => {
    expect(resolveFixtureScenario(q(''))).toBe('thief');
  });

  it('as=master 进入梦主视角', () => {
    expect(resolveFixtureScenario(q('as=master'))).toBe('master');
  });

  it('pending=1 进入带解封响应窗口的盗梦者场景', () => {
    expect(resolveFixtureScenario(q('pending=1'))).toBe('thief-pending');
  });

  it('as=master 与 pending=1 同时给出时是梦主视角的响应窗口场景', () => {
    expect(resolveFixtureScenario(q('as=master&pending=1'))).toBe('master-pending');
  });

  it('无法识别的取值按缺省处理', () => {
    expect(resolveFixtureScenario(q('as=ghost&pending=yes'))).toBe('thief');
    expect(resolveFixtureScenario(q('as=thief&pending=0'))).toBe('thief');
  });

  it('只会得到已登记的场景', () => {
    for (const s of ['', 'as=master', 'pending=1', 'as=master&pending=1']) {
      expect(FIXTURE_SCENARIO_IDS).toContain(resolveFixtureScenario(q(s)));
    }
  });
});
