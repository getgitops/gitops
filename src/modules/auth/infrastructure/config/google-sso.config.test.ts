import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readGoogleSsoConfig } from './google-sso.config';

const KEYS = [
  'GOOGLE_SSO_CLIENT_ID',
  'GOOGLE_SSO_CLIENT_SECRET',
  'GOOGLE_SSO_ALLOWED_DOMAINS',
  'GOOGLE_SSO_AUTO_PROVISION',
];

const original = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of KEYS) {
    original.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    const value = original.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function setCredentials() {
  process.env.GOOGLE_SSO_CLIENT_ID = 'client-123.apps.googleusercontent.com';
  process.env.GOOGLE_SSO_CLIENT_SECRET = 'super-secret';
}

describe('readGoogleSsoConfig', () => {
  it('returns null when Google sign-in is not configured', () => {
    expect(readGoogleSsoConfig()).toBeNull();
  });

  it('requires the client id and secret together', () => {
    process.env.GOOGLE_SSO_CLIENT_ID = 'client-123';
    expect(() => readGoogleSsoConfig()).toThrow(/must be set together/);

    delete process.env.GOOGLE_SSO_CLIENT_ID;
    process.env.GOOGLE_SSO_CLIENT_SECRET = 'super-secret';
    expect(() => readGoogleSsoConfig()).toThrow(/must be set together/);
  });

  it('reads the credentials with no domain restriction and no automatic sign-up by default', () => {
    setCredentials();
    expect(readGoogleSsoConfig()).toMatchObject({
      clientId: 'client-123.apps.googleusercontent.com',
      clientSecret: 'super-secret',
      allowedDomains: [],
      autoProvision: false,
    });
  });

  it('normalizes the allowed domains list', () => {
    setCredentials();
    process.env.GOOGLE_SSO_ALLOWED_DOMAINS = ' Gigigo.com, gigigo.com example.org,';
    expect(readGoogleSsoConfig()?.allowedDomains).toEqual(['gigigo.com', 'example.org']);
  });

  it('rejects invalid domains', () => {
    setCredentials();
    process.env.GOOGLE_SSO_ALLOWED_DOMAINS = 'gigigo.com,not_a_domain';
    expect(() => readGoogleSsoConfig()).toThrow(/valid domain/);
  });

  it('enables automatic sign-up only with allowed domains', () => {
    setCredentials();
    process.env.GOOGLE_SSO_AUTO_PROVISION = 'true';
    expect(() => readGoogleSsoConfig()).toThrow(/allowed Workspace domain/);

    process.env.GOOGLE_SSO_ALLOWED_DOMAINS = 'gigigo.com';
    expect(readGoogleSsoConfig()?.autoProvision).toBe(true);

    process.env.GOOGLE_SSO_AUTO_PROVISION = 'no';
    expect(readGoogleSsoConfig()?.autoProvision).toBe(false);
  });
});
