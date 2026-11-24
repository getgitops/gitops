import crypto from 'crypto';
import * as env from '$app/env/private';
import type { MonitorSecrets } from '../../domain/monitor.domain';

/**
 * AES-256-GCM for the header values and body of a monitor, with the same key material as the
 * vault (`VAULT_ENCRYPTION_KEY`, falling back to `GITDB_ENCRYPTION_KEY`) and its own salt. The
 * ciphertext is bound to the monitor id, so it is useless if copied onto another monitor.
 */
const ALGORITHM = 'aes-256-gcm';
const VERSION = 'm1';
const KEY_SALT = 'gitops:monitoring:request-secrets:v1';

let cachedKey: { material: string; key: Buffer } | null = null;

function encryptionKey(): Buffer {
  const material = (env.VAULT_ENCRYPTION_KEY || env.GITDB_ENCRYPTION_KEY || '').trim();
  if (!material) {
    throw new Error('Missing VAULT_ENCRYPTION_KEY (or GITDB_ENCRYPTION_KEY) environment variable');
  }
  if (cachedKey?.material !== material) {
    cachedKey = { material, key: crypto.scryptSync(material, KEY_SALT, 32) };
  }
  return cachedKey.key;
}

export function encryptMonitorSecrets(monitorId: string, secrets: MonitorSecrets): string | null {
  if (Object.keys(secrets.headers).length === 0 && !secrets.body) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(`${VERSION}:${monitorId}`, 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(secrets), 'utf8'),
    cipher.final(),
  ]);
  return [
    VERSION,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function decryptMonitorSecrets(monitorId: string, stored: string | null): MonitorSecrets {
  if (!stored) return { headers: {}, body: null };
  const [version, iv, tag, ciphertext] = stored.split(':');
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error(`Unreadable secrets for monitor ${monitorId}`);
  }
  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      encryptionKey(),
      Buffer.from(iv, 'base64'),
      {
        authTagLength: 16,
      },
    );
    decipher.setAAD(Buffer.from(`${VERSION}:${monitorId}`, 'utf8'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    const parsed = JSON.parse(plain) as Partial<MonitorSecrets>;
    return {
      headers: parsed.headers && typeof parsed.headers === 'object' ? parsed.headers : {},
      body: typeof parsed.body === 'string' ? parsed.body : null,
    };
  } catch {
    throw new Error(`Unreadable secrets for monitor ${monitorId}`);
  }
}
