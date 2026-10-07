import { ApiClientError } from './client';

/** User-facing copy for API failures. Never shows provider/internal detail. */
export function describeError(err: unknown): { title: string; message: string } {
  if (err instanceof ApiClientError) {
    switch (err.code) {
      case 'NETWORK':
        return { title: 'You appear to be offline', message: 'Check your connection and try again.' };
      case 'RATE_LIMITED':
        return {
          title: 'Too many requests',
          message: err.retryAfterSeconds
            ? `Please wait about ${err.retryAfterSeconds} seconds and try again.`
            : 'Please wait a moment and try again.',
        };
      case 'PROVIDER_TIMEOUT':
      case 'PROVIDER_UNAVAILABLE':
        return { title: 'Train data is temporarily unavailable', message: 'Please try again in a moment.' };
      case 'NOT_FOUND':
        return { title: 'Not found', message: err.message };
      case 'INVALID_REQUEST':
        return { title: 'Check your search', message: err.message };
    }
  }
  return { title: 'Something went wrong', message: 'Please try again.' };
}

/** Don't hammer the server on permanent failures. */
export function shouldRetry(failureCount: number, err: unknown): boolean {
  if (err instanceof ApiClientError && ['NOT_FOUND', 'INVALID_REQUEST', 'RATE_LIMITED'].includes(err.code)) {
    return false;
  }
  return failureCount < 2;
}
