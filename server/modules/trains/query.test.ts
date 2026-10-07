import { describe, expect, it } from 'vitest';
import { normalizeSearchQuery } from './query';

describe('normalizeSearchQuery', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeSearchQuery('  Mumbai   Rajdhani ')).toEqual({ query: 'Mumbai Rajdhani', key: 'mumbai rajdhani' });
  });
  it('accepts train numbers', () => {
    expect(normalizeSearchQuery(' 12952 ').query).toBe('12952');
  });
  it('rejects short, non-string and unsupported input', () => {
    expect(() => normalizeSearchQuery('a')).toThrow('two characters');
    expect(() => normalizeSearchQuery('   ')).toThrow();
    expect(() => normalizeSearchQuery(undefined)).toThrow();
    expect(() => normalizeSearchQuery('<script>')).toThrow('unsupported');
    expect(() => normalizeSearchQuery('x'.repeat(100))).toThrow();
  });
});
