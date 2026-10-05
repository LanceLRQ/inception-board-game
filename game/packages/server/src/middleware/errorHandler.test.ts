import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type { Context } from 'koa';
import { errorHandler } from './errorHandler.js';

vi.mock('../infra/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('errorHandler', () => {
  it('请求体校验失败（ZodError）返回 400 与 VALIDATION_ERROR', async () => {
    const ctx = {} as Context;
    await errorHandler(ctx, async () => {
      z.object({ a: z.string() }).parse({});
    });
    expect(ctx.status).toBe(400);
    expect((ctx.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });
});
