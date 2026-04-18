// REST API 错误码定义（参照设计文档 §7.3.1）

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'ROOM_FULL'
  | 'ROOM_STARTED'
  | 'ROOM_EXPIRED'
  | 'INVALID_RECOVERY_CODE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  ROOM_FULL: 409,
  ROOM_STARTED: 409,
  ROOM_EXPIRED: 410,
  INVALID_RECOVERY_CODE: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }

  get status(): number {
    return HTTP_STATUS[this.code];
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
