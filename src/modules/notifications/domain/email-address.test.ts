import { describe, expect, it } from 'vitest';
import {
  domainMatches,
  emailDomain,
  isDomainAllowed,
  normalizeDomain,
  normalizeDomainPattern,
  normalizeEmail,
} from './email-address';

describe('normalizeEmail', () => {
  it('lower-cases and trims valid addresses', () => {
    expect(normalizeEmail('  Ana.Lopez+alerts@Partner.COM ')).toBe('ana.lopez+alerts@partner.com');
  });

  it('converts internationalized domains to punycode', () => {
    expect(normalizeEmail('pepe@ñandú.es')).toBe('pepe@xn--and-6ma2c.es');
  });

  it.each([
    '',
    'no-at-sign',
    '@partner.com',
    'ana@',
    'ana@localhost',
    'ana@127.0.0.1',
    'ana@partner..com',
    'ana..b@partner.com',
    'ana@-partner.com',
    'a b@partner.com',
    'ana@part ner.com',
  ])('rejects %j', (value) => {
    expect(normalizeEmail(value)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(normalizeEmail(42)).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe('domain patterns', () => {
  it('normalizes domains and wildcard patterns', () => {
    expect(normalizeDomain('Partner.COM.')).toBe('partner.com');
    expect(normalizeDomainPattern(' *.Partner.com ')).toBe('*.partner.com');
    expect(normalizeDomainPattern('ÑANDÚ.es')).toBe('xn--and-6ma2c.es');
  });

  it.each(['', '*', '*.', 'http://partner.com', 'ana@partner.com', 'partner', '*.*.com'])(
    'rejects the pattern %j',
    (value) => {
      expect(normalizeDomainPattern(value)).toBeNull();
    },
  );

  it('matches domains exactly, without implicit subdomains', () => {
    expect(domainMatches('partner.com', 'partner.com')).toBe(true);
    expect(domainMatches('eu.partner.com', 'partner.com')).toBe(false);
    expect(domainMatches('evilpartner.com', 'partner.com')).toBe(false);
  });

  it('matches subdomains only with an explicit wildcard', () => {
    expect(domainMatches('eu.partner.com', '*.partner.com')).toBe(true);
    expect(domainMatches('a.eu.partner.com', '*.partner.com')).toBe(true);
    expect(domainMatches('partner.com', '*.partner.com')).toBe(false);
    expect(domainMatches('evilpartner.com', '*.partner.com')).toBe(false);
  });

  it('checks the domain of the address against the list', () => {
    const email = normalizeEmail('ana@EU.partner.com')!;
    expect(emailDomain(email)).toBe('eu.partner.com');
    expect(isDomainAllowed(emailDomain(email), ['partner.com'])).toBe(false);
    expect(isDomainAllowed(emailDomain(email), ['partner.com', '*.partner.com'])).toBe(true);
    expect(isDomainAllowed(emailDomain(email), [])).toBe(false);
  });
});
