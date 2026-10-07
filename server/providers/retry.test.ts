import { describe, expect, it, vi } from 'vitest';
import { AppError, PermanentProviderError } from '../errors';
import { withRetry } from './retry';

const opts = { maxRetries: 2, timeoutMs: 1000, sleep: async () => undefined, random: () => 0.5 };

describe('withRetry', () => {
  it('retries transient failures then succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok');
    expect(await withRetry(fn, opts)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry permanent errors', async () => {
    const fn = vi.fn().mockRejectedValue(new PermanentProviderError());
    await expect(withRetry(fn, opts)).rejects.toBeInstanceOf(PermanentProviderError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxRetries with a sanitized error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('secret upstream detail'));
    const err = (await withRetry(fn, opts).catch((e) => e)) as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('PROVIDER_UNAVAILABLE');
    expect(err.message).not.toContain('secret');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('times out even when fn ignores the signal', async () => {
    const fn = () => new Promise<never>(() => undefined);
    const err = (await withRetry(fn, { ...opts, maxRetries: 0, timeoutMs: 10 }).catch((e) => e)) as AppError;
    expect(err.code).toBe('PROVIDER_TIMEOUT');
  });

  it('maps aborts to a timeout error', async () => {
    const fn = (signal: AbortSignal) =>
      new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    const err = (await withRetry(fn, { ...opts, maxRetries: 0, timeoutMs: 10 }).catch((e) => e)) as AppError;
    expect(err.code).toBe('PROVIDER_TIMEOUT');
  });
});
