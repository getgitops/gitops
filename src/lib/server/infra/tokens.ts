import crypto from 'node:crypto';

const TOKEN_BYTES = 32;

/** SHA-256 of a token: what GitDB stores, so a leaked repository holds no usable link. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export type OneTimeToken = {
  /** Goes in the link and nowhere else. */
  token: string;
  /** Stored instead of the token. */
  hash: string;
  expiresAt: string;
};

/**
 * Random token for a single-use link (email verification, password reset…). The caller stores
 * `hash` and `expiresAt`, looks the token up by `hashToken()`, and clears both once it is used.
 */
export function createOneTimeToken(ttlMs: number, now: Date = new Date()): OneTimeToken {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  return {
    token,
    hash: hashToken(token),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
}

/** Whether a stored expiry is still in the future; a missing or broken value counts as expired. */
export function isTokenAlive(expiresAt: string | Date | null | undefined, now = Date.now()) {
  if (!expiresAt) return false;
  const time = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
  return Number.isFinite(time) && time > now;
}

const SIGNED_VERSION = 'v1';

/**
 * Stateless token `v1.<base64url(json)>.<hmac>` for links that are sent many times and must not
 * cost a write each (unsubscribe links in every email). Nothing is stored: the HMAC (keyed per
 * `purpose`) proves it was issued by this server, `exp` limits its life, and the caller makes it
 * single-use by putting a counter in the payload that it bumps when the token is used.
 */
export function signToken(
  purpose: string,
  payload: Record<string, unknown>,
  options: { secret: string; ttlMs: number; now?: number },
): string {
  const exp = Math.floor(((options.now ?? Date.now()) + options.ttlMs) / 1000);
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  return `${SIGNED_VERSION}.${body}.${signature(purpose, body, options.secret)}`;
}

/** The payload of a valid, unexpired token issued for `purpose`; `null` otherwise. */
export function verifySignedToken<T extends Record<string, unknown>>(
  purpose: string,
  token: string,
  options: { secret: string; now?: number },
): (T & { exp: number }) | null {
  const [version, body, mac, ...rest] = token.trim().split('.');
  if (version !== SIGNED_VERSION || !body || !mac || rest.length > 0) return null;

  const expected = Buffer.from(signature(purpose, body, options.secret), 'base64url');
  const received = Buffer.from(mac, 'base64url');
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object' || typeof payload.exp !== 'number') return null;
    if (payload.exp * 1000 <= (options.now ?? Date.now())) return null;
    return payload;
  } catch {
    return null;
  }
}

function signature(purpose: string, body: string, secret: string): string {
  // a key per purpose: a token minted for one kind of link is useless for another
  const key = crypto.createHmac('sha256', secret).update(`gitops:token:${purpose}`).digest();
  return crypto.createHmac('sha256', key).update(body).digest('base64url');
}
