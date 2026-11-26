import { describe, expect, it } from 'vitest';
import { relativeTime } from './format';

const NOW = Date.parse('2026-11-25T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const H = 3_600_000;
const D = 24 * H;

describe('relativeTime', () => {
  it('uses minutes, hours, days, weeks, months and years in the locale', () => {
    expect(relativeTime(ago(3 * 60_000), 'es', NOW)).toBe('hace 3 minutos');
    expect(relativeTime(ago(2 * H), 'en', NOW)).toBe('2 hours ago');
    expect(relativeTime(ago(3 * D), 'es', NOW)).toBe('hace 3 días');
    expect(relativeTime(ago(14 * D), 'en', NOW)).toBe('2 weeks ago');
    expect(relativeTime(ago(76 * D), 'es', NOW)).toBe('hace 3 meses');
    expect(relativeTime(ago(800 * D), 'en', NOW)).toBe('2 years ago');
  });

  it('is null without a valid date', () => {
    expect(relativeTime(null, 'es', NOW)).toBeNull();
    expect(relativeTime('nope', 'es', NOW)).toBeNull();
  });
});
