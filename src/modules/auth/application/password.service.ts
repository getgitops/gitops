import crypto from 'crypto';

export class PasswordService {
  private static readonly HASH_PREFIX = 'scrypt';
  private static readonly HASH_KEY_LEN = 64;
  private static readonly HASH_SALT_BYTES = 16;

  ensureEncryptionKey(): string {
    const envKey = process.env.GITDB_ENCRYPTION_KEY?.trim();
    if (!envKey) {
      throw new Error('Missing GITDB_ENCRYPTION_KEY environment variable');
    }

    return envKey;
  }

  hashPassword(password: string): string {
    const salt = crypto.randomBytes(PasswordService.HASH_SALT_BYTES).toString('hex');
    const hash = crypto
      .scryptSync(this.applyPepper(password), salt, PasswordService.HASH_KEY_LEN)
      .toString('hex');

    return `${PasswordService.HASH_PREFIX}$${salt}$${hash}`;
  }

  verifyPassword(password: string, hash: string): boolean {
    const [, salt, storedHash] = hash.split('$');
    const computed = crypto
      .scryptSync(this.applyPepper(password), salt, PasswordService.HASH_KEY_LEN)
      .toString('hex');

    return this.safeEqualHex(storedHash, computed);
  }

  private applyPepper(password: string): string {
    const pepper = this.ensureEncryptionKey();
    return `${password}:${pepper}`;
  }

  private safeEqualHex(leftHex: string, rightHex: string): boolean {
    const left = Buffer.from(leftHex, 'hex');
    const right = Buffer.from(rightHex, 'hex');

    if (left.length !== right.length) {
      return false;
    }

    return crypto.timingSafeEqual(left, right);
  }
}
