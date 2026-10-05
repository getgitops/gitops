import crypto from 'crypto';
import { env } from '$env/dynamic/private';
import type { VaultSecretValues } from '../../domain/vault.domain';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const KEY_SALT = 'gitops:vault:secret-values:v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

let cachedKey: { material: string; key: Buffer } | null = null;

function encryptionKey(): Buffer {
  const material = (env.VAULT_ENCRYPTION_KEY || env.GITDB_ENCRYPTION_KEY || '').trim();
  if (!material) {
    throw new Error('Missing VAULT_ENCRYPTION_KEY (or GITDB_ENCRYPTION_KEY) environment variable');
  }

  if (cachedKey?.material !== material) {
    cachedKey = { material, key: crypto.scryptSync(material, KEY_SALT, KEY_BYTES) };
  }

  return cachedKey.key;
}

// binding the ciphertext to its secret and environment makes a stored value unusable if it is
// copied onto another row or another environment of the same row
function additionalData(secretId: string, environmentSlug: string): Buffer {
  return Buffer.from(`${VERSION}:${secretId}:${environmentSlug}`, 'utf8');
}

export function isEncryptedSecretValue(value: string): boolean {
  return (
    typeof value === 'string' && value.startsWith(`${VERSION}:`) && value.split(':').length === 4
  );
}

export function encryptSecretValue(
  secretId: string,
  environmentSlug: string,
  value: string,
): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  cipher.setAAD(additionalData(secretId, environmentSlug));

  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);

  return [
    VERSION,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function decryptSecretValue(
  secretId: string,
  environmentSlug: string,
  stored: string,
): string {
  // rows written before encryption was introduced are still plaintext
  if (!isEncryptedSecretValue(stored)) return stored;

  const [, iv, authTag, ciphertext] = stored.split(':');

  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      encryptionKey(),
      Buffer.from(iv, 'base64'),
      { authTagLength: AUTH_TAG_BYTES },
    );
    decipher.setAAD(additionalData(secretId, environmentSlug));
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error(`No se pudo descifrar el secreto ${secretId} (${environmentSlug})`);
  }
}

export function encryptSecretValues(
  secretId: string,
  values: VaultSecretValues | undefined,
): VaultSecretValues {
  return Object.fromEntries(
    Object.entries(values ?? {}).map(([environmentSlug, value]) => [
      environmentSlug,
      encryptSecretValue(secretId, environmentSlug, String(value ?? '')),
    ]),
  );
}

export function decryptSecretValues(
  secretId: string,
  values: VaultSecretValues | undefined,
): VaultSecretValues {
  return Object.fromEntries(
    Object.entries(values ?? {}).map(([environmentSlug, value]) => [
      environmentSlug,
      decryptSecretValue(secretId, environmentSlug, String(value ?? '')),
    ]),
  );
}
