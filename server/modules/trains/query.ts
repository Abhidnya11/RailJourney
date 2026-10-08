import { AppError } from '../../errors.js';

const MAX_LEN = 60;
// Letters (incl. other scripts), digits, spaces and a few name punctuation marks.
const ALLOWED = /^[\p{L}\p{N} .'&()/-]+$/u;

/** Trim, collapse whitespace, validate. Returns the display query and a cache-key form. */
export function normalizeSearchQuery(raw: unknown): { query: string; key: string } {
  if (typeof raw !== 'string') throw new AppError('INVALID_REQUEST', 'A search query is required.');
  const query = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if ([...query].length < 2) {
    throw new AppError('INVALID_REQUEST', 'Enter at least two characters to search.');
  }
  if (query.length > MAX_LEN || !ALLOWED.test(query)) {
    throw new AppError('INVALID_REQUEST', 'The search query contains unsupported characters.');
  }
  return { query, key: query.toLowerCase() };
}
