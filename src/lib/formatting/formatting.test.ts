import { describe, expect, it } from 'vitest';
import { formatAge, formatDelay, formatDelayShort, formatKm, formatPercent, nextDeparture, runDaysLabel } from './index';

describe('schedule', () => {
  // 2026-10-07 is a Wednesday. 12:00 UTC = 17:30 IST.
  const noon = new Date('2026-10-07T12:00:00Z');
  it('labels run days', () => {
    expect(runDaysLabel(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).toBe('Daily');
    expect(runDaysLabel(['fri', 'mon', 'wed'])).toBe('Mon, Wed, Fri');
    expect(runDaysLabel([])).toBeNull();
  });
  it('finds the next departure in India time', () => {
    const daily = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    expect(nextDeparture('18:00', daily, noon)).toBe('Today 18:00');
    expect(nextDeparture('17:00', daily, noon)).toBe('Tomorrow 17:00');
    expect(nextDeparture('09:15', ['sat'], noon)).toBe('Sat 09:15');
    expect(nextDeparture('09:15', ['wed'], noon)).toBe('Wed 09:15');
    expect(nextDeparture(undefined, daily, noon)).toBeNull();
  });
});

describe('formatting', () => {
  it('formats delays, distinguishing unknown from on time', () => {
    expect(formatDelay(null)).toBe('Delay unknown');
    expect(formatDelay(0)).toBe('On time');
    expect(formatDelay(8)).toBe('8 min late');
    expect(formatDelay(-6)).toBe('6 min early');
    expect(formatDelay(75)).toBe('1 h 15 min late');
  });
  it('formats compact delays', () => {
    expect(formatDelayShort(null)).toBe('Delay unknown');
    expect(formatDelayShort(0)).toBe('On time');
    expect(formatDelayShort(8)).toBe('8m delay');
    expect(formatDelayShort(-6)).toBe('6m early');
    expect(formatDelayShort(75)).toBe('1h 15m delay');
  });
  it('formats ages', () => {
    const now = new Date('2026-10-01T12:00:00Z');
    expect(formatAge('2026-10-01T11:59:58Z', now)).toBe('just now');
    expect(formatAge('2026-10-01T11:59:20Z', now)).toBe('40s ago');
    expect(formatAge('2026-10-01T11:55:00Z', now)).toBe('5 min ago');
  });
  it('never renders missing numbers as zero', () => {
    expect(formatKm(null)).toBe('—');
    expect(formatPercent(undefined)).toBe('—');
    expect(formatPercent(62.4)).toBe('62%');
  });
});
