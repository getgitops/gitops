import type { DatabaseClient } from '$lib/database/types';
import type { InstanceConfig } from '../../domain/entities';
import type { ConfigRepository } from '../../domain/repositories';

type ConfigRow = {
  public_access?: number | null;
  google_sso_enabled?: number | null;
  google_client_id?: string | null;
  google_client_secret?: string | null;
  saml_enabled?: number | null;
  saml_entry_point?: string | null;
  saml_issuer?: string | null;
  saml_cert?: string | null;
};

export class SqliteConfigRepository implements ConfigRepository {
  constructor(private readonly db: DatabaseClient) {}

  getConfig(): InstanceConfig | null {
    const row = this.db.get<ConfigRow>('SELECT * FROM config WHERE id = 1');
    if (!row) {
      return null;
    }

    const publicAccess = row.public_access !== undefined ? row.public_access === 1 : true;

    return {
      publicAccess,
      googleSsoEnabled: row.google_sso_enabled === 1,
      googleClientId: row.google_client_id,
      googleClientSecret: row.google_client_secret,
      samlEnabled: row.saml_enabled === 1,
      samlEntryPoint: row.saml_entry_point,
      samlIssuer: row.saml_issuer,
      samlCert: row.saml_cert,
    };
  }

  saveConfig(config: InstanceConfig): void {
    this.db.run(
      `
      INSERT INTO config (
        id, updated_at, public_access, google_sso_enabled,
        google_client_id, google_client_secret,
        saml_enabled, saml_entry_point, saml_issuer, saml_cert
      )
      VALUES (
        1, CURRENT_TIMESTAMP, @publicAccess, @googleSsoEnabled,
        @googleClientId, @googleClientSecret,
        @samlEnabled, @samlEntryPoint, @samlIssuer, @samlCert
      )
      ON CONFLICT(id) DO UPDATE SET
        public_access = excluded.public_access,
        google_sso_enabled = excluded.google_sso_enabled,
        google_client_id = excluded.google_client_id,
        google_client_secret = excluded.google_client_secret,
        saml_enabled = excluded.saml_enabled,
        saml_entry_point = excluded.saml_entry_point,
        saml_issuer = excluded.saml_issuer,
        saml_cert = excluded.saml_cert,
        updated_at = CURRENT_TIMESTAMP
    `,
      {
        publicAccess: config.publicAccess ? 1 : 0,
        googleSsoEnabled: config.googleSsoEnabled ? 1 : 0,
        googleClientId: config.googleClientId || null,
        googleClientSecret: config.googleClientSecret || null,
        samlEnabled: config.samlEnabled ? 1 : 0,
        samlEntryPoint: config.samlEntryPoint || null,
        samlIssuer: config.samlIssuer || null,
        samlCert: config.samlCert || null,
      },
    );
  }
}
