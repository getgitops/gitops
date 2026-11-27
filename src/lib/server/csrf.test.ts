import { describe, expect, it } from 'vitest';
import { isCsrfForbidden } from './csrf';

const ORIGIN = 'https://gitops.example.com';

function request(
  path: string,
  init: { method?: string; origin?: string | null; type?: string | null },
) {
  const headers = new Headers();
  if (init.origin) headers.set('origin', init.origin);
  if (init.type) headers.set('content-type', init.type);
  return {
    request: new Request(`${ORIGIN}${path}`, { method: init.method ?? 'POST', headers }),
    url: new URL(`${ORIGIN}${path}`),
  };
}

describe('isCsrfForbidden', () => {
  it.each([
    [
      'a form from another site',
      { origin: 'https://evil.example', type: 'application/x-www-form-urlencoded' },
      true,
    ],
    ['a form without Origin', { origin: null, type: 'multipart/form-data; boundary=x' }, true],
    [
      'an enhanced form with files',
      { origin: 'https://evil.example', type: 'application/x-sveltekit-formdata' },
      true,
    ],
    ['a POST without content type', { origin: null, type: null }, true],
    ['a same-origin form', { origin: ORIGIN, type: 'application/x-www-form-urlencoded' }, false],
    [
      'JSON from another site (CORS applies)',
      { origin: 'https://evil.example', type: 'application/json' },
      false,
    ],
    ['a GET', { method: 'GET', origin: 'https://evil.example', type: null }, false],
  ])('%s → %s', (_label, init, forbidden) => {
    const { request: req, url } = request('/org/acme/settings', init);
    expect(isCsrfForbidden(req, url)).toBe(forbidden);
  });

  it('lets only the signed Slack endpoints through without Origin', () => {
    for (const path of ['/api/slack/commands', '/api/slack/interactions']) {
      const { request: req, url } = request(path, { type: 'application/x-www-form-urlencoded' });
      expect(isCsrfForbidden(req, url)).toBe(false);
    }
    const { request: req, url } = request('/api/slack/commands/x', {
      type: 'application/x-www-form-urlencoded',
    });
    expect(isCsrfForbidden(req, url)).toBe(true);
  });
});
