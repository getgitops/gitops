import { describe, expect, it } from 'vitest';
import {
  createOneTimeToken,
  hashToken,
  isTokenAlive,
  signToken,
  verifySignedToken,
} from './tokens';

const SECRET = 'test-secret';

describe('one-time tokens', () => {
  it('returns a random token, its SHA-256 hash and the expiry', () => {
    const now = new Date('2026-11-24T10:00:00.000Z');
    const first = createOneTimeToken(60_000, now);
    const second = createOneTimeToken(60_000, now);

    expect(first.token).not.toBe(second.token);
    expect(first.hash).toBe(hashToken(first.token));
    expect(first.hash).not.toContain(first.token);
    expect(first.expiresAt).toBe('2026-11-24T10:01:00.000Z');
  });

  it('treats missing, broken and past expiries as expired', () => {
    const now = Date.parse('2026-11-24T10:00:00.000Z');
    expect(isTokenAlive('2026-11-24T10:00:01.000Z', now)).toBe(true);
    expect(isTokenAlive('2026-11-24T10:00:00.000Z', now)).toBe(false);
    expect(isTokenAlive(null, now)).toBe(false);
    expect(isTokenAlive('not a date', now)).toBe(false);
  });
});

describe('signed tokens', () => {
  const now = Date.parse('2026-11-24T10:00:00.000Z');

  it('round-trips the payload until it expires', () => {
    const token = signToken(
      'unsubscribe',
      { rid: 'r1', v: 2 },
      { secret: SECRET, ttlMs: 60_000, now },
    );

    expect(verifySignedToken('unsubscribe', token, { secret: SECRET, now })).toMatchObject({
      rid: 'r1',
      v: 2,
    });
    expect(
      verifySignedToken('unsubscribe', token, { secret: SECRET, now: now + 60_000 }),
    ).toBeNull();
  });

  it('rejects tampered payloads, other purposes and other secrets', () => {
    const token = signToken(
      'unsubscribe',
      { rid: 'r1', v: 0 },
      { secret: SECRET, ttlMs: 60_000, now },
    );
    const [version, , mac] = token.split('.');
    const forged = `${version}.${Buffer.from(JSON.stringify({ rid: 'r2', v: 0, exp: 9e9 })).toString('base64url')}.${mac}`;

    expect(verifySignedToken('unsubscribe', forged, { secret: SECRET, now })).toBeNull();
    expect(verifySignedToken('verify', token, { secret: SECRET, now })).toBeNull();
    expect(verifySignedToken('unsubscribe', token, { secret: 'other', now })).toBeNull();
    expect(verifySignedToken('unsubscribe', 'garbage', { secret: SECRET, now })).toBeNull();
    expect(verifySignedToken('unsubscribe', `${token}.extra`, { secret: SECRET, now })).toBeNull();
  });
});
