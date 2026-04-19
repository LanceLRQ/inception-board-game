import { describe, it, expect } from 'vitest';
import { AppError } from '../infra/errors.js';

describe('AppError', () => {
  it('should produce correct JSON', () => {
    const err = new AppError('NOT_FOUND', '资源不存在');
    expect(err.status).toBe(404);
    expect(err.toJSON()).toEqual({
      error: { code: 'NOT_FOUND', message: '资源不存在' },
    });
  });

  it('should include details when provided', () => {
    const err = new AppError('VALIDATION_ERROR', '参数错误', { field: 'nickname' });
    expect(err.status).toBe(422);
    expect(err.toJSON().error.details).toEqual({ field: 'nickname' });
  });
});
