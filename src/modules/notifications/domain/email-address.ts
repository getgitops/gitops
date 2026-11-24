import { domainToASCII } from 'node:url';

const MAX_EMAIL_LENGTH = 254;
const LOCAL_PART = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}$/;
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/** A domain in ASCII (punycode) and lower case, or `null` when it is not a valid host name. */
export function normalizeDomain(value: string): string | null {
  const trimmed = value.trim().replace(/\.$/, '');
  if (!trimmed || /[\s@/:]/.test(trimmed)) return null;
  // `domainToASCII` lower-cases and converts IDN (ñandú.es → xn--and-6ma2c.es); '' when invalid
  const ascii = domainToASCII(trimmed);
  if (!ascii || ascii.length > 253) return null;
  const labels = ascii.split('.');
  // at least a name and a TLD, and no IP literals
  if (labels.length < 2 || labels.every((label) => /^\d+$/.test(label))) return null;
  return labels.every((label) => LABEL.test(label)) ? ascii : null;
}

/**
 * `user@Example.COM` → `user@example.com` (domain normalized as in `normalizeDomain`, local part
 * kept as typed but lower-cased so the same mailbox is stored once), or `null` when invalid.
 */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return null;
  const local = trimmed.slice(0, at);
  const domain = normalizeDomain(trimmed.slice(at + 1));
  if (!domain || !LOCAL_PART.test(local) || local.startsWith('.') || local.endsWith('.')) {
    return null;
  }
  if (local.includes('..')) return null;
  const email = `${local.toLowerCase()}@${domain}`;
  return email.length <= MAX_EMAIL_LENGTH ? email : null;
}

/** Domain of an already normalized address. */
export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1);
}

/**
 * An allowed-domain entry: `empresa.com` (that domain only) or `*.empresa.com` (any subdomain,
 * not `empresa.com` itself). Normalized like `normalizeDomain`; `null` when invalid.
 */
export function normalizeDomainPattern(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith('*.')) {
    const domain = normalizeDomain(trimmed.slice(2));
    return domain ? `*.${domain}` : null;
  }
  return normalizeDomain(trimmed);
}

/** Exact match, or subdomain match for a `*.` pattern; there are no implicit subdomains. */
export function domainMatches(domain: string, pattern: string): boolean {
  if (pattern.startsWith('*.')) return domain.endsWith(pattern.slice(1));
  return domain === pattern;
}

export function isDomainAllowed(domain: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => domainMatches(domain, pattern));
}
