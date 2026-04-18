// Cursor 分页工具（参照设计文档 §7.3.1）

import { z } from 'zod';

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
  return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
}
