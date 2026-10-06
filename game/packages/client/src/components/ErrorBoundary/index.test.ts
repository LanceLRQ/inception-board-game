// 错误边界的纯函数部分：错误展示信息、404 判定

import { describe, it, expect } from 'vitest';
import { describeError, isNotFoundError } from './index.js';

describe('describeError', () => {
  it('Error 实例取 name 与 message', () => {
    const err = new TypeError('boom');
    expect(describeError(err)).toEqual({ name: 'TypeError', message: 'boom' });
  });

  it('自定义错误类沿用自己的 name', () => {
    class AppError extends Error {
      override name = 'AppError';
    }
    expect(describeError(new AppError('bad'))).toEqual({ name: 'AppError', message: 'bad' });
  });

  it('字符串当作 message', () => {
    expect(describeError('oops')).toEqual({ name: 'Error', message: 'oops' });
  });

  it('路由错误响应显示状态码与状态文本', () => {
    const res = { status: 500, statusText: 'Server Error', data: 'x', internal: false };
    expect(describeError(res)).toEqual({ name: 'HTTP 500', message: 'Server Error' });
  });

  it('路由错误响应没有状态文本时回退到字符串 data', () => {
    const res = { status: 404, statusText: '', data: 'Not Found', internal: true };
    expect(describeError(res)).toEqual({ name: 'HTTP 404', message: 'Not Found' });
  });

  it('普通对象序列化为 JSON', () => {
    expect(describeError({ code: 1 })).toEqual({ name: 'UnknownError', message: '{"code":1}' });
  });

  it('循环引用对象不抛错，回退到 String()', () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    const info = describeError(a);
    expect(info.name).toBe('UnknownError');
    expect(info.message).toBe('[object Object]');
  });

  it('null / undefined 给出固定文案', () => {
    expect(describeError(null)).toEqual({ name: 'UnknownError', message: '未知错误' });
    expect(describeError(undefined)).toEqual({ name: 'UnknownError', message: '未知错误' });
  });
});

describe('isNotFoundError', () => {
  it('404 路由错误响应为真', () => {
    expect(
      isNotFoundError({ status: 404, statusText: 'Not Found', data: '', internal: true }),
    ).toBe(true);
  });

  it('其他状态码、普通 Error、空值为假', () => {
    expect(isNotFoundError({ status: 500, statusText: '', data: '', internal: false })).toBe(false);
    expect(isNotFoundError(new Error('x'))).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
  });
});
