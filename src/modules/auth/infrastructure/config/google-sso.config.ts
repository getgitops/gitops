import * as env from '$app/env/private';
import { GoogleSsoConfig } from '../../domain/google-sso-config.domain';

function value(name: keyof typeof env): string | null {
  return env[name]?.trim() || null;
}

/**
 * Reads GOOGLE_SSO_* on every call so tests and config reloads see fresh values. Returns null when
 * Google sign-in is not configured and throws when it is configured inconsistently.
 */
export function readGoogleSsoConfig(): GoogleSsoConfig | null {
  const clientId = value('GOOGLE_SSO_CLIENT_ID');
  const clientSecret = value('GOOGLE_SSO_CLIENT_SECRET');
  if (!clientId && !clientSecret) return null;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_SSO_CLIENT_ID and GOOGLE_SSO_CLIENT_SECRET must be set together');
  }

  const autoProvision = ['1', 'true', 'yes', 'on'].includes(
    (value('GOOGLE_SSO_AUTO_PROVISION') ?? '').toLowerCase(),
  );

  return new GoogleSsoConfig(
    clientId,
    clientSecret,
    (value('GOOGLE_SSO_ALLOWED_DOMAINS') ?? '').split(/[\s,]+/),
    autoProvision,
  );
}
