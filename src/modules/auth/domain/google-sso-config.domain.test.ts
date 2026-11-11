import { describe, expect, it } from 'vitest';
import { GoogleSsoConfig } from './google-sso-config.domain';

describe('GoogleSsoConfig', () => {
  it('accepts any hosted domain when no domain is restricted', () => {
    const config = new GoogleSsoConfig('id', 'secret', [], false);
    expect(config.allowsHostedDomain(undefined)).toBe(true);
    expect(config.allowsHostedDomain('anything.com')).toBe(true);
  });

  it('only accepts the allowed Workspace domains, case-insensitively', () => {
    const config = new GoogleSsoConfig('id', 'secret', ['gigigo.com'], false);
    expect(config.allowsHostedDomain('Gigigo.com')).toBe(true);
    expect(config.allowsHostedDomain('evil.com')).toBe(false);
    // a personal account has no hd claim, whatever its email suffix
    expect(config.allowsHostedDomain(undefined)).toBe(false);
  });

  it('auto-provisions only Workspace accounts of an allowed domain', () => {
    const config = new GoogleSsoConfig('id', 'secret', ['gigigo.com'], true);
    expect(config.allowsAutoProvision('gigigo.com')).toBe(true);
    expect(config.allowsAutoProvision('evil.com')).toBe(false);
    expect(config.allowsAutoProvision(undefined)).toBe(false);
    expect(
      new GoogleSsoConfig('id', 'secret', ['gigigo.com'], false).allowsAutoProvision('gigigo.com'),
    ).toBe(false);
  });

  it('refuses automatic sign-up without a domain restriction', () => {
    expect(() => new GoogleSsoConfig('id', 'secret', [], true)).toThrow(/allowed Workspace domain/);
  });

  it('requires the client credentials', () => {
    expect(() => new GoogleSsoConfig(' ', 'secret', [], false)).toThrow(/Client ID/);
    expect(() => new GoogleSsoConfig('id', '', [], false)).toThrow(/Client Secret/);
  });
});
