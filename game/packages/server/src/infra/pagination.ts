// Cursor 分页工具

import { z } from 'zod';
import { AppError } from './errors.js';

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export interface PageResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function encodeCursor(fields: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(fields)).toString('base64url');
}

export function decodeCursor(cursor: string): Record<string, string | number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
  } catch {
    throw new AppError('VALIDATION_ERROR', 'invalid cursor');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AppError('VALIDATION_ERROR', 'invalid cursor');
  }
  return parsed as Record<string, string | number>;
}
