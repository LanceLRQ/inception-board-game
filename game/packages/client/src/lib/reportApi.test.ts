import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./logger', () => ({
  logger: { flow: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { ApiRequestError, api } from './api';
import {
  REPORT_DESCRIPTION_MAX,
  REPORT_REASONS,
  reportOutcomeFromError,
  submitMatchReport,
} from './reportApi';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reportOutcomeFromError', () => {
  it.each([
    [new ApiRequestError(409, 'DUPLICATE', 'x'), 'duplicate'],
    [new ApiRequestError(403, 'FORBIDDEN', 'x'), 'forbidden'],
    [new ApiRequestError(404, 'NOT_FOUND', 'x'), 'not_found'],
    [new ApiRequestError(400, 'INVALID_TARGET', 'x'), 'invalid'],
    [new ApiRequestError(400, 'SELF_REPORT', 'x'), 'invalid'],
    [new ApiRequestError(400, 'VALIDATION_ERROR', 'x'), 'invalid'],
    [new ApiRequestError(429, 'RATE_LIMITED', 'x'), 'rate_limited'],
    [new ApiRequestError(0, 'NETWORK_ERROR', 'x'), 'network'],
    [new ApiRequestError(503, 'UNKNOWN', 'x'), 'unknown'],
    [new Error('boom'), 'network'],
  ])('%#：映射为 %s', (err, code) => {
    expect(reportOutcomeFromError(err)).toEqual({ ok: false, code });
  });
});

describe('submitMatchReport', () => {
  it('按服务端约定提交：座位号、理由与去掉首尾空白的描述', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ reported: true });
    const out = await submitMatchReport('m-1', 3, 'afk', '  一直没动  ');
    expect(out).toEqual({ ok: true });
    expect(post).toHaveBeenCalledWith('/matches/m-1/report', {
      targetSeat: 3,
      reason: 'afk',
      description: '一直没动',
    });
  });

  it('没有描述时不带 description；超长描述截到上限', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ reported: true });
    await submitMatchReport('m-1', 1, 'other', '   ');
    expect(post).toHaveBeenLastCalledWith('/matches/m-1/report', {
      targetSeat: 1,
      reason: 'other',
    });
    await submitMatchReport('m-1', 1, 'other', 'x'.repeat(REPORT_DESCRIPTION_MAX + 20));
    const body = post.mock.calls.at(-1)![1] as { description: string };
    expect(body.description).toHaveLength(REPORT_DESCRIPTION_MAX);
  });

  it('对局编号里有特殊字符时做路径编码', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({});
    await submitMatchReport('a/b c', 0, 'cheating');
    expect(post.mock.calls[0]![0]).toBe('/matches/a%2Fb%20c/report');
  });

  it('接口报错转成结果，不抛出', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new ApiRequestError(409, 'DUPLICATE', 'dup'));
    await expect(submitMatchReport('m-1', 2, 'abusive')).resolves.toEqual({
      ok: false,
      code: 'duplicate',
    });
  });
});

describe('REPORT_REASONS', () => {
  it('与服务端接受的四种理由一致', () => {
    expect([...REPORT_REASONS]).toEqual(['cheating', 'afk', 'abusive', 'other']);
  });
});
