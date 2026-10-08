import { AppError, PermanentProviderError } from '../errors.js';

export interface RetryOptions {
  maxRetries: number;
  timeoutMs: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Runs `fn` with a per-attempt timeout, retrying transient failures with exponential backoff and
 * full jitter. Permanent errors (PermanentProviderError, NOT_FOUND, INVALID_REQUEST) are not retried.
 * Surfaces only AppErrors so provider messages never reach clients.
 */
export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const { maxRetries, timeoutMs, baseDelayMs = 250, sleep = defaultSleep, random = Math.random } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // Race against the abort so the timeout holds even if `fn` ignores the signal.
    const aborted = new Promise<never>((_, reject) =>
      controller.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }),
    );
    try {
      return await Promise.race([fn(controller.signal), aborted]);
    } catch (err) {
      lastError = controller.signal.aborted
        ? new AppError('PROVIDER_TIMEOUT', 'The data provider took too long to respond.', undefined, { cause: err })
        : err;
      if (isPermanent(lastError)) throw lastError;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < maxRetries) await sleep(random() * baseDelayMs * 2 ** attempt);
  }
  if (lastError instanceof AppError) throw lastError;
  throw new AppError('PROVIDER_UNAVAILABLE', 'The data provider is temporarily unavailable.', undefined, {
    cause: lastError,
  });
}

function isPermanent(err: unknown): boolean {
  if (err instanceof PermanentProviderError) return true;
  return err instanceof AppError && (err.code === 'NOT_FOUND' || err.code === 'INVALID_REQUEST');
}
