import { describe, expect, it } from 'vitest';
import { computeFreshness } from './freshness.js';

const now = new Date('2026-10-01T18:10:00Z');
const ago = (s: number) => new Date(now.getTime() - s * 1000).toISOString();

describe('computeFreshness', () => {
  it('classifies by age', () => {
    expect(computeFreshness(ago(0), now)).toBe('FRESH');
    expect(computeFreshness(ago(60), now)).toBe('FRESH');
    expect(computeFreshness(ago(61), now)).toBe('AGING');
    expect(computeFreshness(ago(180), now)).toBe('AGING');
    expect(computeFreshness(ago(181), now)).toBe('STALE');
  });
  it('treats invalid timestamps as stale and future ones as fresh', () => {
    expect(computeFreshness('nope', now)).toBe('STALE');
    expect(computeFreshness(ago(-30), now)).toBe('FRESH');
  });
  it('honours custom thresholds', () => {
    expect(computeFreshness(ago(20), now, { freshSeconds: 10, staleSeconds: 30 })).toBe('AGING');
  });
});
