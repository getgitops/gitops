import crypto from 'node:crypto';

export const SIGNATURE_HEADER = 'X-GitOps-Signature';
export const SIGNATURE_VERSION = 'v1';
/** Prefix of signing secrets, so a leaked one is easy to recognize (and to scan for). */
export const SIGNING_SECRET_PREFIX = 'whsec_';
const SECRET_BYTES = 32;

/** A new signing secret: `whsec_` + 32 random bytes in hex. The whole string is the HMAC key. */
export function generateSigningSecret(): string {
  return `${SIGNING_SECRET_PREFIX}${crypto.randomBytes(SECRET_BYTES).toString('hex')}`;
}

/** `HMAC-SHA256(secret, "<t>.<raw body>")` in hex. */
export function computeSignature(secret: string, timestamp: number, rawBody: string): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

/**
 * Value of `X-GitOps-Signature`: `t=<unix seconds>,v1=<hex>`, with one `v1=` per secret (newest
 * first). During a rotation's grace period both the new and the previous secret sign, so a
 * receiver still configured with the old one keeps accepting deliveries.
 */
export function signatureHeader(
  secrets: readonly string[],
  timestamp: number,
  rawBody: string,
): string {
  if (secrets.length === 0) throw new Error('A signed webhook needs at least one secret');
  const signatures = secrets.map(
    (secret) => `${SIGNATURE_VERSION}=${computeSignature(secret, timestamp, rawBody)}`,
  );
  return [`t=${timestamp}`, ...signatures].join(',');
}
