import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const KEY_SALT = 'gitops:state-iac:backend-credentials:v1';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export interface CredentialsCipher {
  encrypt(backendId: string, value: string): string;
  decrypt(backendId: string, stored: string): string;
}

/**
 * AES-256-GCM for backend credentials (same scheme as the notification channels), keyed from
 * `GITDB_ENCRYPTION_KEY`. The backend id is authenticated data: credentials copied onto another
 * backend do not decrypt.
 */
export function createCredentialsCipher(secret: () => string): CredentialsCipher {
  let cached: { material: string; key: Buffer } | null = null;
  const key = () => {
    const material = secret().trim();
    if (!material) throw new Error('Missing GITDB_ENCRYPTION_KEY environment variable');
    if (cached?.material !== material) {
      cached = { material, key: crypto.scryptSync(material, KEY_SALT, 32) };
    }
    return cached.key;
  };
  const aad = (backendId: string) => Buffer.from(`${VERSION}:state-backend:${backendId}`, 'utf8');

  return {
    encrypt(backendId, value) {
      const iv = crypto.randomBytes(IV_BYTES);
      const cipher = crypto.createCipheriv(ALGORITHM, key(), iv, {
        authTagLength: AUTH_TAG_BYTES,
      });
      cipher.setAAD(aad(backendId));
      const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return [
        VERSION,
        iv.toString('base64'),
        cipher.getAuthTag().toString('base64'),
        ciphertext.toString('base64'),
      ].join(':');
    },
    decrypt(backendId, stored) {
      const [version, iv, authTag, ciphertext, ...rest] = stored.split(':');
      if (version !== VERSION || !iv || !authTag || !ciphertext || rest.length > 0) {
        throw new Error(`State backend ${backendId} has no encrypted credentials`);
      }
      try {
        const decipher = crypto.createDecipheriv(ALGORITHM, key(), Buffer.from(iv, 'base64'), {
          authTagLength: AUTH_TAG_BYTES,
        });
        decipher.setAAD(aad(backendId));
        decipher.setAuthTag(Buffer.from(authTag, 'base64'));
        return Buffer.concat([
          decipher.update(Buffer.from(ciphertext, 'base64')),
          decipher.final(),
        ]).toString('utf8');
      } catch {
        throw new Error(`State backend ${backendId} credentials could not be decrypted`);
      }
    },
  };
}
