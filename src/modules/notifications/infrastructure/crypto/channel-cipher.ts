import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const KEY_SALT = 'gitops:notifications:channel-destination:v1';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

/** What an encrypted value is: a ciphertext of one purpose doesn't decrypt as another. */
export type ChannelSecretPurpose = 'destination' | 'signing-secret';

export interface ChannelCipher {
  encrypt(channelId: string, value: string, purpose?: ChannelSecretPurpose): string;
  decrypt(channelId: string, stored: string, purpose?: ChannelSecretPurpose): string;
}

/**
 * AES-256-GCM for channel destinations (same scheme as the vault secrets), keyed from
 * `GITDB_ENCRYPTION_KEY`. The channel id is authenticated data: a value copied onto another
 * channel does not decrypt.
 */
export function createChannelCipher(secret: () => string): ChannelCipher {
  let cached: { material: string; key: Buffer } | null = null;
  const key = () => {
    const material = secret().trim();
    if (!material) throw new Error('Missing GITDB_ENCRYPTION_KEY environment variable');
    if (cached?.material !== material) {
      cached = { material, key: crypto.scryptSync(material, KEY_SALT, 32) };
    }
    return cached.key;
  };
  // the destination keeps the original AAD, so channels stored before purposes existed decrypt
  const aad = (channelId: string, purpose: ChannelSecretPurpose = 'destination') =>
    Buffer.from(
      purpose === 'destination'
        ? `${VERSION}:channel:${channelId}`
        : `${VERSION}:channel:${channelId}:${purpose}`,
      'utf8',
    );

  return {
    encrypt(channelId, value, purpose) {
      const iv = crypto.randomBytes(IV_BYTES);
      const cipher = crypto.createCipheriv(ALGORITHM, key(), iv, {
        authTagLength: AUTH_TAG_BYTES,
      });
      cipher.setAAD(aad(channelId, purpose));
      const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return [
        VERSION,
        iv.toString('base64'),
        cipher.getAuthTag().toString('base64'),
        ciphertext.toString('base64'),
      ].join(':');
    },
    decrypt(channelId, stored, purpose) {
      const [version, iv, authTag, ciphertext, ...rest] = stored.split(':');
      if (version !== VERSION || !iv || !authTag || !ciphertext || rest.length > 0) {
        throw new Error(`Channel ${channelId} has no encrypted destination`);
      }
      try {
        const decipher = crypto.createDecipheriv(ALGORITHM, key(), Buffer.from(iv, 'base64'), {
          authTagLength: AUTH_TAG_BYTES,
        });
        decipher.setAAD(aad(channelId, purpose));
        decipher.setAuthTag(Buffer.from(authTag, 'base64'));
        return Buffer.concat([
          decipher.update(Buffer.from(ciphertext, 'base64')),
          decipher.final(),
        ]).toString('utf8');
      } catch {
        throw new Error(`Channel ${channelId} destination could not be decrypted`);
      }
    },
  };
}
