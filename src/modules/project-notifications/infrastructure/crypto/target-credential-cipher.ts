import crypto from 'crypto';
import { env } from '$env/dynamic/private';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function key(): Buffer {
  const material = env.GITDB_ENCRYPTION_KEY?.trim();
  if (!material) throw new Error('Missing GITDB_ENCRYPTION_KEY environment variable');
  return crypto.scryptSync(material, 'gitops:notification-target:v1', KEY_BYTES);
}

function additionalData(targetId: string, provider: string): Buffer {
  return Buffer.from(`${VERSION}:${targetId}:${provider}`, 'utf8');
}

export function encryptTargetCredential(
  targetId: string,
  provider: string,
  credential: string,
): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv, { authTagLength: AUTH_TAG_BYTES });
  cipher.setAAD(additionalData(targetId, provider));
  const ciphertext = Buffer.concat([cipher.update(credential, 'utf8'), cipher.final()]);
  return [
    VERSION,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function decryptTargetCredential(
  targetId: string,
  provider: string,
  stored: string,
): string {
  const [version, iv, authTag, ciphertext] = stored.split(':');
  if (version !== VERSION || !iv || !authTag || !ciphertext) {
    throw new Error('Invalid encrypted notification target credential');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key(), Buffer.from(iv, 'base64'), {
    authTagLength: AUTH_TAG_BYTES,
  });
  decipher.setAAD(additionalData(targetId, provider));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
