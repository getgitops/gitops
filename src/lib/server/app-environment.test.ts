import { describe, expect, it, vi } from 'vitest';
import { faviconLinks, resolveAppEnvironment } from './app-environment';

describe('resolveAppEnvironment', () => {
  it.each(['local', 'development', 'production'] as const)('uses a valid value: %s', (value) => {
    expect(resolveAppEnvironment(value, false)).toBe(value);
    expect(resolveAppEnvironment(value, true)).toBe(value);
  });

  it('is case and whitespace tolerant', () => {
    expect(resolveAppEnvironment(' Development ', false)).toBe('development');
  });

  it('defaults to local in dev and production otherwise', () => {
    expect(resolveAppEnvironment(undefined, true)).toBe('local');
    expect(resolveAppEnvironment('', false)).toBe('production');
    expect(resolveAppEnvironment(undefined, false)).toBe('production');
  });

  it('falls back and reports an invalid value', () => {
    const onInvalid = vi.fn();
    expect(resolveAppEnvironment('staging', true, onInvalid)).toBe('local');
    expect(resolveAppEnvironment('staging', false, onInvalid)).toBe('production');
    expect(onInvalid).toHaveBeenCalledWith('staging');
  });

  it('does not report a missing value', () => {
    const onInvalid = vi.fn();
    resolveAppEnvironment(undefined, false, onInvalid);
    expect(onInvalid).not.toHaveBeenCalled();
  });
});

describe('faviconLinks', () => {
  it('points at the environment icons without an svg', () => {
    const html = faviconLinks('development');
    expect(html).toContain('/favicons/development-32.png');
    expect(html).toContain('rel="apple-touch-icon" href="/favicons/development-180.png"');
    expect(html).not.toContain('.svg');
  });

  it('adds the svg only for production', () => {
    expect(faviconLinks('production')).toContain('/favicons/production.svg');
    expect(faviconLinks('local')).not.toContain('production');
  });
});
