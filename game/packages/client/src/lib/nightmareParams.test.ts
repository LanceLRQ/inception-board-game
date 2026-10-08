import { describe, expect, it } from 'vitest';
import {
  EMPTY_NIGHTMARE_DRAFT,
  nightmareParamKind,
  nightmareParamsOf,
  nightmareParamsReady,
  plagueCandidates,
  togglePlagueTarget,
} from './nightmareParams';

describe('梦魇附加参数 · 种类', () => {
  it('回音萦绕、邪念瘟疫要参数，其余梦魇与看不到的梦魇不要', () => {
    expect(nightmareParamKind('nightmare_echo')).toBe('echo');
    expect(nightmareParamKind('nightmare_plague')).toBe('plague');
    expect(nightmareParamKind('nightmare_vortex')).toBe('none');
    expect(nightmareParamKind('nightmare_hunger_bite')).toBe('none');
    expect(nightmareParamKind(null)).toBe('none');
    expect(nightmareParamKind(undefined)).toBe('none');
  });
});

describe('梦魇附加参数 · 草稿与参数对象', () => {
  it('回音萦绕：层与方式都选了才就绪，参数对象与引擎的字段名一致', () => {
    expect(nightmareParamsReady('echo', EMPTY_NIGHTMARE_DRAFT)).toBe(false);
    expect(nightmareParamsReady('echo', { ...EMPTY_NIGHTMARE_DRAFT, echoLayer: 2 })).toBe(false);
    const done = { ...EMPTY_NIGHTMARE_DRAFT, echoLayer: 2, echoAction: 'add' as const };
    expect(nightmareParamsReady('echo', done)).toBe(true);
    expect(nightmareParamsOf('echo', done)).toEqual({ targetLayer: 2, action: 'add' });
    expect(nightmareParamsOf('echo', EMPTY_NIGHTMARE_DRAFT)).toBeUndefined();
  });

  it('邪念瘟疫：可以一个都不点名；参数对象是点名名单的副本', () => {
    expect(nightmareParamsReady('plague', EMPTY_NIGHTMARE_DRAFT)).toBe(true);
    expect(nightmareParamsOf('plague', EMPTY_NIGHTMARE_DRAFT)).toEqual({ bribedTargets: [] });
    const picked = { ...EMPTY_NIGHTMARE_DRAFT, bribed: ['1', '3'] };
    const params = nightmareParamsOf('plague', picked)!;
    expect(params).toEqual({ bribedTargets: ['1', '3'] });
    expect(params['bribedTargets']).not.toBe(picked.bribed);
  });

  it('不需要参数的梦魇没有参数对象', () => {
    expect(nightmareParamsReady('none', EMPTY_NIGHTMARE_DRAFT)).toBe(true);
    expect(nightmareParamsOf('none', EMPTY_NIGHTMARE_DRAFT)).toBeUndefined();
  });
});

describe('邪念瘟疫 · 点名', () => {
  const players = {
    '0': { isAlive: true },
    '1': { isAlive: true },
    '2': { isAlive: false },
    '3': { isAlive: true },
  };

  it('候选只含该层存活的非梦主座位', () => {
    expect(plagueCandidates(['0', '1', '2', '3'], players, '0')).toEqual(['1', '3']);
    expect(plagueCandidates(['9'], players, '0')).toEqual([]);
  });

  it('点名切换：再点取消，不能超过贿赂池里的张数', () => {
    expect(togglePlagueTarget([], '1', 2)).toEqual(['1']);
    expect(togglePlagueTarget(['1'], '3', 2)).toEqual(['1', '3']);
    expect(togglePlagueTarget(['1', '3'], '2', 2)).toEqual(['1', '3']);
    expect(togglePlagueTarget(['1', '3'], '1', 2)).toEqual(['3']);
    expect(togglePlagueTarget([], '1', 0)).toEqual([]);
  });
});
