import crypto from 'crypto';

const VERSION = 'v1';
const IV_BYTES = 12;

export class SecretCipherService {
  constructor(private readonly masterKey: () => string) {}

  encrypt(plaintext: string, purpose: string): string {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.deriveKey(purpose), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return [
      VERSION,
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join(':');
  }

  decrypt(payload: string, purpose: string): string {
    const [version, iv, tag, ciphertext] = payload.split(':');
    if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
      throw new Error('Unsupported encrypted secret format');
    }

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.deriveKey(purpose),
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private deriveKey(purpose: string): Buffer {
    return Buffer.from(
      crypto.hkdfSync('sha256', this.masterKey(), Buffer.alloc(0), `gitops:${purpose}`, 32),
    );
  }
}
