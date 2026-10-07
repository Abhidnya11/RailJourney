import type { ApiError } from '../shared/domain';

export type ErrorCode = ApiError['error']['code'];

const STATUS: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  PROVIDER_UNAVAILABLE: 502,
  PROVIDER_TIMEOUT: 504,
  INTERNAL: 500,
};

/** Error safe to surface to clients: the message is written by us, never copied from a provider. */
export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AppError';
    this.status = STATUS[code];
  }
  /** Fastify reads `statusCode` off thrown errors (including ones built by rate-limit). */
  get statusCode() {
    return this.status;
  }
  toBody(): ApiError {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.retryAfterSeconds !== undefined && { retryAfterSeconds: this.retryAfterSeconds }),
      },
    };
  }
}

/** Permanent upstream failures (4xx) must not be retried. */
export class PermanentProviderError extends AppError {
  constructor(message = 'The data provider rejected the request.', cause?: unknown) {
    super('PROVIDER_UNAVAILABLE', message, undefined, { cause });
  }
}
